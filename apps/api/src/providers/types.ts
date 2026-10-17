import type {
  AssistBody,
  AssistResult,
  GenerationInput,
  ModelOption,
  MusicAdapter,
  MusicCapabilities,
  TextAdapter,
} from '@minstrel/shared';
import type { ZodType } from 'zod';

// Spec §3.2. The API decrypts the key only for a provider call (spec §7.1).
export interface DecryptedConnection {
  id: string;
  userId: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string | null;
}

export type ConnectionCheck =
  | { ok: true }
  | { ok: false; status: 'invalid_key' | 'unreachable'; message: string };

export interface ProviderTrack {
  providerTrackId: string;
  title?: string;
  audioUrl: string;
  coverUrl?: string;
  durationSeconds?: number;
}

export interface MusicTaskResult {
  state: 'pending' | 'text_ready' | 'first_ready' | 'complete' | 'failed';
  tracks: ProviderTrack[];
  reason?: string;
  /** Spec §8: `content_rejected` for SENSITIVE_WORD_ERROR, else `generation_failed`. */
  failureCode?: 'generation_failed' | 'content_rejected';
}

export interface DirectTrack {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  durationSeconds?: number;
}

interface ProviderBase {
  readonly displayName: string;
  readonly defaultBaseUrl: string;
  /** Where the user gets a key, for the Settings page. */
  readonly keyUrl: string;
}

export interface MusicProviderBase extends ProviderBase {
  readonly adapter: MusicAdapter;
  readonly capabilities: MusicCapabilities;
  readonly inputSchema: ZodType<GenerationInput>;
  checkConnection(conn: DecryptedConnection): Promise<ConnectionCheck>;
  listModels(): ModelOption[];
}

export interface JobMusicProvider extends MusicProviderBase {
  readonly flow: 'job';
  readonly supportsCallback: boolean;
  submit(
    conn: DecryptedConnection,
    input: GenerationInput,
    callbackUrl?: string,
  ): Promise<{ taskId: string }>;
  getTask(conn: DecryptedConnection, taskId: string): Promise<MusicTaskResult>;
}

export interface DirectMusicProvider extends MusicProviderBase {
  readonly flow: 'direct';
  compose(
    conn: DecryptedConnection,
    input: GenerationInput,
    signal: AbortSignal,
  ): Promise<DirectTrack[]>;
}

export type MusicProvider = JobMusicProvider | DirectMusicProvider;

export type AssistRequest = Omit<AssistBody, 'connectionId'> & {
  model: string;
};

export interface TextProvider extends ProviderBase {
  readonly adapter: TextAdapter;
  complete(
    conn: DecryptedConnection,
    request: AssistRequest,
  ): Promise<AssistResult>;
  checkConnection(conn: DecryptedConnection): Promise<ConnectionCheck>;
  listModels(conn: DecryptedConnection): Promise<ModelOption[]>;
}
