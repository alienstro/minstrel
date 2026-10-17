import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayerBar } from './player-bar';
import { PlayerProvider, usePlayer, type PlayerTrack } from './player-context';

const track: PlayerTrack = {
  id: 't-1',
  title: 'The Cat Who Sailed',
  style: 'shanty, accordion',
  durationSeconds: 161,
};

function PlayButton() {
  const { play } = usePlayer();
  return (
    <button type="button" onClick={() => play(track)}>
      Play take
    </button>
  );
}

function renderPlayer() {
  render(
    <PlayerProvider>
      <PlayButton />
      <PlayerBar />
    </PlayerProvider>,
  );
  return document.querySelector('audio')!;
}

const handlers = new Map<string, MediaSessionActionHandler | null>();
const mediaSession = {
  metadata: null as MediaMetadata | null,
  playbackState: 'none',
  setActionHandler: (action: string, handler: MediaSessionActionHandler | null) => handlers.set(action, handler),
  setPositionState: vi.fn(),
};

beforeEach(() => {
  handlers.clear();
  mediaSession.metadata = null;
  Object.defineProperty(navigator, 'mediaSession', { value: mediaSession, configurable: true });
  vi.stubGlobal(
    'MediaMetadata',
    class {
      constructor(readonly init: MediaMetadataInit) {
        Object.assign(this, init);
      }
    },
  );
  // jsdom has no media playback. These stubs fire the events that a browser fires.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
    this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('player', () => {
  it('play sets the audio source to the stream route', async () => {
    const audio = renderPlayer();

    await userEvent.click(screen.getByRole('button', { name: 'Play take' }));

    expect(audio.getAttribute('src')).toBe('/api/tracks/t-1/stream');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Player' })).toHaveTextContent('The Cat Who Sailed');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('Media Session gets the title', async () => {
    renderPlayer();

    await userEvent.click(screen.getByRole('button', { name: 'Play take' }));

    expect(mediaSession.metadata).toMatchObject({ title: 'The Cat Who Sailed', artist: 'Minstrel' });
    expect(handlers.get('pause')).toEqual(expect.any(Function));
    act(() => handlers.get('pause')!({ action: 'pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('Space toggles play when the bar has focus', async () => {
    renderPlayer();
    await userEvent.click(screen.getByRole('button', { name: 'Play take' }));
    const bar = screen.getByRole('region', { name: 'Player' });
    bar.focus();

    await userEvent.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();

    await userEvent.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('ArrowRight seeks forward', async () => {
    const audio = renderPlayer();
    await userEvent.click(screen.getByRole('button', { name: 'Play take' }));
    Object.defineProperty(audio, 'duration', { value: 161, configurable: true });
    audio.currentTime = 30;
    const bar = screen.getByRole('region', { name: 'Player' });
    bar.focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(audio.currentTime).toBe(35);

    await userEvent.keyboard('{ArrowLeft}');
    expect(audio.currentTime).toBe(30);
  });

  it('a failed load after a long pause gets a fresh stream URL at the same place', async () => {
    const audio = renderPlayer();
    await userEvent.click(screen.getByRole('button', { name: 'Play take' }));
    audio.currentTime = 80;
    fireEvent.timeUpdate(audio);
    vi.mocked(HTMLMediaElement.prototype.load).mockClear();

    // A signed URL lasts 15 minutes. The stream route gives a new one.
    fireEvent.error(audio);

    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1);
    fireEvent.loadedMetadata(audio);
    expect(audio.currentTime).toBe(80);
  });

  it('Close player stops the song and removes the bar', async () => {
    const audio = renderPlayer();
    await userEvent.click(screen.getByRole('button', { name: 'Play take' }));

    await userEvent.click(screen.getByRole('button', { name: 'Close player' }));

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(audio.getAttribute('src')).toBeNull();
    expect(screen.queryByRole('region', { name: /Player/ })).toBeNull();
  });

  it('Hide player keeps the song and shows a small bar', async () => {
    renderPlayer();
    await userEvent.click(screen.getByRole('button', { name: 'Play take' }));

    await userEvent.click(screen.getByRole('button', { name: 'Hide player' }));

    const small = screen.getByRole('region', { name: 'Player, hidden' });
    expect(small).toHaveTextContent('The Cat Who Sailed');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show player' }));
    expect(screen.getByRole('region', { name: 'Player' })).toBeInTheDocument();
  });
});
