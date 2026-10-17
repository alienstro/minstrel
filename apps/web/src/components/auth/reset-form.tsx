'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { FieldError, TextField } from '@/components/ui/text-field';
import { authClient } from '@/lib/auth-client';

const MIN_PASSWORD = 8;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter an email address.');
    setBusy(true);
    // The reply is the same for each email, so that the page does not show which emails have an account.
    await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' }).catch(() => undefined);
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <p role="status" className="card">
        If an account uses this email, we sent a link to reset the password.
      </p>
    );
  }
  return (
    <form noValidate onSubmit={onSubmit} className="card flex flex-col gap-4">
      <span className="card-pill">Reset password</span>
      <TextField label="Email" name="email" type="email" autoComplete="email" error={error} />
      <button type="submit" className="btn btn-primary" disabled={busy}>
        <span>Send link</span>
        <span aria-hidden="true">›</span>
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <div role="alert" className="card flex flex-col gap-3">
        <FieldError id="reset-token-error">This link is not complete.</FieldError>
        <Link href="/forgot-password" className="underline">
          Get a new link
        </Link>
      </div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newPassword = String(new FormData(event.currentTarget).get('password') ?? '');
    if (newPassword.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    setError(undefined);
    setBusy(true);
    const { error: apiError } = await authClient.resetPassword({ token: token!, newPassword });
    setBusy(false);
    if (apiError) return setFormError('This link is not valid any more. Get a new link.');
    setDone(true);
  }

  if (done) {
    return (
      <p role="status" className="card">
        Your password is changed. <Link href="/sign-in" className="underline">Sign in</Link>
      </p>
    );
  }
  return (
    <form noValidate onSubmit={onSubmit} className="card flex flex-col gap-4">
      <span className="card-pill">New password</span>
      <TextField label="New password" name="password" type="password" autoComplete="new-password" error={error} />
      {formError ? (
        <div role="alert">
          <FieldError id="reset-form-error">{formError}</FieldError>
          <Link href="/forgot-password" className="underline">
            Get a new link
          </Link>
        </div>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        <span>Set password</span>
        <span aria-hidden="true">›</span>
      </button>
    </form>
  );
}

// Better Auth sends the user to /reset-password?token=... after the email link.
export function ResetPasswordFromQuery() {
  return <ResetPasswordForm token={useSearchParams().get('token')} />;
}
