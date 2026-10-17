import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { user } from '../src/db/auth-schema.js';
import type { Db } from '../src/db/db.module.js';
import { generations, providerConnections, tracks } from '../src/db/schema.js';
import { insertUser } from './support/fixtures.js';
import { resetTestDb, TEST_DATABASE_URL } from './support/test-db.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('schema (e2e)', () => {
  let pool: pg.Pool;
  let db: Db;
  let userId: string;

  const insertConnection = async () => {
    const [row] = await db
      .insert(providerConnections)
      .values({
        userId,
        kind: 'music',
        adapter: 'kie',
        label: 'kie.ai',
        baseUrl: 'https://api.kie.ai',
        keyCiphertext: Buffer.from('c'),
        keyIv: Buffer.from('i'),
        keyTag: Buffer.from('t'),
        keyVersion: 1,
        keyLast4: 'abcd',
      })
      .returning();
    return row!;
  };

  const insertGeneration = async (connectionId: string) => {
    const [row] = await db
      .insert(generations)
      .values({
        userId,
        connectionId,
        adapter: 'kie',
        flow: 'job',
        status: 'pending',
        input: { idea: 'rain', instrumental: false, model: 'V6' },
      })
      .returning();
    return row!;
  };

  const insertTrack = (generationId: string) =>
    db.insert(tracks).values({ generationId, userId, providerTrackId: 'p1', title: 'Rain' }).returning();

  beforeAll(async () => {
    await resetTestDb();
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
    db = drizzle({ client: pool });
  });

  beforeEach(async () => {
    await resetTestDb();
    userId = await insertUser(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('a new row id is a UUID v7', async () => {
    const connection = await insertConnection();
    const generation = await insertGeneration(connection.id);
    const [track] = await insertTrack(generation.id);
    for (const id of [connection.id, generation.id, track!.id]) expect(id).toMatch(UUID_V7);
  });

  it('deleting a connection sets generations.connection_id to null', async () => {
    const connection = await insertConnection();
    const generation = await insertGeneration(connection.id);
    await db.delete(providerConnections).where(eq(providerConnections.id, connection.id));
    const [row] = await db.select().from(generations).where(eq(generations.id, generation.id));
    expect(row!.connectionId).toBeNull();
  });

  it('a second track with the same generation_id and provider_track_id fails', async () => {
    const generation = await insertGeneration((await insertConnection()).id);
    await insertTrack(generation.id);
    await expect(insertTrack(generation.id)).rejects.toThrow();
  });

  it("deleting a user removes the user's connections, generations, and tracks", async () => {
    const generation = await insertGeneration((await insertConnection()).id);
    await insertTrack(generation.id);
    await db.delete(user).where(eq(user.id, userId));
    expect(await db.select().from(providerConnections)).toHaveLength(0);
    expect(await db.select().from(generations)).toHaveLength(0);
    expect(await db.select().from(tracks)).toHaveLength(0);
  });
});
