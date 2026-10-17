import { pathToFileURL } from 'node:url';
import { and, eq, lt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { KeyVault, parseKeyring } from '../crypto/key-vault.js';
import type { Db } from '../db/db.module.js';
import { providerConnections } from '../db/schema.js';

// Spec §7.1. Re-encrypts each provider key whose version is below the highest version.
export async function rotateKeys(
  db: Db,
  vault: KeyVault,
): Promise<{ rotated: number }> {
  const rows = await db
    .select()
    .from(providerConnections)
    .where(lt(providerConnections.keyVersion, vault.currentVersion));
  let rotated = 0;
  for (const row of rows) {
    const aad = `${row.userId}:${row.id}`;
    const plain = vault.decrypt(
      {
        ciphertext: row.keyCiphertext,
        iv: row.keyIv,
        tag: row.keyTag,
        version: row.keyVersion,
      },
      aad,
    );
    const sealed = vault.encrypt(plain, aad);
    // The version check skips a row whose key the user replaced after the select.
    const updated = await db
      .update(providerConnections)
      .set({
        keyCiphertext: sealed.ciphertext,
        keyIv: sealed.iv,
        keyTag: sealed.tag,
        keyVersion: sealed.version,
      })
      .where(
        and(
          eq(providerConnections.id, row.id),
          eq(providerConnections.keyVersion, row.keyVersion),
        ),
      )
      .returning({ id: providerConnections.id });
    rotated += updated.length;
  }
  return { rotated };
}

// `pnpm keys:rotate` runs this file after the build, with DATABASE_URL_UNPOOLED and KEY_ENCRYPTION_KEYS.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  });
  try {
    const vault = new KeyVault(
      parseKeyring(process.env.KEY_ENCRYPTION_KEYS ?? ''),
    );
    const { rotated } = await rotateKeys(drizzle({ client: pool }), vault);
    console.log(
      `Rotated ${rotated} provider keys to version ${vault.currentVersion}.`,
    );
  } finally {
    await pool.end();
  }
}
