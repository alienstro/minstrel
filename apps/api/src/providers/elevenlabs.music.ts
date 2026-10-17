import {
  type GenerationInput,
  inputSchemaFor,
  type ModelOption,
  type MusicCapabilities,
} from '@minstrel/shared';
import { ApiError } from '../common/api-error.js';
import { safeFetch as defaultSafeFetch, type SafeFetch } from '../net/safe-fetch.js';
import { errorFromResponse, mapProviderError } from './provider-error.js';
import type {
  ConnectionCheck,
  DecryptedConnection,
  DirectMusicProvider,
  DirectTrack,
} from './types.js';

const MODELS: ModelOption[] = [
  { id: 'music_v2_5', label: 'Music v2.5', note: 'Newest' },
  { id: 'music_v2', label: 'Music v2' },
  { id: 'music_v1', label: 'Music v1' },
];

// The form default (spec §10.2). Without a length the model chooses one, which can pass the
// 300 s function limit (spec §5.4).
const DEFAULT_LENGTH_SECONDS = 150;
// The runner aborts the call after 240 s. These timers are a little longer, so the runner decides.
const COMPOSE_TIMEOUT_MS = 250_000;
const CHECK_TIMEOUT_MS = 30_000;

/** Spec §5.1: the style, the idea, then "Lyrics:" and the lyrics. An instrumental sends no lyrics. */
export function elevenLabsPrompt(input: GenerationInput): string {
  const lyrics = input.instrumental ? undefined : input.lyrics?.trim();
  return [input.style?.trim(), input.idea.trim(), lyrics ? `Lyrics:\n${lyrics}` : undefined]
    .filter(Boolean)
    .join('\n\n');
}

// Spec §5.1, from elevenlabs.io/docs (Compose music), checked 2026-10-17. The reply is the audio
// file, so this is the direct flow (spec §5.4).
export class ElevenLabsMusicProvider implements DirectMusicProvider {
  readonly adapter = 'elevenlabs' as const;
  readonly flow = 'direct' as const;
  readonly displayName = 'ElevenLabs Music';
  readonly defaultBaseUrl = 'https://api.elevenlabs.io';
  readonly keyUrl = 'https://elevenlabs.io/app/settings/api-keys';
  readonly inputSchema = inputSchemaFor('elevenlabs');
  readonly capabilities: MusicCapabilities = {
    lyrics: true,
    style: true,
    // ElevenLabs takes no title. Minstrel keeps the title for its own list.
    providerTitle: false,
    instrumental: true,
    lengthSeconds: { min: 5, max: 180 },
    tracksPerRequest: 1,
  };

  constructor(private readonly fetch: SafeFetch = defaultSafeFetch) {}

  listModels(): ModelOption[] {
    return MODELS;
  }

  async checkConnection(conn: DecryptedConnection): Promise<ConnectionCheck> {
    try {
      const response = await this.fetch(`${base(conn)}/v1/user`, {
        headers: { 'xi-api-key': conn.apiKey },
        totalTimeoutMs: CHECK_TIMEOUT_MS,
      });
      if (response.ok) {
        await response.body?.cancel();
        return { ok: true };
      }
      const error = await errorFromResponse(response, conn.label);
      return {
        ok: false,
        status: error.code === 'invalid_key' ? 'invalid_key' : 'unreachable',
        message: error.message,
      };
    } catch {
      const error = mapProviderError(0, '', conn.label);
      return { ok: false, status: 'unreachable', message: error.message };
    }
  }

  async compose(
    conn: DecryptedConnection,
    input: GenerationInput,
    signal: AbortSignal,
  ): Promise<DirectTrack[]> {
    const seconds = input.lengthSeconds ?? DEFAULT_LENGTH_SECONDS;
    let response;
    try {
      response = await this.fetch(`${base(conn)}/v1/music?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': conn.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: elevenLabsPrompt(input),
          model_id: input.model,
          music_length_ms: seconds * 1000,
          force_instrumental: input.instrumental,
        }),
        signal,
        firstByteTimeoutMs: COMPOSE_TIMEOUT_MS,
        totalTimeoutMs: COMPOSE_TIMEOUT_MS,
      });
    } catch (error) {
      // The runner stopped the call. Its reason tells the runner what happened.
      if (signal.aborted) throw signal.reason;
      throw error instanceof ApiError ? error : mapProviderError(0, '', conn.label);
    }
    // Spec §8: the key passed the connection test, so a 401 or 403 here means the plan has no Music API.
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new ApiError(402, 'plan_required', 'ElevenLabs Music needs a paid ElevenLabs plan.');
    }
    if (!response.ok || !response.body) throw await errorFromResponse(response, conn.label);
    return [
      {
        body: response.body as ReadableStream<Uint8Array>,
        contentType: response.headers.get('content-type') ?? 'audio/mpeg',
        durationSeconds: seconds,
      },
    ];
  }
}

const base = (conn: DecryptedConnection) => conn.baseUrl.replace(/\/+$/, '');
