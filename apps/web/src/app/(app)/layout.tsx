import { Nav } from '@/components/nav';
import { PlayerBar } from '@/components/player/player-bar';
import { PlayerProvider } from '@/components/player/player-context';

// The signed-in shell: the nav on top and the player bar at the bottom. The player lives here, so a
// song keeps playing when the user moves between Studio and Library.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayerProvider>
      <div className="flex min-h-dvh flex-col">
        <Nav />
        <main className="flex-1 px-4 pb-28 sm:px-8">{children}</main>
      </div>
      <PlayerBar />
    </PlayerProvider>
  );
}
