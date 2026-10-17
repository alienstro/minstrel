import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runMigrations } from '../src/db/migrate.js';
import { TEST_DATABASE_URL } from './support/test-db.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const SCRATCH_DB = 'minstrel_migrate_test';
const scratchUrl = (() => {
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${SCRATCH_DB}`;
  return url.toString();
})();

// Each test starts from an empty database, as a new Dokploy database does.
async function recreateScratchDb(): Promise<void> {
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${SCRATCH_DB}`);
  } finally {
    await admin.end();
  }
}

async function tableNames(): Promise<string[]> {
  const client = new pg.Client({ connectionString: scratchUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    return rows.map((r) => r.tablename);
  } finally {
    await client.end();
  }
}

describe('runMigrations (e2e)', () => {
  beforeEach(recreateScratchDb);

  it('applies all migrations to an empty schema', async () => {
    await runMigrations(scratchUrl, migrationsFolder);
    expect(await tableNames()).toEqual(
      expect.arrayContaining(['user', 'session', 'generations', 'provider_connections', 'tracks']),
    );
  });

  it('is safe to run twice', async () => {
    await runMigrations(scratchUrl, migrationsFolder);
    await expect(runMigrations(scratchUrl, migrationsFolder)).resolves.toBeUndefined();
  });

  it('is safe when two runs start at the same time', async () => {
    await expect(
      Promise.all([
        runMigrations(scratchUrl, migrationsFolder),
        runMigrations(scratchUrl, migrationsFolder),
      ]),
    ).resolves.toEqual([undefined, undefined]);
  });
});
