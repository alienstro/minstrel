'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { FieldError, TextField } from '@/components/ui/text-field';
import { authClient } from '@/lib/auth-client';

type Mode = 'sign-in' | 'sign-up';
type Fields = Partial<Record<'name' | 'email' | 'password', string>>;

const AFTER_SIGN_IN = '/studio';
const MIN_PASSWORD = 8;

function validate(mode: Mode, form: FormData): Fields {
  const errors: Fields = {};
  if (mode === 'sign-up' && !String(form.get('name') ?? '').trim()) errors.name = 'Enter your name.';
  if (!/^\S+@\S+\.\S+$/.test(String(form.get('email') ?? ''))) errors.email = 'Enter an email address.';
  if (String(form.get('password') ?? '').length < MIN_PASSWORD) {
    errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  }
  return errors;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>({});
  const [formError, setFormError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const errors = validate(mode, form);
    setFields(errors);
    setFormError(undefined);
    if (Object.keys(errors).length > 0) return;

    const email = String(form.get('email'));
    const password = String(form.get('password'));
    setBusy(true);
    try {
      if (mode === 'sign-up') {
        const name = String(form.get('name')).trim();
        const { error } = await authClient.signUp.email({ name, email, password, callbackURL: AFTER_SIGN_IN });
        if (error) return setFormError(error.message ?? 'Minstrel could not create the account. Try again.');
        setSentTo(email);
      } else {
        const { error } = await authClient.signIn.email({ email, password, callbackURL: AFTER_SIGN_IN });
        if (error?.status === 403) return setFormError('Confirm your email first. Open the link that we sent you.');
        if (error) return setFormError(error.message ?? 'Minstrel could not sign you in. Try again.');
        router.push(AFTER_SIGN_IN);
      }
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <p role="status" className="card">
        Check your email. We sent a link to {sentTo}. Open it to start Minstrel.
      </p>
    );
  }

  const isSignUp = mode === 'sign-up';
  return (
    <div className="card flex flex-col gap-5">
      <span className="card-pill">{isSignUp ? 'Create account' : 'Sign in'}</span>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {isSignUp ? <TextField label="Name" name="name" autoComplete="name" error={fields.name} /> : null}
        <TextField label="Email" name="email" type="email" autoComplete="email" error={fields.email} />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          error={fields.password}
        />
        {formError ? (
          <div role="alert">
            <FieldError id="auth-form-error">{formError}</FieldError>
          </div>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <span>{isSignUp ? 'Create account' : 'Sign in'}</span>
          <span aria-hidden="true">›</span>
        </button>
      </form>
      <button
        type="button"
        className="btn btn-soft"
        onClick={() => authClient.signIn.social({ provider: 'google', callbackURL: AFTER_SIGN_IN })}
      >
        Continue with Google
      </button>
      <p className="type-label text-muted">
        {isSignUp ? (
          <>
            Do you have an account? <Link href="/sign-in" className="underline">Sign in</Link>
          </>
        ) : (
          <>
            New to Minstrel? <Link href="/sign-up" className="underline">Create an account</Link> ·{' '}
            <Link href="/forgot-password" className="underline">Forgot password</Link>
          </>
        )}
      </p>
    </div>
  );
}
