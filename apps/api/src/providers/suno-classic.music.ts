import {
  type GenerationInput,
  inputSchemaFor,
  type ModelOption,
  type MusicCapabilities,
} from '@minstrel/shared';
import { safeFetch as defaultSafeFetch, type SafeFetch } from '../net/safe-fetch.js';
import { callEnvelope, checkEnvelope } from './envelope.js';
import { sunoMode } from './suno-mode.js';
import type {
  ConnectionCheck,
  DecryptedConnection,
  JobMusicProvider,
  MusicTaskResult,
  ProviderTrack,
} from './types.js';

// The docs show snake_case track fields. Some compatible services send camelCase, so both are read.
interface SunoTrack {
  id?: string;
  audio_url?: string;
  audioUrl?: string;
  stream_audio_url?: string;
  streamAudioUrl?: string;
  image_url?: string;
  imageUrl?: string;
  title?: string;
  duration?: number;
}

interface SunoDetails {
  status?: string;
  response?: { sunoData?: SunoTrack[] | null } | null;
  errorMessage?: string | null;
}

const MODELS: ModelOption[] = [
  { id: 'V6', label: 'V6', note: 'Natural vocals and rich detail' },
  { id: 'V6_MINI', label: 'V6 Mini', note: 'Fast' },
  { id: 'V6_WILD', label: 'V6 Wild', note: 'Bolder ideas' },
];

const PROGRESS: Record<string, MusicTaskResult['state']> = {
  PENDING: 'pending',
  TEXT_SUCCESS: 'text_ready',
  FIRST_SUCCESS: 'first_ready',
  SUCCESS: 'complete',
};

// Spec §5.1, from docs.sunoapi.org (Generate Music, Get Music Generation Details, Get Remaining
// Credits), checked 2026-10-17. Any service with the same API works with its own base URL.
export class SunoClassicMusicProvider implements JobMusicProvider {
  readonly adapter = 'suno_classic' as const;
  readonly flow = 'job' as const;
  readonly supportsCallback = true;
  readonly displayName = 'Suno-compatible';
  readonly defaultBaseUrl = 'https://apibox.erweima.ai';
  readonly keyUrl = 'https://sunoapi.org/api-key';
  readonly inputSchema = inputSchemaFor('suno_classic');
  readonly capabilities: MusicCapabilities = {
    lyrics: true,
    style: true,
    providerTitle: true,
    instrumental: true,
    lengthSeconds: null,
    tracksPerRequest: 2,
  };

  constructor(private readonly fetch: SafeFetch = defaultSafeFetch) {}

  listModels(): ModelOption[] {
    return MODELS;
  }

  checkConnection(conn: DecryptedConnection): Promise<ConnectionCheck> {
    return checkEnvelope(this.fetch, conn, '/api/v1/generate/credit');
  }

  async submit(
    conn: DecryptedConnection,
    input: GenerationInput,
    callbackUrl?: string,
  ): Promise<{ taskId: string }> {
    const data = await callEnvelope<{ taskId: string }>(this.fetch, conn, '/api/v1/generate', {
      method: 'POST',
      body: { ...toSunoInput(input), ...(callbackUrl ? { callBackUrl: callbackUrl } : {}) },
    });
    return { taskId: data.taskId };
  }

  async getTask(conn: DecryptedConnection, taskId: string): Promise<MusicTaskResult> {
    const details = await callEnvelope<SunoDetails>(
      this.fetch,
      conn,
      `/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
    );
    const tracks = tracksOf(details);
    const status = details.status ?? 'PENDING';
    const reason = details.errorMessage || 'no reason given';
    if (status === 'SENSITIVE_WORD_ERROR') {
      return { state: 'failed', tracks: [], reason, failureCode: 'content_rejected' };
    }
    // A failed callback does not fail the song. Finished takes still count.
    if (status === 'CALLBACK_EXCEPTION' && tracks.length > 0) return { state: 'complete', tracks };
    const state = PROGRESS[status];
    if (!state) return { state: 'failed', tracks: [], reason, failureCode: 'generation_failed' };
    return { state, tracks: state === 'pending' || state === 'text_ready' ? [] : tracks };
  }
}

export function toSunoInput(input: GenerationInput): Record<string, unknown> {
  const { custom, lyrics, title } = sunoMode(input);
  if (!custom) {
    return {
      customMode: false,
      instrumental: input.instrumental,
      model: input.model,
      prompt: input.idea,
      ...(input.style ? { style: input.style } : {}),
    };
  }
  return {
    customMode: true,
    instrumental: input.instrumental,
    model: input.model,
    title,
    ...(lyrics ? { lyrics } : {}),
    ...(input.style ? { style: input.style } : {}),
    ...(input.lengthSeconds ? { duration: input.lengthSeconds } : {}),
  };
}

// Before SUCCESS, a take can have only a stream URL. The sync updates the URL at complete.
function tracksOf(details: SunoDetails): ProviderTrack[] {
  return (details.response?.sunoData ?? []).flatMap((t) => {
    const audioUrl = t.audio_url || t.audioUrl || t.stream_audio_url || t.streamAudioUrl;
    if (!t.id || !audioUrl) return [];
    return [
      {
        providerTrackId: t.id,
        title: t.title,
        audioUrl,
        coverUrl: t.image_url || t.imageUrl,
        durationSeconds: t.duration,
      },
    ];
  });
}
