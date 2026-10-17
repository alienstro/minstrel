'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/brand/logo';

const ITEMS = [
  { href: '/studio', label: 'Studio', prefix: '/studio' },
  { href: '/library', label: 'Library', prefix: '/library' },
  { href: '/settings/connections', label: 'Settings', prefix: '/settings' },
] as const;

// The canvas header: the links on the left, the name in the middle. A dot marks the current page.
export function Nav() {
  const pathname = usePathname();
  const isCurrent = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

  return (
    <header className="mx-auto flex min-h-[76px] w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 sm:px-8">
      <nav aria-label="Main" className="order-first flex flex-1 gap-7">
        {ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className="nl" aria-current={isCurrent(item.prefix) ? 'page' : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>
      <Link href="/studio" className="inline-flex items-center gap-2.5 font-semibold tracking-[0.02em] uppercase no-underline">
        <Logo />
        Minstrel
      </Link>
      <span className="hidden flex-1 sm:block" />
    </header>
  );
}
