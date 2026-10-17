import { FakeMusicProvider } from './fake.music.js';
import { musicProvidersFromEnv } from './registry.js';
import type { DecryptedConnection } from './types.js';

const conn: DecryptedConnection = {
  id: 'c1',
  userId: 'u1',
  adapter: 'kie',
  label: 'kie.ai',
  baseUrl: 'https://api.kie.ai',
  apiKey: 'fake-key',
  defaultModel: null,
};
const input = { idea: 'a sea shanty', instrumental: false, model: 'V6' };

describe('FakeMusicProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('submit calls the callback URL soon after', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    const { taskId } = await new FakeMusicProvider().submit(conn, input, 'http://localhost:3000/api/webhooks/kie/g1?t=x');
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);

    expect(taskId).toMatch(/^fake-/);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/webhooks/kie/g1?t=x', { method: 'POST' });
  });

  it('getTask gives a complete task with 2 takes', async () => {
    const result = await new FakeMusicProvider().getTask(conn, 'fake-1');

    expect(result.state).toBe('complete');
    expect(result.tracks.map((t) => t.providerTrackId)).toEqual(['fake-1-1', 'fake-1-2']);
    expect(result.tracks[0]).toMatchObject({ title: 'Fake take 1', durationSeconds: 30 });
  });
});

describe('musicProvidersFromEnv', () => {
  it('uses the real providers without the flag', () => {
    const providers = musicProvidersFromEnv({});
    expect(providers.map((p) => p.adapter)).toEqual(['kie']);
    expect(providers.some((p) => p instanceof FakeMusicProvider)).toBe(false);
  });

  it('replaces kie with the fake with the flag', () => {
    const providers = musicProvidersFromEnv({ MINSTREL_FAKE_PROVIDERS: '1' });
    expect(providers.map((p) => p.adapter)).toEqual(['kie']);
    expect(providers[0]).toBeInstanceOf(FakeMusicProvider);
  });
});
