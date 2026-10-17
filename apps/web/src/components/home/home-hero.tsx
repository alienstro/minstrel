'use client';

import Link from 'next/link';
import { type CSSProperties, useState } from 'react';
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

// The Home hero: a record sleeve with sample cover art, and a dock to look through the covers.
// The canvas also plays sample songs. Minstrel has no sample audio yet, so the hero shows covers only.
export function HomeHero() {
  const [current, setCurrent] = useState(0);
  const [hover, setHover] = useState(-1);
  const cover = COVER_CREDITS[current];
  const step = (by: number) => setCurrent((n) => (n + by + COVER_CREDITS.length) % COVER_CREDITS.length);

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
              onClick={() => setCurrent(n)}
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
