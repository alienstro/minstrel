import { randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import type { MusicTaskResult } from '../src/providers/types.js';
import { DB, type Db } from '../src/db/db.module.js';
import { generations } from '../src/db/schema.js';
import { fakeJobProvider } from './support/fake-providers.js';
import { as, signIn, type SignedIn } from './support/session.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

type NewGeneration = typeof generations.$inferInsert;
type GenerationValues = { [K in keyof NewGeneration]?: NewGeneration[K] | SQL };

const DUE = sql`now() - interval '1 second'`;
const LATER = sql`now() + interval '1 minute'`;

describe('GET /api/generations (e2e)', () => {
  let t: TestApp;
  let db: Db;
  let ada: SignedIn;
  let connectionId: string;
  const getTask = vi.fn<() => Promise<MusicTaskResult>>();

  async function insertGeneration(values: GenerationValues = {}): Promise<string> {
    const [row] = await db
      .insert(generations)
      .values({
        userId: ada.userId,
        connectionId,
        adapter: 'kie',
        flow: 'job',
        status: 'pending',
        providerTaskId: `task-${randomUUID()}`,
        input: { idea: 'a song', instrumental: false, model: 'V5' },
        nextPollAt: DUE,
        ...values,
      })
      .returning({ id: generations.id });
    return row!.id;
  }

  beforeAll(async () => {
    t = await createTestApp({ musicProviders: [fakeJobProvider('kie', { getTask })] });
    db = t.app.get<Db>(DB);
  });

  beforeEach(async () => {
    await resetTestDb();
    getTask.mockReset();
    getTask.mockResolvedValue({ state: 'pending', tracks: [] });
    t.background.queue.length = 0;
    ada = await signIn(t);
    connectionId = (
      await as(t, ada).post('/api/connections', {
        kind: 'music',
        adapter: 'kie',
        label: 'kie.ai',
        apiKey: 'sk-kie-good-1234',
      })
    ).body.id;
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('a due generation schedules one sync and returns at once', async () => {
    const id = await insertGeneration();

    const res = await as(t, ada).get(`/api/generations/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, status: 'pending', tracks: [], error: null });
    expect(getTask).not.toHaveBeenCalled();
    expect(t.background.queue).toHaveLength(1);
    await t.background.drain();
    expect(getTask).toHaveBeenCalledTimes(1);
  });

  it('a generation that is not due schedules none', async () => {
    const later = await insertGeneration({ nextPollAt: LATER });
    const done = await insertGeneration({ status: 'complete', nextPollAt: null });

    expect((await as(t, ada).get(`/api/generations/${later}`)).status).toBe(200);
    expect((await as(t, ada).get(`/api/generations/${done}`)).status).toBe(200);

    expect(t.background.queue).toHaveLength(0);
  });

  it('two reads at the same time run one sync', async () => {
    const id = await insertGeneration();

    await Promise.all([
      as(t, ada).get(`/api/generations/${id}`),
      as(t, ada).get(`/api/generations/${id}`),
    ]);
    // Both reads saw a due row. The lease and the due check let only one sync call the provider.
    await Promise.all(t.background.queue.splice(0).map((task) => task()));
    await t.background.drain();

    expect(getTask).toHaveBeenCalledTimes(1);
  });

  it('a sync that starts after another sync polled the row does not poll again', async () => {
    const id = await insertGeneration();

    await as(t, ada).get(`/api/generations/${id}`);
    await as(t, ada).get(`/api/generations/${id}`);
    // One after the other: the first sync clears the lease and moves next_poll_at forward.
    await t.background.drain();

    expect(getTask).toHaveBeenCalledTimes(1);
  });

  it('the list schedules at most 5', async () => {
    for (let i = 0; i < 7; i++) await insertGeneration();
    await insertGeneration({ nextPollAt: LATER });

    const res = await as(t, ada).get('/api/generations');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(8);
    expect(res.body.nextCursor).toBeNull();
    expect(t.background.queue).toHaveLength(5);
  });

  it('the list gives cursor pages of 20, newest first', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 22; i++) {
      ids.push(await insertGeneration({ nextPollAt: LATER, createdAt: sql`now() - make_interval(secs => ${60 - i})` }));
    }
    const newestFirst = [...ids].reverse();

    const first = await as(t, ada).get('/api/generations');
    expect(first.body.items.map((g: { id: string }) => g.id)).toEqual(newestFirst.slice(0, 20));
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await as(t, ada).get(`/api/generations?cursor=${first.body.nextCursor}`);
    expect(second.body.items.map((g: { id: string }) => g.id)).toEqual(newestFirst.slice(20));
    expect(second.body.nextCursor).toBeNull();
  });

  it("another user's id gives 404", async () => {
    const id = await insertGeneration();
    const grace = await signIn(t, 'grace@example.com');

    const res = await as(t, grace).get(`/api/generations/${id}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
    expect(t.background.queue).toHaveLength(0);
    const list = await as(t, grace).get('/api/generations');
    expect(list.body.items).toEqual([]);
  });

  it('an id that is not a UUID gives 404', async () => {
    expect((await as(t, ada).get('/api/generations/abc')).status).toBe(404);
  });
});
