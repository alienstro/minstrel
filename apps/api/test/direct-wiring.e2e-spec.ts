import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import type { GenerationInput } from '@minstrel/shared';
import { DB, type Db } from '../src/db/db.module.js';
import { generations } from '../src/db/schema.js';
import { SweepService } from '../src/generations/sweep.service.js';
import type { DecryptedConnection, DirectTrack } from '../src/providers/types.js';
import type { SqlValues } from './support/fixtures.js';
import { fakeDirectProvider, fakeJobProvider } from './support/fake-providers.js';
import { as, signIn, type SignedIn } from './support/session.js';
import { createTestApp, TEST_CRON_SECRET, type TestApp } from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

type Compose = (conn: DecryptedConnection, input: GenerationInput, signal: AbortSignal) => Promise<DirectTrack[]>;

const song = (): DirectTrack[] => [
  { body: new Response(new Uint8Array([1, 2, 3])).body!, contentType: 'audio/mpeg', durationSeconds: 150 },
];
const input = { idea: 'a sea shanty', instrumental: false, model: 'music_v2_5', lengthSeconds: 150 };

describe('direct flow in submit, read, and sweep (e2e)', () => {
  let t: TestApp;
  let db: Db;
  let ada: SignedIn;
  let connectionId: string;
  const compose = vi.fn<Compose>();

  async function insertDirect(values: SqlValues<typeof generations.$inferInsert> = {}): Promise<string> {
    const [row] = await db
      .insert(generations)
      .values({
        userId: ada.userId,
        connectionId,
        adapter: 'elevenlabs',
        flow: 'direct',
        status: 'queued',
        input,
        ...values,
      })
      .returning({ id: generations.id });
    return row!.id;
  }

  const status = async (id: string) =>
    (await db.select().from(generations).where(eq(generations.id, id)))[0]!;

  beforeAll(async () => {
    t = await createTestApp({
      musicProviders: [fakeJobProvider('kie'), fakeDirectProvider({ compose: (...args) => compose(...args) })],
    });
    db = t.app.get<Db>(DB);
  });

  beforeEach(async () => {
    await resetTestDb();
    compose.mockReset().mockImplementation(async () => song());
    t.background.queue.length = 0;
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

  it('an ElevenLabs submit returns 202 queued and schedules one start', async () => {
    const res = await as(t, ada).post('/api/generations', { connectionId, input });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ adapter: 'elevenlabs', flow: 'direct', status: 'queued', tracks: [] });
    expect(compose).not.toHaveBeenCalled();
    expect(t.background.queue).toHaveLength(1);

    await t.background.drain();

    expect(compose).toHaveBeenCalledTimes(1);
    expect((await status(res.body.id)).status).toBe('complete');
  });

  it('a read finds an expired running lease and sets interrupted', async () => {
    const id = await insertDirect({ status: 'running', leaseUntil: sql`now() - interval '1 second'` });

    const first = await as(t, ada).get(`/api/generations/${id}`);
    expect(first.body.status).toBe('running');
    await t.background.drain();
    const second = await as(t, ada).get(`/api/generations/${id}`);

    expect(second.body).toMatchObject({
      status: 'failed',
      error: { code: 'interrupted' },
    });
    expect(compose).not.toHaveBeenCalled();
  });

  it('a read starts a queued row when the user has a free place', async () => {
    const id = await insertDirect();

    await as(t, ada).get('/api/generations');
    await t.background.drain();

    expect((await status(id)).status).toBe('complete');
  });

  it('a read of a job generation does no direct work', async () => {
    const [job] = await db
      .insert(generations)
      .values({
        userId: ada.userId,
        adapter: 'kie',
        flow: 'job',
        status: 'pending',
        providerTaskId: 'task-1',
        input: { idea: 'a song', instrumental: false, model: 'V6' },
        nextPollAt: sql`now() + interval '1 minute'`,
      })
      .returning({ id: generations.id });

    await as(t, ada).get(`/api/generations/${job!.id}`);

    expect(t.background.queue).toHaveLength(0);
  });

  it('the sweep starts a queued row when the user has a free place', async () => {
    const id = await insertDirect();
    const expired = await insertDirect({ status: 'running', leaseUntil: sql`now() - interval '1 second'` });

    const res = await request(t.app.getHttpServer())
      .get('/api/cron/sweep')
      .set('Authorization', `Bearer ${TEST_CRON_SECRET}`);

    expect(res.status).toBe(200);
    expect((await status(id)).status).toBe('complete');
    expect(await status(expired)).toMatchObject({ status: 'failed', errorCode: 'interrupted' });
    expect(compose).toHaveBeenCalledTimes(1);
  });

  it('a sweep that is past 30 s expires rows but starts no direct call', async () => {
    const id = await insertDirect();
    const clock = vi.fn<() => number>().mockReturnValueOnce(0).mockReturnValue(31_000);

    await t.app.get(SweepService).run(clock);

    expect((await status(id)).status).toBe('queued');
    expect(compose).not.toHaveBeenCalled();
  });
});
