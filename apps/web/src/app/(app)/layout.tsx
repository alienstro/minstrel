import { Nav } from '@/components/nav';

// The signed-in shell: the nav on top. Task 45 adds the player bar at the bottom.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Nav />
      <main className="flex-1 px-4 pb-28 sm:px-8">{children}</main>
    </div>
  );
}
