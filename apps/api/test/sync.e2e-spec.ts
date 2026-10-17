import { asc, eq, sql, type SQL } from 'drizzle-orm';
import { ConnectionsService } from '../src/connections/connections.service.js';
import { DB, type Db } from '../src/db/db.module.js';
import { generations, tracks } from '../src/db/schema.js';
import { SyncService } from '../src/generations/sync.service.js';
import { mapProviderError } from '../src/providers/provider-error.js';
import type { MusicTaskResult } from '../src/providers/types.js';
import { insertUser } from './support/fixtures.js';
import { fakeJobProvider } from './support/fake-providers.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

type NewGeneration = typeof generations.$inferInsert;
type GenerationValues = { [K in keyof NewGeneration]?: NewGeneration[K] | SQL };

const take = (n: number, url = `https://cdn.example.com/${n}.mp3`) => ({
  providerTrackId: `p-${n}`,
  title: `Take ${n}`,
  audioUrl: url,
  coverUrl: `https://cdn.example.com/${n}.jpeg`,
  durationSeconds: 120,
});

describe('SyncService (e2e)', () => {
  let t: TestApp;
  let db: Db;
  let sync: SyncService;
  let userId: string;
  let connectionId: string;
  const getTask = vi.fn<() => Promise<MusicTaskResult>>();

  async function insertGeneration(values: GenerationValues = {}): Promise<string> {
    const [row] = await db
      .insert(generations)
      .values({
        userId,
        connectionId,
        adapter: 'kie',
        flow: 'job',
        status: 'pending',
        providerTaskId: 'task-1',
        input: { idea: 'a song about rain', instrumental: false, model: 'V5' },
        nextPollAt: sql`now() - interval '1 second'`,
        ...values,
      })
      .returning({ id: generations.id });
    return row!.id;
  }

  async function generation(id: string) {
    const [row] = await db.select().from(generations).where(eq(generations.id, id));
    return row!;
  }

  const trackRows = (id: string) =>
    db
      .select()
      .from(tracks)
      .where(eq(tracks.generationId, id))
      .orderBy(asc(tracks.providerTrackId));

  beforeAll(async () => {
    t = await createTestApp({ musicProviders: [fakeJobProvider('kie', { getTask })] });
    db = t.app.get<Db>(DB);
    sync = t.app.get(SyncService);
  });

  beforeEach(async () => {
    await resetTestDb();
    getTask.mockReset();
    t.background.queue.length = 0;
    userId = await insertUser(db);
    const conn = await t.app.get(ConnectionsService).create(userId, {
      kind: 'music',
      adapter: 'kie',
      label: 'kie.ai',
      apiKey: 'sk-kie-good-1234',
    });
    connectionId = conn.id;
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('a complete task stores 2 tracks and sets complete', async () => {
    getTask.mockResolvedValue({ state: 'complete', tracks: [take(1), take(2)] });
    const id = await insertGeneration();

    await sync.sync(id);

    expect(await generation(id)).toMatchObject({
      status: 'complete',
      leaseUntil: null,
      nextPollAt: null,
      pollAttempts: 1,
    });
    const rows = await trackRows(id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      userId,
      providerTrackId: 'p-1',
      title: 'Take 1',
      storageStatus: 'pending',
      providerAudioUrl: 'https://cdn.example.com/1.mp3',
      providerCoverUrl: 'https://cdn.example.com/1.jpeg',
      durationSeconds: 120,
    });
    // One copy for each new track.
    expect(t.background.queue).toHaveLength(2);
  });

  it('a sync with startCopies false leaves the copies to the caller', async () => {
    getTask.mockResolvedValue({ state: 'complete', tracks: [take(1), take(2)] });
    const id = await insertGeneration();

    await sync.sync(id, { startCopies: false });

    expect(await generation(id)).toMatchObject({ status: 'complete' });
    expect((await trackRows(id)).map((r) => r.storageStatus)).toEqual(['pending', 'pending']);
    expect(t.background.queue).toHaveLength(0);
  });

  it('the same track twice stays one row', async () => {
    getTask
      .mockResolvedValueOnce({ state: 'first_ready', tracks: [take(1), take(1)] })
      .mockResolvedValueOnce({
        state: 'complete',
        tracks: [take(1, 'https://cdn.example.com/1-final.mp3'), take(2)],
      });
    const id = await insertGeneration();

    await sync.sync(id);
    expect(await trackRows(id)).toHaveLength(1);
    expect((await generation(id)).status).toBe('first_ready');
    // A first_ready URL can be a stream that still grows, so the copy waits for complete.
    expect(t.background.queue).toHaveLength(0);

    await sync.sync(id);

    const rows = await trackRows(id);
    expect(rows.map((r) => r.providerTrackId)).toEqual(['p-1', 'p-2']);
    expect(rows[0]!.providerAudioUrl).toBe('https://cdn.example.com/1-final.mp3');
    expect(t.background.queue).toHaveLength(2);
  });

  it('a callback before provider_task_id is saved changes nothing and keeps the row due', async () => {
    const id = await insertGeneration({ status: 'submitting', providerTaskId: null });
    const before = await generation(id);

    await sync.sync(id);

    expect(getTask).not.toHaveBeenCalled();
    expect(await generation(id)).toMatchObject({
      status: 'submitting',
      leaseUntil: null,
      pollAttempts: 0,
      nextPollAt: before.nextPollAt,
    });
  });

  it('a removed connection gives connection_removed', async () => {
    const id = await insertGeneration();
    await t.app.get(ConnectionsService).remove(userId, connectionId);

    await sync.sync(id);

    expect(getTask).not.toHaveBeenCalled();
    expect(await generation(id)).toMatchObject({
      status: 'failed',
      errorCode: 'connection_removed',
      errorMessage:
        'You removed the key for this song before it finished. Add a key, then make the song again.',
      leaseUntil: null,
      nextPollAt: null,
    });
  });

  it('30 minutes after submit gives provider_timeout', async () => {
    getTask.mockResolvedValue({ state: 'pending', tracks: [] });
    const id = await insertGeneration({ createdAt: sql`now() - interval '31 minutes'` });

    await sync.sync(id);

    expect(await generation(id)).toMatchObject({
      status: 'failed',
      errorCode: 'provider_timeout',
      errorMessage: 'kie.ai did not finish this song in 30 minutes.',
      leaseUntil: null,
      nextPollAt: null,
    });
  });

  it('a provider 500 keeps the row due with the next backoff', async () => {
    getTask.mockRejectedValue(mapProviderError(500, 'oops', 'kie.ai'));
    const id = await insertGeneration({ pollAttempts: 1 });

    await sync.sync(id);

    expect(await generation(id)).toMatchObject({
      status: 'pending',
      pollAttempts: 2,
      leaseUntil: null,
      errorCode: null,
    });
    // Two polls are done, so the next delay is 300 s.
    const [{ seconds }] = (
      await db.execute<{ seconds: number }>(
        sql`SELECT extract(epoch FROM next_poll_at - now())::int AS seconds FROM generations WHERE id = ${id}`,
      )
    ).rows as [{ seconds: number }];
    expect(seconds).toBeGreaterThan(290);
    expect(seconds).toBeLessThanOrEqual(300);
  });

  it('a provider 401 on the poll gives invalid_key at once', async () => {
    getTask.mockRejectedValue(mapProviderError(401, '', 'kie.ai'));
    const id = await insertGeneration();

    await sync.sync(id);

    expect(await generation(id)).toMatchObject({
      status: 'failed',
      errorCode: 'invalid_key',
      errorMessage: 'kie.ai did not accept this key. Check the key in Settings → Connections.',
      nextPollAt: null,
      leaseUntil: null,
    });
  });

  it('a failed task keeps the provider reason in the message', async () => {
    getTask.mockResolvedValue({ state: 'failed', tracks: [], reason: 'the model is busy.' });
    const id = await insertGeneration();

    await sync.sync(id);

    expect(await generation(id)).toMatchObject({
      status: 'failed',
      errorCode: 'generation_failed',
      errorMessage: 'kie.ai could not make this song: the model is busy.',
    });
  });

  it('a row under a live lease is not synced', async () => {
    const id = await insertGeneration({ leaseUntil: sql`now() + interval '1 minute'` });

    await sync.sync(id);

    expect(getTask).not.toHaveBeenCalled();
  });
});
