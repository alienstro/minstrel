import { defineConfig, devices } from '@playwright/test';

// Plan Task 51: one end-to-end test against the real web app and the real API, with the fake kie
// provider (MINSTREL_FAKE_PROVIDERS=1) and the Docker test database. One worker, so one browser.
const API = 'http://localhost:4000';
const WEB = 'http://localhost:3000';
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://minstrel:minstrel@localhost:5433/minstrel_test';

const apiEnv = {
  PORT: '4000',
  WEB_ORIGIN: WEB,
  DATABASE_URL: TEST_DATABASE_URL,
  DATABASE_URL_UNPOOLED: TEST_DATABASE_URL,
  BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-00',
  KEY_ENCRYPTION_KEYS: `1:${Buffer.alloc(32, 7).toString('base64')}`,
  CRON_SECRET: 'e2e-cron-secret-0123456789',
  // The API needs R2 values to start. The fake takes never reach R2.
  R2_ACCOUNT_ID: 'e2e',
  R2_ACCESS_KEY_ID: 'e2e',
  R2_SECRET_ACCESS_KEY: 'e2e',
  R2_BUCKET: 'e2e',
  MINSTREL_FAKE_PROVIDERS: '1',
  LOG_LEVEL: 'warn',
};

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  reporter: 'list',
  use: { baseURL: WEB, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        'pnpm --filter @minstrel/api run db:migrate && pnpm --filter @minstrel/api run build && pnpm --filter @minstrel/api run start:prod',
      url: `${API}/api/health`,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'pnpm exec next dev --port 3000',
      url: WEB,
      env: { DEV_API_ORIGIN: API },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
