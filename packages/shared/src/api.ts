import { z } from 'zod';
import type { Adapter, MusicAdapter } from './adapters.js';
import type { ApiErrorBody } from './errors.js';
import type { GenerationInput } from './generation-input.js';

const adapterSchema = z.enum(['kie', 'suno_classic', 'elevenlabs', 'openai_compatible']);
const httpsUrl = z.url({ protocol: /^https$/ });

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// Connections (spec §4.2, §9)

export const createConnectionBodySchema = z.object({
  kind: z.enum(['music', 'text']),
  adapter: adapterSchema,
  label: z.string().trim().min(1).max(60),
  baseUrl: httpsUrl.optional(),
  apiKey: z.string().trim().min(8).max(500),
  defaultModel: z.string().trim().min(1).max(100).optional(),
});
export type CreateConnectionBody = z.infer<typeof createConnectionBodySchema>;

export const updateConnectionBodySchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    baseUrl: httpsUrl,
    apiKey: z.string().trim().min(8).max(500),
    defaultModel: z.string().trim().min(1).max(100),
  })
  .partial();
export type UpdateConnectionBody = z.infer<typeof updateConnectionBodySchema>;

export type ConnectionStatus = 'unchecked' | 'ok' | 'invalid_key' | 'unreachable';

export interface ConnectionDto {
  id: string;
  kind: 'music' | 'text';
  adapter: Adapter;
  label: string;
  baseUrl: string;
  keyLast4: string;
  defaultModel: string | null;
  status: ConnectionStatus;
  lastCheckedAt: string | null;
  createdAt: string;
}

// Providers (spec §3.2)

export interface MusicCapabilities {
  lyrics: boolean;
  style: boolean;
  providerTitle: boolean;
  instrumental: boolean;
  lengthSeconds: { min: number; max: number } | null;
  tracksPerRequest: number;
}

export interface ProviderInfo {
  adapter: Adapter;
  kind: 'music' | 'text';
  displayName: string;
  defaultBaseUrl: string;
  keyUrl: string;
  capabilities: MusicCapabilities | null;
}

export interface ModelOption {
  id: string;
  label: string;
  note?: string;
}

// Assist (spec §6)

export const assistBodySchema = z.object({
  connectionId: z.uuid(),
  task: z.enum(['lyrics', 'style', 'title']),
  /** The model to use. Without it, the connection's default model. */
  model: z.string().trim().min(1).max(200).optional(),
  idea: z.string().trim().min(1).max(3000),
  fields: z
    .object({
      lyrics: z.string().max(5000),
      style: z.string().max(1000),
      title: z.string().max(80),
    })
    .partial()
    .default({}),
});
export type AssistBody = z.infer<typeof assistBodySchema>;

export const assistResultSchema = z.object({ text: z.string().min(1) });
export type AssistResult = z.infer<typeof assistResultSchema>;

// Generations (spec §4.3, §5.2)

// The API checks `input` against inputSchemaFor(adapter) after it reads the connection.
export const createGenerationBodySchema = z.object({
  connectionId: z.uuid(),
  input: z.record(z.string(), z.unknown()),
});
export interface CreateGenerationBody {
  connectionId: string;
  input: GenerationInput;
}

export type GenerationStatus =
  | 'submitting'
  | 'pending'
  | 'text_ready'
  | 'first_ready'
  | 'queued'
  | 'running'
  | 'complete'
  | 'failed';

export type StorageStatus = 'pending' | 'stored' | 'copy_failed';

export interface TrackDto {
  id: string;
  generationId: string;
  title: string;
  style: string | null;
  lyrics: string | null;
  durationSeconds: number | null;
  storageStatus: StorageStatus;
  createdAt: string;
}

export interface GenerationDto {
  id: string;
  connectionId: string | null;
  adapter: MusicAdapter;
  flow: 'job' | 'direct';
  status: GenerationStatus;
  input: GenerationInput;
  error: ApiErrorBody | null;
  tracks: TrackDto[];
  createdAt: string;
  updatedAt: string;
}

// Tracks (spec §9)

export const renameTrackBodySchema = z.object({ title: z.string().trim().min(1).max(80) });
export type RenameTrackBody = z.infer<typeof renameTrackBodySchema>;
