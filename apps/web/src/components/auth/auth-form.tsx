'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AuthStage } from '@/components/brand/auth-stage';
import { FieldError } from '@/components/ui/text-field';
import { authClient } from '@/lib/auth-client';
import './auth-form.css';

const AFTER_SIGN_IN = '/studio';
const SIGN_IN = '/sign-in';

// Better Auth sends the user back to SIGN_IN with ?error=<code> when the Google sign-in fails.
function messageFor(code: string | null): string | undefined {
  if (!code) return undefined;
  if (code === 'account_not_linked') {
    return 'Minstrel cannot link this Google account. Use the Google account with the email of your Minstrel account.';
  }
  return 'Google sign-in did not finish. Try again.';
}

// Google's standard "G" mark. Its four colors must stay as they are (Google sign-in branding rules).
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

// Spec §7.2: Google is the only sign-in. One button signs in a user, or makes the account of a new user.
// `bare` drops the stage, for a form inside another page such as Home.
export function AuthForm({ bare = false }: { bare?: boolean }) {
  const urlError = messageFor(useSearchParams().get('error'));
  const [startError, setStartError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const error = startError ?? urlError;

  async function onGoogle() {
    setBusy(true);
    setStartError(undefined);
    // On success the browser goes to Google, so the button stays busy.
    const { error: failed } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: AFTER_SIGN_IN,
      errorCallbackURL: SIGN_IN,
    });
    if (failed) {
      setStartError('Minstrel could not open Google. Try again.');
      setBusy(false);
    }
  }

  const form = (
    <div className="auth-google">
      <button type="button" className="record-btn" onClick={onGoogle} disabled={busy} aria-busy={busy}>
        <span className="record-label">
          <GoogleMark />
        </span>
        Continue with Google
      </button>
      {error ? (
        <div role="alert">
          <FieldError id="auth-form-error">{error}</FieldError>
        </div>
      ) : null}
      <p className="mono mu auth-note">
        New to Minstrel? The same button makes your account. When you continue, you agree to the{' '}
        <Link href="/terms" className="dotted">
          Terms
        </Link>{' '}
        and the{' '}
        <Link href="/privacy" className="dotted">
          Privacy notice
        </Link>
        .
      </p>
    </div>
  );
  if (bare) return form;
  return (
    <AuthStage label="Welcome to Minstrel" heading="Sign in" starText={['WELCOME', 'IN']}>
      {form}
    </AuthStage>
  );
}
