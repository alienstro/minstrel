import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Logo } from './logo';
import './auth-stage.css';

// A star with sharp points, drawn in a 100 x 100 box.
function star(points: number, outer: number, inner: number): string {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / points - Math.PI / 2;
    d += `${i ? 'L' : 'M'}${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
}

type Sticker =
  | { kind: 'photo'; r: number; img: string }
  | { kind: 'star'; r: number; d: string }
  | { kind: 'badge'; r: number }
  | { kind: 'tag'; r: number; text: string };

const LEFT: Sticker[] = [
  { kind: 'photo', r: -6, img: 'i2' },
  { kind: 'star', r: 8, d: star(14, 50, 42) },
  { kind: 'photo', r: 5, img: 'i7' },
  { kind: 'tag', r: -4, text: 'kie.ai' },
  { kind: 'badge', r: 6 },
  { kind: 'photo', r: -3, img: 'i11' },
  { kind: 'tag', r: 3, text: 'ElevenLabs' },
  { kind: 'star', r: -10, d: star(10, 50, 38) },
];

// The right column starts 3 stickers later, turns the other way, and names other photos and providers.
const SWAP: Record<string, string> = { i2: 'i9', i7: 'i12', i11: 'i3', 'kie.ai': 'Suno', ElevenLabs: 'OpenRouter' };
const RIGHT: Sticker[] = [...LEFT.slice(3), ...LEFT.slice(0, 3)].map((s) => {
  if (s.kind === 'photo') return { ...s, r: -s.r, img: SWAP[s.img] ?? s.img };
  if (s.kind === 'tag') return { ...s, r: -s.r, text: SWAP[s.text] ?? s.text };
  return { ...s, r: -s.r };
});

const COVERS = Array.from({ length: 18 }, (_, n) => ({
  angle: n * 20,
  delay: `${(0.2 + n * 0.05).toFixed(2)}s`,
  img: `i${(n % 12) + 1}`,
}));

const photo = (img: string): CSSProperties => ({ backgroundImage: `url(/photos/${img}.jpg)` });
const delay = (seconds: number): CSSProperties => ({ animationDelay: `${seconds}s` });

function StickerView({ sticker, side, starText }: { sticker: Sticker; side: 'left' | 'right'; starText: string[] }) {
  const lines = side === 'left' ? starText : ['V6'];
  return (
    <span style={{ display: 'block', transform: `rotate(${sticker.r}deg)` }}>
      {sticker.kind === 'photo' ? (
        <span className="auth-pol">
          <span className="auth-photo" style={photo(sticker.img)} />
        </span>
      ) : null}
      {sticker.kind === 'star' ? (
        <svg width="108" height="108" viewBox="0 0 100 100">
          <path d={sticker.d} fill="#111111" />
          {lines.map((line, i) => (
            <text
              key={line}
              x="50"
              y={lines.length === 1 ? 54 : 47 + i * 14}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize={lines.length === 1 ? 12 : 11}
              fill="#ffffff"
            >
              {line}
            </text>
          ))}
        </svg>
      ) : null}
      {sticker.kind === 'badge' && side === 'left' ? (
        <svg width="104" height="104" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#111111" strokeWidth="2" />
          <text x="50" y="49" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="12" fill="#111111">
            SIDE A
          </text>
          <text x="50" y="63" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="#111111">
            TAKE 01
          </text>
        </svg>
      ) : null}
      {sticker.kind === 'badge' && side === 'right' ? (
        <svg width="104" height="104" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="48" fill="#111111" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="#555555" strokeWidth="1" />
          <circle cx="50" cy="50" r="10" fill="#ffffff" />
        </svg>
      ) : null}
      {sticker.kind === 'tag' ? (
        <span className={`auth-tag ${side === 'left' ? 'auth-tag-dark' : 'auth-tag-light'}`}>{sticker.text}</span>
      ) : null}
    </span>
  );
}

function Column({ side, starText }: { side: 'left' | 'right'; starText: string[] }) {
  const stickers = side === 'left' ? LEFT : RIGHT;
  // The track holds the list two times, so the scroll loops without a jump.
  return (
    <div
      className={`auth-col ${side === 'right' ? 'auth-right' : ''}`}
      style={side === 'left' ? { left: 20 } : { right: 20 }}
      aria-hidden="true"
    >
      <div className="auth-track">
        {[...stickers, ...stickers].map((sticker, i) => (
          <StickerView key={i} sticker={sticker} side={side} starText={starText} />
        ))}
      </div>
    </div>
  );
}

interface AuthStageProps {
  /** The small uppercase line above the heading. */
  label: string;
  /** The large serif heading. */
  heading: string;
  /** The two short lines on the black star in the left column. */
  starText: [string, string];
  children: ReactNode;
}

export function AuthStage({ label, heading, starText, children }: AuthStageProps) {
  return (
    <div className="auth-stage">
      <header className="auth-header">
        <span className="auth-side" />
        <Link href="/" className="auth-brand">
          <Logo />
          Minstrel
        </Link>
        <span className="auth-side">
          <Link href="/" className={`pill gl auth-back`}>
            Back home
          </Link>
        </span>
      </header>

      <Column side="left" starText={starText} />
      <Column side="right" starText={starText} />

      <div className="auth-ringmask" aria-hidden="true">
        <div className="auth-ringpos">
          <div className="auth-ring">
            {COVERS.map((cover) => (
              <div key={cover.angle} className="auth-slot" style={{ transform: `rotate(${cover.angle}deg) translateY(-400px)` }}>
                <span className="auth-cv" style={{ ...photo(cover.img), animationDelay: cover.delay }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="auth-center">
        <Link href="/" className={`auth-case auth-fu`} aria-label="Minstrel home" style={delay(0.2)}>
          <span className="auth-slide" aria-hidden="true">
            <span className="auth-disc" />
          </span>
          <span className="auth-cover">
            <Logo size={120} tone="white" />
          </span>
        </Link>
        <h1 className={`auth-title auth-fu`} style={delay(0.5)}>
          {label}
          <span className={`serif auth-heading`}>{heading}</span>
        </h1>
      </div>

      <div className={`auth-bottom auth-fu`} style={delay(0.8)}>
        {children}
      </div>
    </div>
  );
}
