'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { authClient } from '@/lib/auth-client';

// Better Auth gives this code when the session is older than its fresh age (1 day by default).
const SESSION_EXPIRED = 'SESSION_EXPIRED';

// Spec §7.2: Better Auth deletes the account. The API deletes the R2 objects first. A Google account
// has no password, so Better Auth needs a recent sign-in instead.
export function DeleteAccount() {
  const router = useRouter();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [needsSignIn, setNeedsSignIn] = useState(false);

  async function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setNeedsSignIn(false);
    try {
      const result = await authClient.deleteUser({});
      if (result.error?.code === SESSION_EXPIRED) {
        setNeedsSignIn(true);
        setError('To delete the account, sign in with Google again. Then delete it within one day.');
        return;
      }
      if (result.error) {
        setError(result.error.message ?? 'Minstrel could not delete the account. Try again.');
        return;
      }
      // No data of the deleted account stays in this tab.
      client.clear();
      router.replace('/');
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button type="button" className="pill gl" onClick={() => setConfirming(true)}>
        Delete account
      </button>
    );
  }

  return (
    <form onSubmit={onConfirm} className="flex basis-full flex-col gap-4" noValidate>
      <p className="m-0">
        This deletes your songs, your keys, and your account. You cannot undo it.
      </p>
      {error ? (
        <p role="alert" className="m-0 pl-5 text-[12px] font-semibold">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {needsSignIn ? (
          <button
            type="button"
            className="pill dark"
            onClick={() => authClient.signIn.social({ provider: 'google', callbackURL: '/settings/account' })}
          >
            Sign in with Google again
          </button>
        ) : (
          <button type="submit" className="pill dark" disabled={busy}>
            Yes, delete my account
          </button>
        )}
        <button type="button" className="pill gl" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
