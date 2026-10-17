import { randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import request from 'supertest';
import type { MockInstance } from 'vitest';
import { DB, type Db } from '../src/db/db.module.js';
import { generations, rateLimits, tracks } from '../src/db/schema.js';
import { SweepService } from '../src/generations/sweep.service.js';
import { SyncService } from '../src/generations/sync.service.js';
import { TrackCopier } from '../src/generations/track-copier.js';
import { insertUser } from './support/fixtures.js';
import { createTestApp, TEST_CRON_SECRET, type TestApp } from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

type NewGeneration = typeof generations.$inferInsert;
type GenerationValues = { [K in keyof NewGeneration]?: NewGeneration[K] | SQL };

describe('daily sweep (e2e)', () => {
  let t: TestApp;
  let db: Db;
  let userId: string;
  let sync: MockInstance<SyncService['sync']>;
  let copy: MockInstance<TrackCopier['copy']>;

  async function insertGeneration(values: GenerationValues = {}): Promise<string> {
    const [row] = await db
      .insert(generations)
      .values({
        userId,
        adapter: 'kie',
        flow: 'job',
        status: 'pending',
        providerTaskId: `task-${randomUUID()}`,
        input: { idea: 'a song', instrumental: false, model: 'V5' },
        nextPollAt: sql`now() - interval '1 second'`,
        ...values,
      })
      .returning({ id: generations.id });
    return row!.id;
  }

  async function insertTrack(generationId: string, values: Partial<typeof tracks.$inferInsert>) {
    const [row] = await db
      .insert(tracks)
      .values({
        generationId,
        userId,
        providerTrackId: randomUUID(),
        title: 'Take',
        providerAudioUrl: 'https://cdn.example.com/a.mp3',
        ...values,
      })
      .returning({ id: tracks.id });
    return row!.id;
  }

  const sweep = () => request(t.app.getHttpServer()).get('/api/cron/sweep');

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get<Db>(DB);
    sync = vi.spyOn(t.app.get(SyncService), 'sync');
    copy = vi.spyOn(t.app.get(TrackCopier), 'copy');
  });

  beforeEach(async () => {
    await resetTestDb();
    sync.mockReset().mockResolvedValue();
    copy.mockReset().mockResolvedValue();
    userId = await insertUser(db);
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('a missing or wrong token gives 401', async () => {
    const missing = await sweep();
    const wrong = await sweep().set('Authorization', 'Bearer not-the-secret');
    const right = await sweep().set('Authorization', `Bearer ${TEST_CRON_SECRET}`);

    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe('unauthorized');
    expect(wrong.status).toBe(401);
    expect(right.status).toBe(200);
  });

  it('due generations sync, at most 5 at a time', async () => {
    const due: string[] = [];
    for (let i = 0; i < 7; i++) due.push(await insertGeneration());
    await insertGeneration({ nextPollAt: sql`now() + interval '1 minute'` });
    let running = 0;
    let most = 0;
    sync.mockImplementation(async () => {
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 10));
      running--;
    });

    const res = await sweep().set('Authorization', `Bearer ${TEST_CRON_SECRET}`);

    expect(res.status).toBe(200);
    expect(sync).toHaveBeenCalledTimes(7);
    expect(sync.mock.calls.map(([id]) => id).sort()).toEqual([...due].sort());
    // Step 2 copies the tracks in batches, so a sweep sync starts no copy of its own.
    expect(sync.mock.calls.every(([, opts]) => opts?.ifDue === true && opts.startCopies === false)).toBe(true);
    expect(most).toBe(5);
  });

  it('a copy_failed track with 4 attempts is retried, and one with 5 is not', async () => {
    const done = await insertGeneration({ status: 'complete', nextPollAt: null });
    const four = await insertTrack(done, { storageStatus: 'copy_failed', copyAttempts: 4 });
    await insertTrack(done, { storageStatus: 'copy_failed', copyAttempts: 5 });
    const pending = await insertTrack(done, { storageStatus: 'pending' });
    await insertTrack(done, { storageStatus: 'stored', providerAudioUrl: null });
    // A first_ready URL can be a stream that still grows. The sync copies it at complete.
    const growing = await insertGeneration({ status: 'first_ready', nextPollAt: sql`now() + interval '1 minute'` });
    await insertTrack(growing, { storageStatus: 'pending' });

    await sweep().set('Authorization', `Bearer ${TEST_CRON_SECRET}`);

    expect(copy.mock.calls.map(([id]) => id).sort()).toEqual([four, pending].sort());
  });

  it('rate_limits rows past reset_at are deleted', async () => {
    await db.insert(rateLimits).values([
      { key: 'old', hits: 3, resetAt: sql`now() - interval '1 second'` },
      { key: 'live', hits: 1, resetAt: sql`now() + interval '1 minute'` },
    ]);

    await sweep().set('Authorization', `Bearer ${TEST_CRON_SECRET}`);

    const keys = (await db.select().from(rateLimits)).map((r) => r.key);
    expect(keys).toEqual(['live']);
  });

  it('no new work starts after 240 s', async () => {
    await insertGeneration();
    const done = await insertGeneration({ status: 'complete', nextPollAt: null });
    await insertTrack(done, { storageStatus: 'copy_failed', copyAttempts: 1 });
    await db.insert(rateLimits).values({ key: 'old', hits: 1, resetAt: sql`now() - interval '1 second'` });
    // The first reading starts the clock. Every later reading is past the 240 s limit.
    const clock = vi.fn<() => number>().mockReturnValueOnce(0).mockReturnValue(240_001);

    const result = await t.app.get(SweepService).run(clock);

    expect(result.stopped).toBe(true);
    expect(sync).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
    expect(await db.select().from(rateLimits)).toHaveLength(1);
  });
});
