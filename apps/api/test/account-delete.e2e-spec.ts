import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DB, type Db } from '../src/db/db.module.js';
import { user } from '../src/db/auth-schema.js';
import { generations, providerConnections, tracks } from '../src/db/schema.js';
import { signIn, type SignedIn } from './support/session.js';
import { as } from './support/session.js';
import { createTestApp, TEST_ORIGIN, type TestApp } from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

describe('account deletion (e2e)', () => {
  let t: TestApp;
  let db: Db;
  let ada: SignedIn;
  let grace: SignedIn;

  const deleteAccount = (session: SignedIn) =>
    request(t.app.getHttpServer())
      .post('/api/auth/delete-user')
      .set('Cookie', session.cookie)
      .set('Origin', TEST_ORIGIN)
      .send({ password: 'correct horse battery' });

  const object = { body: Buffer.from('x'), contentType: 'audio/mpeg' };

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get<Db>(DB);
  });

  beforeEach(async () => {
    await resetTestDb();
    vi.restoreAllMocks();
    t.audioStore.objects.clear();
    ada = await signIn(t);
    grace = await signIn(t, 'grace@example.com');
    const conn = await as(t, ada).post('/api/connections', {
      kind: 'music',
      adapter: 'kie',
      label: 'kie.ai',
      apiKey: 'sk-kie-good-1234',
    });
    const [generation] = await db
      .insert(generations)
      .values({
        userId: ada.userId,
        connectionId: conn.body.id,
        adapter: 'kie',
        status: 'complete',
        input: { idea: 'a song', instrumental: false, model: 'V5' },
      })
      .returning({ id: generations.id });
    await db.insert(tracks).values({
      generationId: generation!.id,
      userId: ada.userId,
      providerTrackId: 'p-1',
      title: 'Rain',
    });
    t.audioStore.objects.set(`users/${ada.userId}/tracks/a.mp3`, object);
    t.audioStore.objects.set(`users/${ada.userId}/tracks/a.jpg`, object);
    t.audioStore.objects.set(`users/${grace.userId}/tracks/g.mp3`, object);
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('deleting the account deletes the R2 prefix', async () => {
    const res = await deleteAccount(ada);

    expect(res.status).toBe(200);
    expect([...t.audioStore.objects.keys()]).toEqual([`users/${grace.userId}/tracks/g.mp3`]);
  });

  it("the user's connections, generations, and tracks are gone", async () => {
    await deleteAccount(ada);

    expect(await db.select().from(user).where(eq(user.id, ada.userId))).toEqual([]);
    expect(await db.select().from(providerConnections)).toEqual([]);
    expect(await db.select().from(generations)).toEqual([]);
    expect(await db.select().from(tracks)).toEqual([]);
    expect(await db.select().from(user).where(eq(user.id, grace.userId))).toHaveLength(1);
  });

  it('when the R2 delete fails, the user row stays', async () => {
    vi.spyOn(t.audioStore, 'deletePrefix').mockRejectedValueOnce(new Error('R2 is down'));

    const res = await deleteAccount(ada);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await db.select().from(user).where(eq(user.id, ada.userId))).toHaveLength(1);
    expect(await db.select().from(tracks)).toHaveLength(1);
  });
});
