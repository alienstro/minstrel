import { Nav } from '@/components/nav';
import { PlayerBar } from '@/components/player/player-bar';
import { PlayerProvider } from '@/components/player/player-context';

// The signed-in shell: the nav on top and the player at the bottom. The player lives here, so a
// song keeps playing when the user moves between Studio and Library.
// The canvas app pages are white at the top and gray below, with a darker gray for the fields.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayerProvider>
      <div className="flex min-h-dvh flex-col bg-[linear-gradient(#ffffff_0_210px,var(--cream)_210px)] [--cream2:#dddddd]">
        <Nav />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-12 sm:px-8">{children}</main>
        <PlayerBar />
      </div>
    </PlayerProvider>
  );
}
