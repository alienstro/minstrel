import { eq } from 'drizzle-orm';
import { Response } from 'undici';
import { DB, type Db } from '../src/db/db.module.js';
import { generations, tracks } from '../src/db/schema.js';
import { TrackCopier } from '../src/generations/track-copier.js';
import type { SafeFetch } from '../src/net/safe-fetch.js';
import { insertUser } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { resetTestDb } from './support/test-db.js';

const AUDIO_URL = 'https://cdn.example.com/take-1.mp3';
const COVER_URL = 'https://cdn.example.com/take-1.jpeg';
const MB = 1024 * 1024;

/** A body of `size` bytes in 1 MB chunks, so the test never holds the whole file. */
function bodyOf(size: number): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(MB);
  let left = size;
  return new ReadableStream({
    pull(controller) {
      if (left <= 0) return controller.close();
      const n = Math.min(left, MB);
      controller.enqueue(n === MB ? chunk : chunk.subarray(0, n));
      left -= n;
    },
  });
}

type Reply = { status?: number; type: string; size: number };

describe('TrackCopier (e2e)', () => {
  let t: TestApp;
  let db: Db;
  let copier: TrackCopier;
  let userId: string;
  let trackId: string;
  const replies = new Map<string, Reply>();

  const fetch: SafeFetch = async (url) => {
    const reply = replies.get(url);
    if (!reply) throw new Error(`unexpected fetch ${url}`);
    return new Response(bodyOf(reply.size), {
      status: reply.status ?? 200,
      headers: { 'content-type': reply.type },
    });
  };

  async function track() {
    const [row] = await db.select().from(tracks).where(eq(tracks.id, trackId));
    return row!;
  }

  beforeAll(async () => {
    t = await createTestApp({ safeFetch: fetch });
    db = t.app.get<Db>(DB);
    copier = t.app.get(TrackCopier);
  });

  beforeEach(async () => {
    await resetTestDb();
    t.audioStore.objects.clear();
    replies.clear();
    userId = await insertUser(db);
    const [generation] = await db
      .insert(generations)
      .values({
        userId,
        adapter: 'kie',
        flow: 'job',
        status: 'first_ready',
        input: { idea: 'a song', instrumental: false, model: 'V5' },
      })
      .returning({ id: generations.id });
    const [row] = await db
      .insert(tracks)
      .values({
        generationId: generation!.id,
        userId,
        providerTrackId: 'p-1',
        title: 'Take 1',
        providerAudioUrl: AUDIO_URL,
        providerCoverUrl: COVER_URL,
      })
      .returning({ id: tracks.id });
    trackId = row!.id;
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('a good copy sets stored and clears provider URLs', async () => {
    replies.set(AUDIO_URL, { type: 'audio/wav', size: 2048 });
    replies.set(COVER_URL, { type: 'image/jpeg', size: 512 });

    await copier.copy(trackId);

    const row = await track();
    const audioKey = `users/${userId}/tracks/${trackId}.wav`;
    const coverKey = `users/${userId}/tracks/${trackId}.jpg`;
    expect(row).toMatchObject({
      storageStatus: 'stored',
      audioKey,
      coverKey,
      providerAudioUrl: null,
      providerCoverUrl: null,
      copyAttempts: 0,
    });
    expect(t.audioStore.objects.get(audioKey)).toMatchObject({ contentType: 'audio/wav' });
    expect(t.audioStore.objects.get(audioKey)!.body).toHaveLength(2048);
    expect(t.audioStore.objects.get(coverKey)).toMatchObject({ contentType: 'image/jpeg' });
  });

  it('an HTTP 404 sets copy_failed and keeps provider_audio_url', async () => {
    replies.set(AUDIO_URL, { status: 404, type: 'text/plain', size: 9 });

    await copier.copy(trackId);

    expect(await track()).toMatchObject({
      storageStatus: 'copy_failed',
      copyAttempts: 1,
      audioKey: null,
      providerAudioUrl: AUDIO_URL,
      providerCoverUrl: COVER_URL,
    });
    expect(t.audioStore.objects.size).toBe(0);
  });

  it('a 51 MB file sets copy_failed', async () => {
    replies.set(AUDIO_URL, { type: 'audio/mpeg', size: 51 * MB });

    await copier.copy(trackId);

    expect(await track()).toMatchObject({ storageStatus: 'copy_failed', copyAttempts: 1 });
    expect(t.audioStore.objects.size).toBe(0);
  });

  it('a cover that is not image/ is skipped', async () => {
    replies.set(AUDIO_URL, { type: 'application/octet-stream', size: 1024 });
    replies.set(COVER_URL, { type: 'text/html', size: 64 });

    await copier.copy(trackId);

    const row = await track();
    expect(row).toMatchObject({
      storageStatus: 'stored',
      audioKey: `users/${userId}/tracks/${trackId}.mp3`,
      coverKey: null,
      providerCoverUrl: null,
    });
    expect([...t.audioStore.objects.keys()]).toEqual([row.audioKey]);
    expect(t.audioStore.objects.get(row.audioKey!)).toMatchObject({ contentType: 'audio/mpeg' });
  });

  it('a stored track is not copied again', async () => {
    await db.update(tracks).set({ storageStatus: 'stored' }).where(eq(tracks.id, trackId));

    await copier.copy(trackId);

    expect(await track()).toMatchObject({ storageStatus: 'stored', copyAttempts: 0 });
    expect(t.audioStore.objects.size).toBe(0);
  });
});
