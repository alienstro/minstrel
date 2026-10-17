import { fileURLToPath } from 'node:url';
import { runMigrations } from './db/migrate.js';

// The API image runs `node dist/migrate.js && node dist/main.js`. The migrations folder is next to dist/.
// Migrations use the direct connection (spec §2.4).
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL to run the database migrations');

await runMigrations(url, fileURLToPath(new URL('../drizzle', import.meta.url)));
console.log('The database migrations are up to date.');
