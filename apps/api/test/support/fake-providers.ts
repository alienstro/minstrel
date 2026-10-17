import { inputSchemaFor, type MusicAdapter } from '@minstrel/shared';
import type {
  ConnectionCheck,
  DecryptedConnection,
  DirectMusicProvider,
  JobMusicProvider,
  MusicTaskResult,
  TextProvider,
} from '../../src/providers/types.js';

// A key that contains "bad" fails the connection check. Every other key passes.
const check = async (conn: DecryptedConnection): Promise<ConnectionCheck> =>
  conn.apiKey.includes('bad')
    ? {
        ok: false,
        status: 'invalid_key',
        message: `${conn.label} did not accept this key.`,
      }
    : { ok: true };

export function fakeJobProvider(
  adapter: MusicAdapter,
  overrides: Partial<JobMusicProvider> = {},
): JobMusicProvider {
  return {
    adapter,
    flow: 'job',
    supportsCallback: true,
    displayName: `Fake ${adapter}`,
    defaultBaseUrl: `https://${adapter}.example.com`,
    keyUrl: `https://${adapter}.example.com/keys`,
    capabilities: {
      lyrics: true,
      style: true,
      providerTitle: true,
      instrumental: true,
      lengthSeconds: null,
      tracksPerRequest: 2,
    },
    inputSchema: inputSchemaFor(adapter),
    checkConnection: check,
    listModels: () => [{ id: 'V6', label: 'V6' }],
    submit: async () => ({ taskId: 'task-1' }),
    getTask: async (): Promise<MusicTaskResult> => ({
      state: 'pending',
      tracks: [],
    }),
    ...overrides,
  };
}

export function fakeDirectProvider(
  overrides: Partial<DirectMusicProvider> = {},
): DirectMusicProvider {
  return {
    adapter: 'elevenlabs',
    flow: 'direct',
    displayName: 'Fake ElevenLabs',
    defaultBaseUrl: 'https://elevenlabs.example.com',
    keyUrl: 'https://elevenlabs.example.com/keys',
    capabilities: {
      lyrics: true,
      style: true,
      providerTitle: false,
      instrumental: true,
      lengthSeconds: { min: 5, max: 180 },
      tracksPerRequest: 1,
    },
    inputSchema: inputSchemaFor('elevenlabs'),
    checkConnection: check,
    listModels: () => [{ id: 'music_v2_5', label: 'Music v2.5' }],
    compose: async () => [
      {
        body: new Response(new Uint8Array([1, 2, 3])).body!,
        contentType: 'audio/mpeg',
        durationSeconds: 150,
      },
    ],
    ...overrides,
  };
}

export const fakeMusicProviders = () => [
  fakeJobProvider('kie'),
  fakeJobProvider('suno_classic'),
];

export function fakeTextProvider(
  overrides: Partial<TextProvider> = {},
): TextProvider {
  return {
    adapter: 'openai_compatible',
    displayName: 'Fake text',
    defaultBaseUrl: 'https://text.example.com/v1',
    keyUrl: 'https://text.example.com/keys',
    complete: async () => ({ text: 'Fake lyrics' }),
    checkConnection: check,
    listModels: async () => [{ id: 'gpt-x', label: 'gpt-x' }],
    ...overrides,
  };
}
