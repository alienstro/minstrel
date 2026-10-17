import {
  type GenerationInput,
  inputSchemaFor,
  type ModelOption,
  type MusicCapabilities,
} from '@minstrel/shared';
import {
  safeFetch as defaultSafeFetch,
  type SafeFetch,
} from '../net/safe-fetch.js';
import { callEnvelope } from './envelope.js';
import type {
  ConnectionCheck,
  DecryptedConnection,
  JobMusicProvider,
  MusicTaskResult,
  ProviderTrack,
} from './types.js';

interface KieTrack {
  id?: string;
  audio_url?: string;
  image_url?: string;
  title?: string;
  duration?: number;
}

interface KieRecord {
  state?: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';
  response?: { data?: KieTrack[] } | null;
  resultJson?: string | null;
  failMsg?: string | null;
}

const MODELS: ModelOption[] = [
  { id: 'V6', label: 'V6', note: 'Natural vocals and rich detail' },
  { id: 'V6_MINI', label: 'V6 Mini', note: 'Fast' },
  { id: 'V6_WILD', label: 'V6 Wild', note: 'Bolder ideas' },
];

// Spec §5.1, from docs.kie.ai (Generate Music, Get Task Details), checked 2026-10-17.
export class KieMusicProvider implements JobMusicProvider {
  readonly adapter = 'kie' as const;
  readonly flow = 'job' as const;
  readonly supportsCallback = true;
  readonly displayName = 'kie.ai';
  readonly defaultBaseUrl = 'https://api.kie.ai';
  readonly keyUrl = 'https://kie.ai/api-key';
  readonly inputSchema = inputSchemaFor('kie');
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

  async checkConnection(conn: DecryptedConnection): Promise<ConnectionCheck> {
    try {
      await callEnvelope<number>(this.fetch, conn, '/api/v1/chat/credit');
      return { ok: true };
    } catch (error) {
      const { code, message } = error as { code?: string; message: string };
      return {
        ok: false,
        status: code === 'invalid_key' ? 'invalid_key' : 'unreachable',
        message,
      };
    }
  }

  async submit(
    conn: DecryptedConnection,
    input: GenerationInput,
    callbackUrl?: string,
  ): Promise<{ taskId: string }> {
    const data = await callEnvelope<{ taskId: string }>(
      this.fetch,
      conn,
      '/api/v1/jobs/createTask',
      {
        method: 'POST',
        body: {
          model: 'ai-music-api/generate',
          ...(callbackUrl ? { callBackUrl: callbackUrl } : {}),
          input: toKieInput(input),
        },
      },
    );
    return { taskId: data.taskId };
  }

  async getTask(
    conn: DecryptedConnection,
    taskId: string,
  ): Promise<MusicTaskResult> {
    const record = await callEnvelope<KieRecord>(
      this.fetch,
      conn,
      `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    );
    if (record.state === 'fail') {
      return {
        state: 'failed',
        tracks: [],
        reason: record.failMsg || 'no reason given',
        failureCode: 'generation_failed',
      };
    }
    if (record.state !== 'success') return { state: 'pending', tracks: [] };
    return { state: 'complete', tracks: tracksOf(record) };
  }
}

// Custom mode sings the given lyrics, or makes an instrumental in the given style. It needs a title.
// Without lyrics, the non-custom mode writes lyrics from the idea.
export function toKieInput(input: GenerationInput): Record<string, unknown> {
  const lyrics = input.instrumental
    ? undefined
    : input.lyrics?.trim() || undefined;
  const custom =
    Boolean(lyrics) || (input.instrumental && Boolean(input.style));
  if (!custom) {
    return {
      custom_mode: false,
      instrumental: input.instrumental,
      model: input.model,
      prompt: input.idea,
      ...(input.style ? { style: input.style } : {}),
    };
  }
  return {
    custom_mode: true,
    instrumental: input.instrumental,
    model: input.model,
    title: input.title || input.idea.slice(0, 80),
    ...(lyrics ? { lyrics } : {}),
    ...(input.style ? { style: input.style } : {}),
    ...(input.lengthSeconds ? { duration: input.lengthSeconds } : {}),
  };
}

function tracksOf(record: KieRecord): ProviderTrack[] {
  let items = record.response?.data;
  if (!items && record.resultJson) {
    try {
      items = (JSON.parse(record.resultJson) as { data?: KieTrack[] }).data;
    } catch {
      items = undefined;
    }
  }
  return (items ?? [])
    .filter((t): t is KieTrack & { id: string; audio_url: string } =>
      Boolean(t.id && t.audio_url),
    )
    .map((t) => ({
      providerTrackId: t.id,
      title: t.title,
      audioUrl: t.audio_url,
      coverUrl: t.image_url,
      durationSeconds: t.duration,
    }));
}
