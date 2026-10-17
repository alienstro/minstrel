'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface PlayerTrack {
  id: string;
  title: string;
  style?: string | null;
  durationSeconds?: number | null;
}

interface PlayerValue {
  current: PlayerTrack | null;
  playing: boolean;
  /** Seconds from the start. */
  position: number;
  /** Seconds. 0 while the length is not known. */
  duration: number;
  play(track: PlayerTrack): void;
  pause(): void;
  toggle(): void;
  /** Moves to a time in seconds. */
  seek(seconds: number): void;
  /** Moves forward (or back, with a negative value) from the current time. */
  skip(seconds: number): void;
  /** Stops the song and removes the player. */
  close(): void;
}

const PlayerContext = createContext<PlayerValue | null>(null);

// The API redirects to a signed URL (spec §5.5), or to the provider URL before the copy ends.
const streamUrl = (id: string) => `/api/tracks/${id}/stream`;

// One <audio> element for the whole signed-in app, so a song keeps playing across pages.
export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState<PlayerTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const currentRef = useRef<PlayerTrack | null>(null);
  // A signed URL lasts 15 minutes. After a load error, the player loads the stream route again once
  // and goes back to the last known time.
  const lastTime = useRef(0);
  const resumeAt = useRef<number | null>(null);
  const reloaded = useRef(false);

  const play = useCallback((track: PlayerTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentRef.current?.id !== track.id) {
      currentRef.current = track;
      setCurrent(track);
      setPosition(0);
      setDuration(track.durationSeconds ?? 0);
      lastTime.current = 0;
      reloaded.current = false;
      audio.src = streamUrl(track.id);
    }
    audio.play().catch(() => setPlaying(false));
  }, []);

  const pause = useCallback(() => audioRef.current?.pause(), []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentRef.current) return;
    if (audio.paused) audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !currentRef.current) return;
    const end = Number.isFinite(audio.duration)
      ? audio.duration
      : (currentRef.current.durationSeconds ?? Number.POSITIVE_INFINITY);
    const to = Math.min(Math.max(seconds, 0), end);
    audio.currentTime = to;
    lastTime.current = to;
    setPosition(to);
  }, []);

  const skip = useCallback(
    (seconds: number) => seek((audioRef.current?.currentTime ?? 0) + seconds),
    [seek],
  );

  const close = useCallback(() => {
    const audio = audioRef.current;
    // Clear the track first, so that onError does not load the stream again.
    currentRef.current = null;
    setCurrent(null);
    setPosition(0);
    setDuration(0);
    if (!audio) return;
    audio.pause();
    // Without a source, load() stops the download of the old stream.
    audio.removeAttribute('src');
    audio.load();
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  }, []);

  // Media Session: the lock screen and the media keys show the song and control the player.
  useEffect(() => {
    if (!current || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: 'Minstrel',
      album: current.style ?? undefined,
    });
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => audioRef.current?.play().catch(() => setPlaying(false))],
      ['pause', () => audioRef.current?.pause()],
      ['seekto', (details) => seek(details.seekTime ?? 0)],
      ['seekbackward', (details) => skip(-(details.seekOffset ?? 10))],
      ['seekforward', (details) => skip(details.seekOffset ?? 10)],
    ];
    for (const [action, handler] of actions) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // A browser can refuse an action that it does not support.
      }
    }
  }, [current, seek, skip]);

  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }, [playing]);

  const onLoadedMetadata = () => {
    const audio = audioRef.current!;
    reloaded.current = false;
    if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    if (resumeAt.current !== null) {
      audio.currentTime = resumeAt.current;
      resumeAt.current = null;
    }
  };

  const onError = () => {
    const audio = audioRef.current;
    const track = currentRef.current;
    if (!audio || !track || reloaded.current) return;
    reloaded.current = true;
    resumeAt.current = lastTime.current;
    audio.src = streamUrl(track.id);
    audio.load();
  };

  const value = useMemo<PlayerValue>(
    () => ({ current, playing, position, duration, play, pause, toggle, seek, skip, close }),
    [current, playing, position, duration, play, pause, toggle, seek, skip, close],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={() => {
          const time = audioRef.current!.currentTime;
          lastTime.current = time;
          setPosition(time);
        }}
        onLoadedMetadata={onLoadedMetadata}
        onError={onError}
      />
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerValue {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('usePlayer needs a PlayerProvider');
  return value;
}
