import { sql, type SQL } from 'drizzle-orm';
import { DB, type Db } from '../src/db/db.module.js';
import { generations } from '../src/db/schema.js';
import { GenerationsRepo } from '../src/generations/generations.repo.js';
import { insertUser } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

type NewGeneration = typeof generations.$inferInsert;
// A test row can set a time column with SQL, so that Postgres now() decides the time.
type GenerationValues = { [K in keyof NewGeneration]?: NewGeneration[K] | SQL };

describe('GenerationsRepo lease (e2e)', () => {
  let t: TestApp;
  let db: Db;
  let repo: GenerationsRepo;
  let userId: string;

  async function insertGeneration(values: GenerationValues = {}): Promise<string> {
    const [row] = await db
      .insert(generations)
      .values({
        userId,
        adapter: 'kie',
        flow: 'job',
        status: 'pending',
        input: { idea: 'a song', instrumental: false, model: 'V5' },
        ...values,
      })
      .returning({ id: generations.id });
    return row!.id;
  }

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get<Db>(DB);
    repo = t.app.get(GenerationsRepo);
  });

  beforeEach(async () => {
    await resetTestDb();
    userId = await insertUser(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('two claims at the same time: exactly one wins', async () => {
    const id = await insertGeneration();

    const results = await Promise.all([repo.claimLease(id, 90), repo.claimLease(id, 90)]);

    expect(results.filter((r) => r !== null)).toHaveLength(1);
    const winner = results.find((r) => r !== null)!;
    expect(winner.id).toBe(id);
    expect(winner.leaseUntil).toBeInstanceOf(Date);
  });

  it('an expired lease can be claimed again', async () => {
    const live = await insertGeneration({ leaseUntil: sql`now() + interval '1 minute'` });
    const expired = await insertGeneration({ leaseUntil: sql`now() - interval '1 second'` });

    expect(await repo.claimLease(live, 90)).toBeNull();
    expect((await repo.claimLease(expired, 90))?.id).toBe(expired);
  });

  it('due uses Postgres now(), not the app clock', async () => {
    const due = await insertGeneration({ nextPollAt: sql`now() - interval '1 second'` });
    await insertGeneration({ nextPollAt: sql`now() + interval '1 minute'` });
    await insertGeneration({ status: 'complete', nextPollAt: sql`now() - interval '1 second'` });
    // An app clock one day ahead would make the second row due too.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 86_400_000 });

    const rows = await repo.dueJobGenerations(5);

    expect(rows.map((r) => r.id)).toEqual([due]);
  });

  it('due keeps to one user when a userId is given', async () => {
    const otherUser = await insertUser(db, 'grace@example.com');
    const mine = await insertGeneration({ nextPollAt: sql`now() - interval '1 second'` });
    await insertGeneration({
      userId: otherUser,
      nextPollAt: sql`now() - interval '1 second'`,
    });

    const rows = await repo.dueJobGenerations(5, userId);

    expect(rows.map((r) => r.id)).toEqual([mine]);
  });

  it('expiredRunning gives only running direct rows with an expired lease', async () => {
    const expired = await insertGeneration({
      adapter: 'elevenlabs',
      flow: 'direct',
      status: 'running',
      leaseUntil: sql`now() - interval '1 second'`,
    });
    await insertGeneration({
      adapter: 'elevenlabs',
      flow: 'direct',
      status: 'running',
      leaseUntil: sql`now() + interval '5 minutes'`,
    });
    await insertGeneration({ adapter: 'elevenlabs', flow: 'direct', status: 'queued' });

    const rows = await repo.expiredRunning(5);

    expect(rows.map((r) => r.id)).toEqual([expired]);
  });
});
