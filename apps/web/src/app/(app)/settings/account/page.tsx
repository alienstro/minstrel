import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AccountEmail } from '@/components/account/account-email';
import { DeleteAccount } from '@/components/account/delete-account';
import { SignOutButton } from '@/components/account/sign-out-button';

export const metadata: Metadata = { title: 'Account · Minstrel' };

function Row({ title, text, children }: { title: string; text: ReactNode; children: ReactNode }) {
  return (
    <li className="rel">
      <div className="relative z-[1] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-3.5 py-4">
        <div className="flex flex-[1_1_260px] flex-col gap-0.5">
          <span className="font-semibold uppercase">{title}</span>
          {text}
        </div>
        {children}
      </div>
    </li>
  );
}

// The Account artboard. Spec §10.1: email, sign out, and account deletion.
export default function AccountPage() {
  return (
    <div className="flex flex-col">
      <h1 className="mt-4 mb-12 text-center text-[13px] font-semibold uppercase">
        <span>Your details</span>{' '}
        <span className="serif mt-1 block text-[56px] leading-none tracking-[-0.02em] normal-case sm:text-[72px]">Account</span>
      </h1>
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-12 pb-12">
        <section aria-labelledby="sign-in-h">
          <h2 id="sign-in-h" className="mt-0 mb-3.5 text-[11px] font-semibold uppercase">
            Sign-in details
          </h2>
          <ul className="m-0 list-none p-0">
            <Row title="Email" text={<AccountEmail />}>
              {null}
            </Row>
            <Row title="Sign out" text={<span className="mu">Sign out on this device.</span>}>
              <SignOutButton />
            </Row>
          </ul>
        </section>
        <section aria-labelledby="data-h">
          <h2 id="data-h" className="mt-0 mb-3.5 text-[11px] font-semibold uppercase">
            Your data
          </h2>
          <ul className="m-0 list-none p-0">
            <Row
              title="Delete your account"
              text={<span className="mu">This deletes your account, your keys and your songs. You cannot undo it.</span>}
            >
              <DeleteAccount />
            </Row>
          </ul>
        </section>
      </div>
    </div>
  );
}
