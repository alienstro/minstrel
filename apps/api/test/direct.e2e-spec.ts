import { asc, eq, sql } from 'drizzle-orm';
import type { GenerationInput } from '@minstrel/shared';
import { DB, type Db } from '../src/db/db.module.js';
import { generations, tracks } from '../src/db/schema.js';
import { DirectRunner } from '../src/generations/direct-runner.js';
import type { DecryptedConnection, DirectTrack } from '../src/providers/types.js';
import { insertUser, type SqlValues } from './support/fixtures.js';
import { fakeDirectProvider, fakeJobProvider } from './support/fake-providers.js';
import { as, signIn, type SignedIn } from './support/session.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

type Compose = (conn: DecryptedConnection, input: GenerationInput, signal: AbortSignal) => Promise<DirectTrack[]>;

const song = (): DirectTrack[] => [
  { body: new Response(new Uint8Array([1, 2, 3])).body!, contentType: 'audio/mpeg', durationSeconds: 150 },
];

/** A compose call that waits until the test lets it end. */
function heldCompose() {
  const releases: Array<() => void> = [];
  const compose = vi.fn<Compose>(
    () => new Promise((resolve) => releases.push(() => resolve(song()))),
  );
  return { compose, releaseAll: () => releases.splice(0).forEach((r) => r()) };
}

