// Vercel runs the `build` script of the API for each Preview and Production deploy. This step
// applies the new database migrations at the end of that build. A local or CI build skips it,
// so it never changes a database by accident. A failed migration stops the deploy.
// Preview and Production share one database, so a Preview deploy also changes the production schema.
import { spawnSync } from 'node:child_process';

if (process.env.VERCEL !== '1') {
  console.log('Skip the database migrations: this is not a Vercel build.');
  process.exit(0);
}

const result = spawnSync('drizzle-kit', ['migrate'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
