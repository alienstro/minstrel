import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

// Any fixed number. Each run of the migrations holds this Postgres advisory lock.
const MIGRATION_LOCK_ID = 7_301_951;

// Applies the new migrations in migrationsFolder. The API image runs it before the server starts.
// A rolling deploy can start two containers at the same time, so the second run waits for the lock
// and then finds nothing to apply.
export async function runMigrations(
  url: string,
  migrationsFolder: string,
): Promise<void> {
  // One connection, so the session lock and the migrations use the same connection.
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await pool.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await migrate(drizzle({ client: pool }), { migrationsFolder });
    await pool.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
  } finally {
    await pool.end();
  }
}