describe('DirectRunner (e2e)', () => {
  let t: TestApp;
  let db: Db;
  let runner: DirectRunner;
  let ada: SignedIn;
  let connectionId: string;
  const compose = vi.fn<Compose>();

  async function queued(values: SqlValues<typeof generations.$inferInsert> = {}): Promise<string> {
    const [row] = await db
      .insert(generations)
      .values({
        userId: ada.userId,
        connectionId,
        adapter: 'elevenlabs',
        flow: 'direct',
        status: 'queued',
        input: { idea: 'a sea shanty about a lost cat', instrumental: false, model: 'music_v2_5', lengthSeconds: 150 },
        ...values,
      })
      .returning({ id: generations.id });
    return row!.id;
  }

  const row = async (id: string) =>
    (await db.select().from(generations).where(eq(generations.id, id)))[0]!;
  const statuses = async () =>
    (await db.select().from(generations).orderBy(asc(generations.createdAt))).map((g) => g.status);

  beforeAll(async () => {
    t = await createTestApp({
      musicProviders: [fakeJobProvider('kie'), fakeDirectProvider({ compose: (...args) => compose(...args) })],
    });
    db = t.app.get<Db>(DB);
    runner = t.app.get(DirectRunner);
  });

  beforeEach(async () => {
    await resetTestDb();
    compose.mockReset().mockImplementation(async () => song());
    t.audioStore.objects.clear();
    runner.abortAfterMs = 240_000;
    ada = await signIn(t);
    connectionId = (
      await as(t, ada).post('/api/connections', {
        kind: 'music',
        adapter: 'elevenlabs',
        label: 'ElevenLabs',
        apiKey: 'sk-el-good-1234',
      })
    ).body.id;
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('a direct song ends complete with one stored track', async () => {
    const id = await queued();

    await runner.start(id);

    expect(await row(id)).toMatchObject({ status: 'complete', leaseUntil: null, errorCode: null });
    const [track] = await db.select().from(tracks).where(eq(tracks.generationId, id));
    expect(track).toMatchObject({
      userId: ada.userId,
      title: 'a sea shanty about a lost cat',
      storageStatus: 'stored',
      durationSeconds: 150,
      providerAudioUrl: null,
      audioKey: `users/${ada.userId}/tracks/${track!.id}.mp3`,
    });
    expect(t.audioStore.objects.get(track!.audioKey!)).toMatchObject({ contentType: 'audio/mpeg' });
    expect(compose).toHaveBeenCalledTimes(1);
  });

  it('the 5th song stays queued and starts when one ends', async () => {
    const held = heldCompose();
    compose.mockImplementation(held.compose);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await queued({ createdAt: sql`now() - make_interval(secs => ${10 - i})` }));

    const running = ids.slice(0, 4).map((id) => runner.start(id));
    await vi.waitFor(() => expect(held.compose).toHaveBeenCalledTimes(4));
    await runner.start(ids[4]!);
    expect(await statuses()).toEqual(['running', 'running', 'running', 'running', 'queued']);

    held.releaseAll();
    await Promise.all(running);
    // A read or the sweep starts the queued rows in a new function call (spec §5.4 step 4).
    const next = runner.startQueued(ada.userId);
    await vi.waitFor(() => expect(held.compose).toHaveBeenCalledTimes(5));
    held.releaseAll();
    await next;

    expect(await statuses()).toEqual(['complete', 'complete', 'complete', 'complete', 'complete']);
  });

  it('two starts at the same time for one user never pass 4 running', async () => {
    const held = heldCompose();
    compose.mockImplementation(held.compose);
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(await queued());

    const all = Promise.all(ids.map((id) => runner.start(id)));
    await vi.waitFor(() => expect(held.compose).toHaveBeenCalledTimes(4));
    const counts = (await statuses()).reduce<Record<string, number>>((n, s) => ({ ...n, [s]: (n[s] ?? 0) + 1 }), {});
    expect(counts).toEqual({ running: 4, queued: 2 });

    held.releaseAll();
    await all;
    expect(held.compose).toHaveBeenCalledTimes(4);
  });

  it('another user has their own 4 places', async () => {
    const held = heldCompose();
    compose.mockImplementation(held.compose);
    const adaSongs: Array<Promise<void>> = [];
    for (let i = 0; i < 4; i++) adaSongs.push(runner.start(await queued()));
    await vi.waitFor(() => expect(held.compose).toHaveBeenCalledTimes(4));
    const grace = await insertUser(db, 'grace@example.com');
    const graceSong = await queued({ userId: grace, connectionId: null });

    await runner.start(graceSong);

    // Grace has no connection, so her song fails at once, but it was allowed to start.
    expect(await row(graceSong)).toMatchObject({ status: 'failed', errorCode: 'connection_removed' });
    held.releaseAll();
    await Promise.all(adaSongs);
  });

  it('an expired running lease becomes interrupted, and the fake provider gets no second call', async () => {
    const id = await queued({ status: 'running', leaseUntil: sql`now() - interval '1 second'` });
    const live = await queued({ status: 'running', leaseUntil: sql`now() + interval '5 minutes'` });

    await runner.expire();
    await runner.start(id);

    expect(await row(id)).toMatchObject({
      status: 'failed',
      errorCode: 'interrupted',
      errorMessage:
        'Minstrel stopped while ElevenLabs made this song. Minstrel did not send the request again, so you were not charged twice. Press Make song to try again.',
      leaseUntil: null,
    });
    expect((await row(live)).status).toBe('running');
    expect(compose).not.toHaveBeenCalled();
  });

  it('a call over 240 s is aborted and fails', async () => {
    runner.abortAfterMs = 30;
    let seen: AbortSignal | undefined;
    compose.mockImplementation(
      (_conn, _input, signal) =>
        new Promise((_resolve, reject) => {
          seen = signal;
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    const id = await queued();

    await runner.start(id);

    expect(seen?.aborted).toBe(true);
    expect(await row(id)).toMatchObject({
      status: 'failed',
      errorCode: 'provider_unavailable',
      errorMessage: 'ElevenLabs did not answer. Try again in a few minutes.',
      leaseUntil: null,
    });
    expect(t.audioStore.objects.size).toBe(0);
  });

  it('a provider error sets failed with its message', async () => {
    const { ApiError } = await import('../src/common/api-error.js');
    compose.mockRejectedValue(new ApiError(402, 'plan_required', 'ElevenLabs Music needs a paid ElevenLabs plan.'));
    const id = await queued();

    await runner.start(id);

    expect(await row(id)).toMatchObject({
      status: 'failed',
      errorCode: 'plan_required',
      errorMessage: 'ElevenLabs Music needs a paid ElevenLabs plan.',
    });
  });
});
