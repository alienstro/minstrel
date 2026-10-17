'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { authClient } from '@/lib/auth-client';

// Spec §7.2: Better Auth deletes the account. The API deletes the R2 objects first.
export function DeleteAccount() {
  const router = useRouter();
  const client = useQueryClient();
  const baseId = useId();
  const inputId = `${baseId}-password`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    setBusy(true);
    setError(undefined);
    try {
      // A Google account has no password. Better Auth then needs a recent sign-in.
      const result = await authClient.deleteUser(password ? { password } : {});
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
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="lbl">
          Password
        </label>
        <input
          id={inputId}
          name="password"
          type="password"
          autoComplete="current-password"
          className="in max-w-sm"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        />
        <span id={hintId} className="hint">
          Leave it empty if you sign in with Google.
        </span>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="m-0 pl-5 text-[12px] font-semibold">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="pill dark" disabled={busy}>
          Yes, delete my account
        </button>
        <button type="button" className="pill gl" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
