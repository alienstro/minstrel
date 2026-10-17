'use client';

import { authClient } from '@/lib/auth-client';

export function AccountEmail() {
  const { data, isPending } = authClient.useSession();
  if (isPending) return <span className="mu">Loading…</span>;
  return <span className="mu">{data?.user.email}</span>;
}
