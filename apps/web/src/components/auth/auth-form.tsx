'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { AuthStage } from '@/components/brand/auth-stage';
import { FieldError } from '@/components/ui/text-field';
import { authClient } from '@/lib/auth-client';
import { AuthField, AuthFieldErrors } from './auth-field';

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

// The canvas text for each screen: the small label, the serif heading, and the two words on the star.
const SCREEN = {
  'sign-in': { label: 'Welcome back to Minstrel', heading: 'Sign in', star: ['WELCOME', 'BACK'], submit: 'Sign in' },
  'sign-up': { label: 'New to Minstrel', heading: 'Make an account', star: ['FIRST', 'SONG'], submit: 'Create account' },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const ids = useId();
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

  const isSignUp = mode === 'sign-up';
  const screen = SCREEN[mode];

  if (sentTo) {
    return (
      <AuthStage label="Check your email" heading="Link sent" starText={['FIRST', 'SONG']}>
        <div className="card" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', padding: '12px 24px' }}>
          <p role="status" className="m-0 text-[14px]">
            Check your email. We sent a link to <strong>{sentTo}</strong>. Open it to start Minstrel.
          </p>
        </div>
      </AuthStage>
    );
  }

  const nameId = `${ids}-name`;
  const emailId = `${ids}-email`;
  const passwordId = `${ids}-password`;
  return (
    <AuthStage label={screen.label} heading={screen.heading} starText={[...screen.star] as [string, string]}>
      <form noValidate onSubmit={onSubmit} aria-label={screen.heading} className="flex flex-col items-center gap-3.5">
        <div className="card w-full">
          <div className="flex w-full flex-wrap items-center gap-2">
            {isSignUp ? <AuthField id={nameId} label="Name" name="name" autoComplete="name" error={fields.name} /> : null}
            <AuthField id={emailId} label="Email" name="email" type="email" autoComplete="email" error={fields.email} />
            <AuthField
              id={passwordId}
              label="Password"
              name="password"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              placeholder={isSignUp ? `Password, ${MIN_PASSWORD} or more characters` : 'Password'}
              error={fields.password}
            />
            <button type="submit" className="pill dark" style={{ flex: '0 0 auto' }} disabled={busy}>
              {screen.submit} <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        <AuthFieldErrors
          errors={[
            { id: nameId, message: fields.name },
            { id: emailId, message: fields.email },
            { id: passwordId, message: fields.password },
          ]}
        />
        {formError ? (
          <div role="alert">
            <FieldError id="auth-form-error">{formError}</FieldError>
          </div>
        ) : null}
        <button
          type="button"
          className="pill gl"
          onClick={() => authClient.signIn.social({ provider: 'google', callbackURL: AFTER_SIGN_IN })}
        >
          Continue with Google
        </button>
        <p className="mono mu m-0 text-center text-[11px]">
          {isSignUp ? (
            <>
              When you continue, you agree to the{' '}
              <Link href="/terms" className="dotted">
                Terms
              </Link>{' '}
              and the{' '}
              <Link href="/privacy" className="dotted">
                Privacy notice
              </Link>{' '}
              · Have an account?{' '}
              <Link href="/sign-in" className="dotted text-ink">
                Sign in
              </Link>
            </>
          ) : (
            <>
              <Link href="/forgot-password" className="dotted">
                Forgot password
              </Link>{' '}
              · New here?{' '}
              <Link href="/sign-up" className="dotted text-ink">
                Make an account
              </Link>
            </>
          )}
        </p>
      </form>
    </AuthStage>
  );
}
