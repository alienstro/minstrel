import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { DB, type Db } from '../src/db/db.module.js';
import { generations, tracks } from '../src/db/schema.js';
import { TracksService } from '../src/tracks/tracks.service.js';
import { insertUser, type SqlValues } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

const PROVIDER_URL = 'https://cdn.example.com/take.mp3';

describe('TracksService (e2e)', () => {
  let t: TestApp;
  let db: Db;
  let service: TracksService;
  let userId: string;
  let generationId: string;

  async function insertTrack(values: SqlValues<typeof tracks.$inferInsert> = {}): Promise<string> {
    const [row] = await db
      .insert(tracks)
      .values({
        generationId,
        userId,
        providerTrackId: randomUUID(),
        title: 'Rain',
        providerAudioUrl: PROVIDER_URL,
        ...values,
      })
      .returning({ id: tracks.id });
    return row!.id;
  }

  async function storedTrack(): Promise<{ id: string; audioKey: string; coverKey: string }> {
    const id = await insertTrack();
    const audioKey = `users/${userId}/tracks/${id}.wav`;
    const coverKey = `users/${userId}/tracks/${id}.jpg`;
    await db
      .update(tracks)
      .set({ storageStatus: 'stored', audioKey, coverKey, providerAudioUrl: null })
      .where(eq(tracks.id, id));
    return { id, audioKey, coverKey };
  }

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get<Db>(DB);
    service = t.app.get(TracksService);
  });

  beforeEach(async () => {
    await resetTestDb();
    t.audioStore.objects.clear();
    userId = await insertUser(db);
    const [generation] = await db
      .insert(generations)
      .values({
        userId,
        adapter: 'kie',
        status: 'complete',
        input: { idea: 'a song', instrumental: false, model: 'V5' },
      })
      .returning({ id: generations.id });
    generationId = generation!.id;
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('the list is newest first in pages of 50', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 52; i++) {
      ids.push(await insertTrack({ createdAt: sql`now() - make_interval(secs => ${100 - i})` }));
    }
    const newestFirst = [...ids].reverse();

    const first = await service.list(userId);
    expect(first.items.map((x) => x.id)).toEqual(newestFirst.slice(0, 50));
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await service.list(userId, first.nextCursor!);
    expect(second.items.map((x) => x.id)).toEqual(newestFirst.slice(50));
    expect(second.nextCursor).toBeNull();
  });

  it('a deleted cursor row does not end the list', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 52; i++) {
      ids.push(await insertTrack({ createdAt: sql`now() - make_interval(secs => ${100 - i})` }));
    }
    const first = await service.list(userId);
    // The user deletes the last song of the page before "Show more".
    await service.remove(userId, first.items.at(-1)!.id);

    const second = await service.list(userId, first.nextCursor!);

    expect(second.items.map((x) => x.id)).toEqual([ids[1], ids[0]]);
  });

  it('a cursor that is not valid gives 400', async () => {
    await expect(service.list(userId, 'not-a-cursor')).rejects.toMatchObject({ status: 400 });
  });

  it('rename changes the title', async () => {
    const id = await insertTrack();

    const renamed = await service.rename(userId, id, '  Night rain  ');

    expect(renamed).toMatchObject({ id, title: 'Night rain' });
    const [row] = await db.select().from(tracks).where(eq(tracks.id, id));
    expect(row!.title).toBe('Night rain');
  });

  it('remove deletes the row and both objects', async () => {
    const { id, audioKey, coverKey } = await storedTrack();
    const other = `users/${userId}/tracks/other.mp3`;
    for (const key of [audioKey, coverKey, other]) {
      t.audioStore.objects.set(key, { body: Buffer.from('x'), contentType: 'audio/wav' });
    }

    await service.remove(userId, id);

    expect(await db.select().from(tracks).where(eq(tracks.id, id))).toEqual([]);
    expect([...t.audioStore.objects.keys()]).toEqual([other]);
  });

  it('streamUrl gives the provider URL before the copy and a signed URL after it', async () => {
    const pending = await insertTrack();
    const { id, audioKey } = await storedTrack();

    expect(await service.streamUrl(userId, pending)).toBe(PROVIDER_URL);
    expect(await service.streamUrl(userId, id)).toBe(`https://r2.test/${audioKey}?signed=1`);
    expect(await service.streamUrl(userId, id, { download: true })).toBe(
      `https://r2.test/${audioKey}?signed=1&download=Rain.wav`,
    );
  });

  it("another user's track gives 404", async () => {
    const id = await insertTrack();
    const grace = await insertUser(db, 'grace@example.com');

    await expect(service.rename(grace, id, 'Mine')).rejects.toMatchObject({ status: 404 });
    await expect(service.remove(grace, id)).rejects.toMatchObject({ status: 404 });
    await expect(service.streamUrl(grace, id)).rejects.toMatchObject({ status: 404 });
    expect((await service.list(grace)).items).toEqual([]);
    expect(await db.select().from(tracks).where(eq(tracks.id, id))).toHaveLength(1);
  });

  it('an ID that is not a UUID gives 404', async () => {
    await expect(service.streamUrl(userId, 'abc')).rejects.toMatchObject({ status: 404 });
  });
});
