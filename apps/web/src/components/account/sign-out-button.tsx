'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

// A full page load after the sign-out clears the cached queries and stops the player, so no data of
// this account stays in the tab.
export function SignOutButton({ leave = (url) => window.location.replace(url) }: { leave?: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setBusy(true);
    setFailed(false);
    const { error } = await authClient.signOut();
    if (error) {
      setBusy(false);
      setFailed(true);
      return;
    }
    leave('/');
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" className="pill dark" disabled={busy} onClick={signOut}>
        Sign out
      </button>
      {failed ? (
        <span role="alert" className="text-[12px] font-semibold">
          Minstrel could not sign you out. Try again.
        </span>
      ) : null}
    </span>
  );
}
