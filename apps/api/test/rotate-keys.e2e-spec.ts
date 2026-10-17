import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { KeyVault, parseKeyring } from '../src/crypto/key-vault.js';
import type { Db } from '../src/db/db.module.js';
import { providerConnections } from '../src/db/schema.js';
import { rotateKeys } from '../src/scripts/rotate-keys.js';
import { insertUser } from './support/fixtures.js';
import { resetTestDb, TEST_DATABASE_URL } from './support/test-db.js';

const k1 = `1:${randomBytes(32).toString('base64')}`;
const k2 = `2:${randomBytes(32).toString('base64')}`;

describe('rotateKeys (e2e)', () => {
  let pool: pg.Pool;
  let db: Db;
  let userId: string;

  // Inserts a connection whose key the given vault encrypts, with the AAD of spec §7.1.
  const insertSealed = async (
    vault: KeyVault,
    label: string,
    apiKey: string,
  ) => {
    const [row] = await db
      .insert(providerConnections)
      .values({
        userId,
        kind: 'music',
        adapter: 'kie',
        label,
        baseUrl: 'https://api.kie.ai',
        keyCiphertext: Buffer.alloc(0),
        keyIv: Buffer.alloc(0),
        keyTag: Buffer.alloc(0),
        keyVersion: 0,
        keyLast4: apiKey.slice(-4),
      })
      .returning();
    const sealed = vault.encrypt(apiKey, `${userId}:${row!.id}`);
    await db
      .update(providerConnections)
      .set({
        keyCiphertext: sealed.ciphertext,
        keyIv: sealed.iv,
        keyTag: sealed.tag,
        keyVersion: sealed.version,
      })
      .where(eq(providerConnections.id, row!.id));
    return row!.id;
  };

  const load = async (id: string) =>
    (
      await db
        .select()
        .from(providerConnections)
        .where(eq(providerConnections.id, id))
    )[0]!;

  beforeAll(() => {
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

  it('rows with version 1 move to version 2 and still decrypt', async () => {
    const id = await insertSealed(
      new KeyVault(parseKeyring(k1)),
      'old',
      'sk-old-1234',
    );
    const vault = new KeyVault(parseKeyring(`${k1},${k2}`));
    expect(await rotateKeys(db, vault)).toEqual({ rotated: 1 });
    const row = await load(id);
    expect(row.keyVersion).toBe(2);
    const sealed = {
      ciphertext: row.keyCiphertext,
      iv: row.keyIv,
      tag: row.keyTag,
      version: row.keyVersion,
    };
    expect(vault.decrypt(sealed, `${userId}:${id}`)).toBe('sk-old-1234');
    expect(() =>
      new KeyVault(parseKeyring(k1)).decrypt(sealed, `${userId}:${id}`),
    ).toThrow();
  });

  it('rows at the highest version do not change', async () => {
    const vault = new KeyVault(parseKeyring(`${k1},${k2}`));
    const id = await insertSealed(vault, 'new', 'sk-new-5678');
    const before = await load(id);
    expect(await rotateKeys(db, vault)).toEqual({ rotated: 0 });
    const after = await load(id);
    expect(after.keyCiphertext.equals(before.keyCiphertext)).toBe(true);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });
});
