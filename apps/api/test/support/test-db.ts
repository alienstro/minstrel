import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://minstrel:minstrel@localhost:5433/minstrel_test';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
let migrated: Promise<void> | undefined;

// Runs the migrations one time for each test process, then empties every app table.
export async function resetTestDb(): Promise<void> {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  try {
    migrated ??= migrate(drizzle({ client: pool }), { migrationsFolder });
    await migrated;
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    if (rows.length > 0) {
      const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
      await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await pool.end();
  }
}
