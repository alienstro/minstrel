'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/settings/connections', label: 'Connections' },
  { href: '/settings/account', label: 'Account' },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="flex flex-1 justify-end gap-1.5">
      {TABS.map((tab) => {
        const current = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? 'page' : undefined}
            className={`pill min-h-[34px] px-3.5 text-[11px] uppercase ${current ? 'dark' : 'gl'}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
