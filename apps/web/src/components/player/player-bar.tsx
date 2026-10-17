'use client';

import type { KeyboardEvent } from 'react';
import { formatDuration } from '@/lib/format';
import { usePlayer } from './player-context';

const SKIP_SECONDS = 5;

// Spec §10.3: the player responds to Space and the arrow keys when it has focus.
export function PlayerBar() {
  const { current, playing, position, duration, toggle, seek, skip } = usePlayer();
  if (!current) return null;

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    // The button and the slider have their own keys. Only the bar itself takes these.
    if (event.target !== event.currentTarget) return;
    if (event.key === ' ') {
      event.preventDefault();
      toggle();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      skip(SKIP_SECONDS);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      skip(-SKIP_SECONDS);
    }
  }

  return (
    <section
      aria-label="Player"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="fixed inset-x-0 bottom-0 z-10 flex items-center gap-4 border-t border-soft bg-panel px-4 py-3 sm:px-8"
    >
      <button
        type="button"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={toggle}
        className="btn btn-soft min-w-11 justify-center"
      >
        <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
      </button>
      <span className="min-w-0 max-w-[40%] truncate font-extrabold">{current.title}</span>
      <input
        type="range"
        aria-label="Position"
        min={0}
        max={Math.max(duration, 0)}
        step={1}
        value={Math.min(position, duration || position)}
        onChange={(event) => seek(Number(event.target.value))}
        className="min-w-0 flex-1"
      />
      <span className="text-muted text-sm tabular-nums">
        {formatDuration(position) || '0:00'} / {formatDuration(duration) || '–:––'}
      </span>
    </section>
  );
}
