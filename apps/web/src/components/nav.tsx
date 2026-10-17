'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/studio', label: 'Studio' },
  { href: '/library', label: 'Library' },
] as const;

const SETTINGS = { href: '/settings/connections', label: 'Settings', prefix: '/settings' } as const;

export function Nav() {
  const pathname = usePathname();
  const isCurrent = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

  return (
    <nav aria-label="Main" className="flex items-center gap-2 px-4 py-4 sm:px-8">
      <Link href="/studio" className="type-page-title mr-4">
        Minstrel
      </Link>
      {ITEMS.map((item) => (
        <NavLink key={item.href} href={item.href} label={item.label} current={isCurrent(item.href)} />
      ))}
      <span className="flex-1" />
      <NavLink href={SETTINGS.href} label={SETTINGS.label} current={isCurrent(SETTINGS.prefix)} />
    </nav>
  );
}

function NavLink({ href, label, current }: { href: string; label: string; current: boolean }) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={
        current
          ? 'rounded-[13px] bg-action px-3 py-1 text-on-action'
          : 'rounded-[13px] px-3 py-1 text-ink hover:bg-panel'
      }
    >
      {label}
    </Link>
  );
}
