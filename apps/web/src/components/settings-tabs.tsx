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
    <nav aria-label="Settings" className="flex gap-2">
      {TABS.map((tab) => {
        const current = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? 'page' : undefined}
            className={
              current
                ? 'rounded-[13px] bg-soft px-3 py-1 text-ink'
                : 'rounded-[13px] px-3 py-1 text-muted hover:bg-panel'
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
