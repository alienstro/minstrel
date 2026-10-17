'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type CSSProperties, type FormEvent, type ReactNode, useId, useState } from 'react';
import { AuthStage } from '@/components/brand/auth-stage';
import { FieldError } from '@/components/ui/text-field';
import { authClient } from '@/lib/auth-client';
import { AuthField, AuthFieldErrors } from './auth-field';

const MIN_PASSWORD = 8;
const STAR: [string, string] = ['NO', 'WORRIES'];

// A one-line card for a result: the message on the left, the next step on the right.
const ROW: CSSProperties = { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '12px 12px 12px 24px' };

function Hint({ children }: { children: ReactNode }) {
  return <p className="mono mu m-0 text-center text-[11px]">{children}</p>;
}

export function ForgotPasswordForm() {
  const emailId = useId();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter an email address.');
    setError(undefined);
    setBusy(true);
    // The reply is the same for each email, so that the page does not show which emails have an account.
    await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' }).catch(() => undefined);
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <AuthStage label="Check your email" heading="Link sent" starText={STAR}>
        <div className="flex flex-col items-center gap-3.5">
          <div className="card w-full" style={ROW}>
            <p role="status" className="m-0 text-[14px]">
              If an account uses this email, we sent a link to reset the password.
            </p>
          </div>
          <Hint>
            No email? Look in your spam folder, or{' '}
            <button type="button" className="dotted text-ink" onClick={() => setSent(false)}>
              send it again
            </button>
          </Hint>
        </div>
      </AuthStage>
    );
  }
  return (
    <AuthStage label="Forgot your password" heading="Reset it" starText={STAR}>
      <form noValidate onSubmit={onSubmit} aria-label="Reset your password" className="flex flex-col items-center gap-3.5">
        <div className="card w-full">
          <div className="flex w-full flex-wrap items-center gap-2">
            <AuthField
              id={emailId}
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="The email of your account"
              error={error}
            />
            <button type="submit" className="pill dark" style={{ flex: '0 0 auto' }} disabled={busy}>
              Send reset link <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        <AuthFieldErrors errors={[{ id: emailId, message: error }]} />
        <Hint>
          Remembered it?{' '}
          <Link href="/sign-in" className="dotted text-ink">
            Sign in
          </Link>
        </Hint>
      </form>
    </AuthStage>
  );
}

type ResetFields = Partial<Record<'password' | 'again', string>>;

export function ResetPasswordForm({ token }: { token: string | null }) {
  const ids = useId();
  const [fields, setFields] = useState<ResetFields>({});
  const [formError, setFormError] = useState<string>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <AuthStage label="Choose a new one" heading="New password" starText={STAR}>
        <div role="alert" className="card w-full" style={ROW}>
          <FieldError id="reset-token-error">This link is not complete.</FieldError>
          <Link href="/forgot-password" className="pill dark">
            Get a new link <span aria-hidden="true">→</span>
          </Link>
        </div>
      </AuthStage>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get('password') ?? '');
    const errors: ResetFields = {};
    if (newPassword.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
    else if (String(form.get('again') ?? '') !== newPassword) errors.again = 'The two passwords differ.';
    setFields(errors);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    const { error: apiError } = await authClient.resetPassword({ token: token!, newPassword });
    setBusy(false);
    if (apiError) return setFormError('This link is not valid any more. Get a new link.');
    setDone(true);
  }

  if (done) {
    return (
      <AuthStage label="All set" heading="Password saved" starText={STAR}>
        <div className="flex flex-col items-center gap-3.5">
          <div className="card w-full" style={ROW}>
            <p role="status" className="m-0 text-[14px]">
              Your password is changed.
            </p>
            <Link href="/sign-in" className="pill dark">
              Sign in <span aria-hidden="true">→</span>
            </Link>
          </div>
          <Hint>Your API keys and your songs did not change.</Hint>
        </div>
      </AuthStage>
    );
  }

  const passwordId = `${ids}-password`;
  const againId = `${ids}-again`;
  return (
    <AuthStage label="Choose a new one" heading="New password" starText={STAR}>
      <form noValidate onSubmit={onSubmit} aria-label="Choose a new password" className="flex flex-col items-center gap-3.5">
        <div className="card w-full">
          <div className="flex w-full flex-wrap items-center gap-2">
            <AuthField id={passwordId} label="New password" name="password" type="password" autoComplete="new-password" error={fields.password} />
            <AuthField id={againId} label="New password again" name="again" type="password" autoComplete="new-password" error={fields.again} />
            <button type="submit" className="pill dark" style={{ flex: '0 0 auto' }} disabled={busy}>
              Save <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        <AuthFieldErrors
          errors={[
            { id: passwordId, message: fields.password },
            { id: againId, message: fields.again },
          ]}
        />
        {formError ? (
          <div role="alert" className="flex flex-col items-center gap-1">
            <FieldError id="reset-form-error">{formError}</FieldError>
            <Link href="/forgot-password" className="dotted">
              Get a new link
            </Link>
          </div>
        ) : null}
        <Hint>Use {MIN_PASSWORD} or more characters. A short sentence is easy to remember.</Hint>
      </form>
    </AuthStage>
  );
}

// Better Auth sends the user to /reset-password?token=... after the email link.
export function ResetPasswordFromQuery() {
  return <ResetPasswordForm token={useSearchParams().get('token')} />;
}
