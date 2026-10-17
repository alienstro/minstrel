import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { SiteFooter } from '@/components/legal/site-footer';

// The Privacy, Terms and Contact artboards: white at the top, then the canvas gray.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[linear-gradient(#ffffff_0_300px,var(--cream)_300px)]">
      <header className="flex items-center justify-between px-4 pt-7 sm:px-10">
        <span className="flex-1">
          <Link href="/" className="pill gl min-h-[34px] px-4 text-[12px]">
            ← Home
          </Link>
        </span>
        <Link href="/" className="inline-flex items-center gap-2.5 text-[15px] font-semibold no-underline">
          <Logo />
          Minstrel
        </Link>
        <span className="flex flex-1 justify-end">
          <Link href="/sign-in" className="pill gl min-h-[34px] px-4 text-[12px]">
            Sign in
          </Link>
        </span>
      </header>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
