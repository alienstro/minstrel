'use client';

import { type CSSProperties, type KeyboardEvent, useState } from 'react';
import { Logo } from '@/components/brand/logo';
import { formatDuration } from '@/lib/format';
import { usePlayer } from './player-context';

const SKIP_SECONDS = 5;

function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      {playing ? (
        <>
          <rect x="3.5" y="2.5" width="3" height="11" rx="1" />
          <rect x="9.5" y="2.5" width="3" height="11" rx="1" />
        </>
      ) : (
        <path d="M4 2.5v11l9-5.5z" />
      )}
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
  );
}

function ChevronIcon({ up }: { up: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d={up ? 'M3.5 10l4.5-4.5 4.5 4.5' : 'M3.5 6l4.5 4.5 4.5-4.5'} />
    </svg>
  );
}

// The canvas player: a white card that floats at the bottom of the page. "Hide" makes it a small pill.
// Spec §10.3: the player responds to Space and the arrow keys when it has focus.
export function PlayerBar() {
  const { current, playing, position, duration, toggle, seek, skip, close } = usePlayer();
  const [hidden, setHidden] = useState(false);
  if (!current) return null;

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    // The buttons and the slider have their own keys. Only the bar itself takes these.
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

  const toggleButton = (
    <button type="button" className="mb" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
      <PlayIcon playing={playing} />
    </button>
  );
  const closeButton = (
    <button type="button" className="pi" aria-label="Close player" onClick={close}>
      <CloseIcon />
    </button>
  );
  const shadow = 'shadow-[0_0_0_1px_rgb(0_0_0/8%),0_18px_40px_-24px_rgb(0_0_0/35%)]';

  return (
    <div className="sticky bottom-6 z-10 mx-auto mb-6 flex w-[min(640px,calc(100%-32px))] justify-center">
      {hidden ? (
        <section aria-label="Player, hidden" className={`inline-flex items-center gap-2.5 rounded-full bg-white p-1.5 ${shadow}`}>
          <span className="art flex size-9 items-center justify-center rounded-full bg-ink" aria-hidden="true">
            <Logo size={18} tone="white" />
          </span>
          <span className="mono max-w-[40vw] truncate text-[11px]">{current.title}</span>
          {toggleButton}
          <button type="button" className="pi" aria-label="Show player" onClick={() => setHidden(false)}>
            <ChevronIcon up />
          </button>
          {closeButton}
        </section>
      ) : (
        <section
          aria-label="Player"
          tabIndex={0}
          onKeyDown={onKeyDown}
          className={`flex w-full items-center gap-4 rounded-[20px] bg-white py-2.5 pr-3 pl-2.5 ${shadow}`}
        >
          <span className="relative h-12 w-[66px] flex-none" aria-hidden="true">
            <span className="disc absolute top-[3px] left-[22px] size-[42px]" data-paused={!playing} />
            <span className="art absolute top-0 left-0 z-[1] flex size-12 items-center justify-center bg-ink">
              <Logo size={26} tone="white" />
            </span>
          </span>
          <div className="flex min-w-0 grow flex-col">
            <span className="mu truncate text-[12px]">{current.style || 'Minstrel'}</span>
            <span className="truncate text-[14px] font-medium">{current.title}</span>
            <div className="flex items-center gap-2.5">
              <span className="mono mu min-w-[30px] flex-none text-[11px] tabular-nums">{formatDuration(position) || '0:00'}</span>
              <input
                type="range"
                aria-label="Position"
                className="seek"
                min={0}
                max={Math.max(duration, 0)}
                step={1}
                value={Math.min(position, duration || position)}
                onChange={(event) => seek(Number(event.target.value))}
                style={{ '--p': `${duration ? (position / duration) * 100 : 0}%` } as CSSProperties}
              />
              <span className="mono mu min-w-[30px] flex-none text-right text-[11px] tabular-nums">
                {formatDuration(duration) || '–:––'}
              </span>
            </div>
          </div>
          <div className="mp" role="group" aria-label="Player controls">
            {toggleButton}
          </div>
          <div className="flex gap-0.5">
            <button type="button" className="pi" aria-label="Hide player" onClick={() => setHidden(true)}>
              <ChevronIcon up={false} />
            </button>
            {closeButton}
          </div>
        </section>
      )}
    </div>
  );
}
