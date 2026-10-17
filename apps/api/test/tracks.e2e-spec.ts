import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DB, type Db } from '../src/db/db.module.js';
import { generations, tracks } from '../src/db/schema.js';
import { as, signIn, type SignedIn } from './support/session.js';
import { createTestApp, TEST_ORIGIN, type TestApp } from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

describe('/api/tracks routes (e2e)', () => {
  let t: TestApp;
  let db: Db;
  let ada: SignedIn;
  let trackId: string;
  let audioKey: string;

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get<Db>(DB);
  });

  beforeEach(async () => {
    await resetTestDb();
    ada = await signIn(t);
    const [generation] = await db
      .insert(generations)
      .values({
        userId: ada.userId,
        adapter: 'kie',
        status: 'complete',
        input: { idea: 'a song', instrumental: false, model: 'V5' },
      })
      .returning({ id: generations.id });
    const [track] = await db
      .insert(tracks)
      .values({
        generationId: generation!.id,
        userId: ada.userId,
        providerTrackId: 'p-1',
        title: 'Rain',
        storageStatus: 'stored',
      })
      .returning({ id: tracks.id });
    trackId = track!.id;
    audioKey = `users/${ada.userId}/tracks/${trackId}.mp3`;
    await db.update(tracks).set({ audioKey }).where(eq(tracks.id, trackId));
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('the routes give 401 without a session', async () => {
    const server = t.app.getHttpServer();
    const id = randomUUID();
    const replies = await Promise.all([
      request(server).get('/api/tracks'),
      request(server).get(`/api/tracks/${id}/stream`),
      request(server).get(`/api/tracks/${id}/download`),
      request(server).patch(`/api/tracks/${id}`).set('Origin', TEST_ORIGIN).send({ title: 'x' }),
      request(server).delete(`/api/tracks/${id}`).set('Origin', TEST_ORIGIN),
    ]);

    expect(replies.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
  });

  it('the list gives the user tracks', async () => {
    const res = await as(t, ada).get('/api/tracks');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [{ id: trackId, title: 'Rain' }], nextCursor: null });
  });

  it('stream gives 302 to the signed URL', async () => {
    const res = await as(t, ada).get(`/api/tracks/${trackId}/stream`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`https://r2.test/${audioKey}?signed=1`);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('download gives 302 to the attachment URL', async () => {
    const res = await as(t, ada).get(`/api/tracks/${trackId}/download`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`https://r2.test/${audioKey}?signed=1&download=Rain.mp3`);
  });

  it('PATCH with an empty title gives 400 invalid_input', async () => {
    const res = await as(t, ada).patch(`/api/tracks/${trackId}`, { title: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_input');
    expect(res.body.fields).toHaveProperty('title');
  });

  it('PATCH renames and DELETE removes', async () => {
    const renamed = await as(t, ada).patch(`/api/tracks/${trackId}`, { title: 'Night rain' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ id: trackId, title: 'Night rain' });

    const removed = await as(t, ada).delete(`/api/tracks/${trackId}`);
    expect(removed.status).toBe(204);
    expect((await as(t, ada).get(`/api/tracks/${trackId}/stream`)).status).toBe(404);
  });
});
