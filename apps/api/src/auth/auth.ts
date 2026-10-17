import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { CLIENT_IP_HEADERS } from '../common/client-ip.js';
import { isFakeMode } from '../common/fake-mode.js';
import type { Db } from '../db/db.module.js';
import * as authSchema from '../db/auth-schema.js';
import { userPrefix } from '../storage/object-key.js';
import type { AudioStore } from '../storage/audio-store.js';

export interface AuthEnv {
  WEB_ORIGIN: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Fake mode only. Production has Google sign-in only. */
  passwordSignIn: boolean;
}

// Spec §7.2 and §7.4. Users sign in with Google. The local end-to-end test cannot use Google, so fake
// mode also allows a password sign-up with no email check.
export function createAuth(db: Db, env: AuthEnv, audio: AudioStore) {
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
    emailAndPassword: { enabled: env.passwordSignIn },
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
      ipAddress: { ipAddressHeaders: [...CLIENT_IP_HEADERS] },
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
  return {
    WEB_ORIGIN,
    BETTER_AUTH_SECRET,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    passwordSignIn: isFakeMode(),
  };
}
