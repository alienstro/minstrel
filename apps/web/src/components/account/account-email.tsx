'use client';

import { authClient } from '@/lib/auth-client';

export function AccountEmail() {
  const { data, isPending } = authClient.useSession();
  if (isPending) return <p className="text-muted">Loading…</p>;
  return <p>{data?.user.email}</p>;
}
