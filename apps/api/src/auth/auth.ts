import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Db } from '../db/db.module.js';
import * as authSchema from '../db/auth-schema.js';
import { userPrefix } from '../storage/object-key.js';
import type { AudioStore } from '../storage/audio-store.js';
import type { Mailer } from './mailer.js';

export interface AuthEnv {
  WEB_ORIGIN: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

// Spec §7.2 and §7.4.
export function createAuth(db: Db, env: AuthEnv, mailer: Mailer, audio: AudioStore) {
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined;

  return betterAuth({
    baseURL: env.WEB_ORIGIN,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await mailer.sendPasswordReset({ to: user.email, url });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.sendVerification({ to: user.email, url });
      },
    },
    socialProviders: google,
    user: {
      deleteUser: {
        enabled: true,
        // The R2 objects go first. When R2 fails, the hook throws and the user row stays, so the
        // user can try again. The database cascades then remove connections, generations, and tracks.
        beforeDelete: async (user) => {
          await audio.deletePrefix(userPrefix(user.id));
        },
      },
    },
    rateLimit: { enabled: true, storage: 'database' },
    advanced: {
      useSecureCookies: env.WEB_ORIGIN.startsWith('https://'),
      ipAddress: { ipAddressHeaders: ['x-real-ip'] },
      database: { generateId: 'uuid' },
    },
    hooks: {},
  });
}

export type Auth = ReturnType<typeof createAuth>;

export function authEnvFromProcess(): AuthEnv {
  const { WEB_ORIGIN, BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!WEB_ORIGIN || !BETTER_AUTH_SECRET) {
    throw new Error('WEB_ORIGIN and BETTER_AUTH_SECRET must be set');
  }
  return { WEB_ORIGIN, BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET };
}
