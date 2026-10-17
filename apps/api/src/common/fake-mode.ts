type Env = Record<string, string | undefined>;

/**
 * MINSTREL_FAKE_PROVIDERS=1 runs the API with a fake kie provider and a password sign-up, for the local
 * end-to-end test (plan Task 51). A fake provider in production would give users fake songs, so the
 * API refuses to start with the flag there.
 */
export function isFakeMode(env: Env = process.env): boolean {
  if (env.MINSTREL_FAKE_PROVIDERS !== '1') return false;
  if (env.VERCEL_ENV === 'production') {
    throw new Error('MINSTREL_FAKE_PROVIDERS must not be set in production');
  }
  return true;
}
