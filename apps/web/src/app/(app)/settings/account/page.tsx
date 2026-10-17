import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountEmail } from '@/components/account/account-email';
import { DeleteAccount } from '@/components/account/delete-account';

export const metadata: Metadata = { title: 'Account · Minstrel' };

// Spec §10.1: email, password, and account deletion.
export default function AccountPage() {
  return (
    <div className="flex max-w-xl flex-col gap-8">
      <h1 className="type-page-title">Account</h1>
      <section className="card flex flex-col gap-2">
        <span className="card-pill">Email</span>
        <AccountEmail />
      </section>
      <section className="card flex flex-col gap-2">
        <span className="card-pill">Password</span>
        <p>
          To change your password, get a reset link by email.{' '}
          <Link href="/forgot-password" className="underline">
            Reset password
          </Link>
        </p>
      </section>
      <section className="card flex flex-col gap-4">
        <span className="card-pill">Delete account</span>
        <DeleteAccount />
      </section>
    </div>
  );
}
