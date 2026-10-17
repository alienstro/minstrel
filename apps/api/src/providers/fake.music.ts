import { randomUUID } from 'node:crypto';
import {
  type GenerationInput,
  inputSchemaFor,
  type ModelOption,
  type MusicCapabilities,
} from '@minstrel/shared';
import type {
  ConnectionCheck,
  DecryptedConnection,
  MusicProvider,
  MusicTaskResult,
} from './types.js';

const CALLBACK_DELAY_MS = 500;

// Only for the local end-to-end test (MINSTREL_FAKE_PROVIDERS=1). It takes the place of kie, calls the
// webhook like kie does, and ends each task at once with 2 takes. The take URLs do not resolve, so the
// R2 copy fails and the player uses the provider URL (spec §5.5).
export class FakeMusicProvider implements MusicProvider {
  readonly adapter = 'kie' as const;
  readonly supportsCallback = true;
  readonly displayName = 'kie.ai (fake)';
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

  listModels(): ModelOption[] {
    return [{ id: 'V6', label: 'V6', note: 'Fake' }];
  }

  async checkConnection(): Promise<ConnectionCheck> {
    return { ok: true };
  }

  async submit(
    _conn: DecryptedConnection,
    _input: GenerationInput,
    callbackUrl?: string,
  ): Promise<{ taskId: string }> {
    if (callbackUrl) {
      setTimeout(() => {
        fetch(callbackUrl, { method: 'POST' }).catch(() => {
          // A failed callback is not an error: the sync on read still polls.
        });
      }, CALLBACK_DELAY_MS);
    }
    return { taskId: `fake-${randomUUID()}` };
  }

  async getTask(_conn: DecryptedConnection, taskId: string): Promise<MusicTaskResult> {
    return {
      state: 'complete',
      tracks: [1, 2].map((n) => ({
        providerTrackId: `${taskId}-${n}`,
        title: `Fake take ${n}`,
        audioUrl: `https://fake-audio.invalid/${taskId}-${n}.mp3`,
        durationSeconds: 30,
      })),
    };
  }
}
