'use client';

import Link from 'next/link';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/brand/logo';
import { photoStyle, StickerColumns } from '@/components/brand/sticker-columns';
import { COVER_CREDITS } from '@/components/legal/photo-credits';
import './home.css';

const delay = (seconds: number): CSSProperties => ({ animationDelay: `${seconds}s` });

// The dock item under the pointer grows, and its neighbours grow a little.
function dockWidth(index: number, hover: number): number {
  if (hover < 0) return 56;
  const distance = Math.abs(index - hover);
  return [96, 80, 66][distance] ?? 56;
}

// The sample songs of the covers that have one, by cover image. The files are in public/samples.
const SAMPLE_SONGS: Record<string, string> = {
  i1: '/samples/figuring-out.mp3',
  i2: '/samples/the-cat-who-sailed.mp3',
};

// play() rejects when the browser blocks sound before the first click, or when a pause cuts the load short.
// The button then stays on Play, and the page shows no error.
const ignoreRefusal = () => {};

// The Home hero: a record sleeve with sample cover art, and a dock to look through the covers.
// A cover with a sample song gets a play button. The other covers show the art only.
// The song of the first cover starts when the page loads, and the Pause button stops it (WCAG 1.4.2).
export function HomeHero() {
  const [current, setCurrent] = useState(0);
  const [hover, setHover] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const cover = COVER_CREDITS[current];
  const sample = SAMPLE_SONGS[cover.img];

  useEffect(() => {
    audio.current?.play().catch(ignoreRefusal);
  }, []);

  // A removed audio element keeps playing in the browser, so stop the song before the cover changes.
  const show = (n: number) => {
    audio.current?.pause();
    setPlaying(false);
    setCurrent(n);
  };
  const step = (by: number) => show((current + by + COVER_CREDITS.length) % COVER_CREDITS.length);
  const toggle = () => {
    if (!audio.current) return;
    if (audio.current.paused) audio.current.play().catch(ignoreRefusal);
    else audio.current.pause();
  };

  return (
    <section className="home-hero" aria-label="Minstrel">
      <header className="relative z-[5] flex items-center justify-between px-4 pt-7 sm:px-10">
        <span className="flex-1" />
        <Link href="/" className="inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em] no-underline">
          <Logo />
          Minstrel
        </Link>
        <span className="flex flex-1 justify-end">
          <Link href="/sign-in" className="pill gl min-h-[34px] px-4 text-[12px]">
            Sign in
          </Link>
        </span>
      </header>

      <StickerColumns
        large
        inset={24}
        starText={['NEW', 'TAKE']}
        photos={{ left: ['i1', 'i6', 'i4'], right: ['i5', 'i8', 'i10'] }}
      />

      <div className="home-center">
        <span className="home-fu" style={delay(0.1)}>
          <a className="pill gl min-h-8 pr-4 pl-3 text-[12px]" href="#signin">
            <Logo size={16} />
            Make your own song
          </a>
        </span>
        <div className="home-case home-fu" style={delay(0.25)}>
          <span className="home-disc" aria-hidden="true" />
          <span className="home-cover" role="img" aria-label={`Sample cover art for ${cover.song}`} style={photoStyle(cover.img)} />
        </div>
        <div className="home-fu flex flex-col items-center gap-0.5 text-center" style={delay(0.4)} aria-live="polite">
          <span className="text-[15px] font-medium">{cover.song}</span>
        </div>
        <div className="home-mp home-fu" role="group" aria-label="Cover controls" style={delay(0.5)}>
          <button type="button" className="home-mb" aria-label="Previous cover" onClick={() => step(-1)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 3v10L1 8zM15 3v10L8 8z" />
            </svg>
          </button>
          {sample && (
            <>
              {/* The key gives each song a new audio element. Only the song that starts on load loads with the page. */}
              <audio
                key={sample}
                ref={audio}
                src={sample}
                preload={current === 0 ? 'auto' : 'none'}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
              />
              <button
                type="button"
                className="home-mb"
                aria-label={`${playing ? 'Pause' : 'Play'} ${cover.song}`}
                onClick={toggle}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d={playing ? 'M3 2h4v12H3zM9 2h4v12H9z' : 'M4 2v12l10-6z'} />
                </svg>
              </button>
            </>
          )}
          <button type="button" className="home-mb" aria-label="Next cover" onClick={() => step(1)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M1 3v10l7-5zM8 3v10l7-5z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="home-dock" role="group" aria-label="Sample covers" onMouseLeave={() => setHover(-1)}>
        {COVER_CREDITS.map((credit, n) => (
          <div
            key={credit.img}
            className="home-dk"
            data-on={n === current}
            data-hover={n === hover}
            style={{ width: dockWidth(n, hover) }}
            onMouseEnter={() => setHover(n)}
          >
            <button
              type="button"
              className="home-dkb"
              aria-label={`Show ${credit.song}`}
              aria-pressed={n === current}
              onClick={() => show(n)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(-1)}
            >
              <span className="home-dkc" style={photoStyle(credit.img)} />
            </button>
            <span className="home-tip" aria-hidden="true">
              {credit.song}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
