import Link from 'next/link';

// Spec §10.2: the laser scene belongs to the landing and sign-in pages only, never to a control.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="laser-scene flex min-h-dvh flex-col px-4 py-6 sm:px-8">
      <Link href="/" className="type-page-title">
        Minstrel
      </Link>
      <main className="mx-auto mt-16 w-full max-w-md">{children}</main>
    </div>
  );
}
