// Used only by the Better Auth CLI: `pnpm dlx auth@1.7.10 generate --config better-auth.config.ts`.
import { drizzle } from 'drizzle-orm/node-postgres';
import { createAuth } from './src/auth/auth.js';

const noMail = {
  sendVerification: async () => {},
  sendPasswordReset: async () => {},
};

export const auth = createAuth(
  drizzle.mock(),
  {
    WEB_ORIGIN: 'http://localhost:3000',
    BETTER_AUTH_SECRET: 'cli-only-secret-cli-only-secret-00',
  },
  noMail,
);
