import {
  type GenerationInput,
  inputSchemaFor,
  type ModelOption,
  type MusicCapabilities,
} from '@minstrel/shared';
import { ApiError } from '../common/api-error.js';
import {
  safeFetch as defaultSafeFetch,
  type SafeFetch,
} from '../net/safe-fetch.js';
import { callEnvelope, checkEnvelope } from './envelope.js';
import { sunoMode } from './suno-mode.js';
import type {
  ConnectionCheck,
  DecryptedConnection,
  MusicProvider,
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

interface KieLyrics {
  text?: string;
  status?: 'complete' | 'failed';
  error_message?: string;
}

interface KieRecord {
  state?: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';
  response?: { data?: KieTrack[]; lyricsData?: KieLyrics[] } | null;
  resultJson?: string | null;
  failMsg?: string | null;
}

// docs.kie.ai, Generate Lyrics: the prompt has at most 200 characters.
const LYRICS_PROMPT_MAX = 200;
const LYRICS_POLL_MS = 2_000;
// The assist request must end well inside the 300 s function limit, also when each poll is slow.
const LYRICS_TIMEOUT_MS = 60_000;

const MODELS: ModelOption[] = [
  { id: 'V6', label: 'V6', note: 'Natural vocals and rich detail' },
  { id: 'V6_MINI', label: 'V6 Mini', note: 'Fast' },
  { id: 'V6_WILD', label: 'V6 Wild', note: 'Bolder ideas' },
];

// Spec §5.1, from docs.kie.ai (Generate Music, Get Task Details), checked 2026-10-17.
export class KieMusicProvider implements MusicProvider {
  readonly adapter = 'kie' as const;
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
    // kie.ai sends `duration` only in custom mode (see toKieInput).
    lengthSeconds: { min: 10, max: 360 },
    lengthAuto: true,
    lengthNeedsCustomMode: true,
    tracksPerRequest: 2,
  };

  constructor(
    private readonly fetch: SafeFetch = defaultSafeFetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly now: () => number = Date.now,
  ) {}

  listModels(): ModelOption[] {
    return MODELS;
  }

  checkConnection(conn: DecryptedConnection): Promise<ConnectionCheck> {
    return checkEnvelope(this.fetch, conn, '/api/v1/chat/credit');
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

  /** Writes lyrics with kie.ai Generate Lyrics. It gives the first complete version. */
  async writeLyrics(conn: DecryptedConnection, prompt: string): Promise<string> {
    const { taskId } = await callEnvelope<{ taskId: string }>(
      this.fetch,
      conn,
      '/api/v1/jobs/createTask',
      {
        method: 'POST',
        body: {
          model: 'ai-music-api/generate-lyrics',
          input: { prompt: prompt.trim().slice(0, LYRICS_PROMPT_MAX) },
        },
      },
    );
    const deadline = this.now() + LYRICS_TIMEOUT_MS;
    while (this.now() + LYRICS_POLL_MS <= deadline) {
      await this.sleep(LYRICS_POLL_MS);
      const record = await callEnvelope<KieRecord>(
        this.fetch,
        conn,
        `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      );
      if (record.state === 'fail') throw lyricsFailed(conn, record.failMsg);
      if (record.state !== 'success') continue;
      const versions = lyricsOf(record);
      const done = versions.find((v) => v.status === 'complete' && v.text?.trim());
      if (done) return done.text!;
      throw lyricsFailed(conn, versions.find((v) => v.error_message)?.error_message);
    }
    throw new ApiError(
      504,
      'provider_timeout',
      `${conn.label} did not finish the lyrics in time. Try again.`,
    );
  }
}

function lyricsFailed(conn: DecryptedConnection, reason?: string | null): ApiError {
  return new ApiError(
    502,
    'generation_failed',
    `${conn.label} could not write the lyrics: ${reason || 'no reason given'}`,
  );
}

function lyricsOf(record: KieRecord): KieLyrics[] {
  if (record.response?.lyricsData) return record.response.lyricsData;
  if (!record.resultJson) return [];
  try {
    const result = JSON.parse(record.resultJson) as {
      resultObject?: { lyricsData?: KieLyrics[] };
    };
    return result.resultObject?.lyricsData ?? [];
  } catch {
    return [];
  }
}

export function toKieInput(input: GenerationInput): Record<string, unknown> {
  const { custom, lyrics, title } = sunoMode(input);
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
    title,
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
