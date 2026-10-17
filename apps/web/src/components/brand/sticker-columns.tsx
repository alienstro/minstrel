import type { CSSProperties } from 'react';
import './sticker-columns.css';

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

const BIG_STAR = star(14, 50, 42);
const SMALL_STAR = star(10, 50, 38);

type Sticker =
  | { kind: 'photo'; r: number; img: string }
  | { kind: 'star'; r: number; d: string }
  | { kind: 'badge'; r: number }
  | { kind: 'tag'; r: number; text: string };

type Photos = [string, string, string];

// The left column. The right column starts 3 stickers later, turns the other way, and shows other photos and providers.
function stickers(left: Photos, right: Photos): { left: Sticker[]; right: Sticker[] } {
  const base: Sticker[] = [
    { kind: 'photo', r: -6, img: left[0] },
    { kind: 'star', r: 8, d: BIG_STAR },
    { kind: 'photo', r: 5, img: left[1] },
    { kind: 'tag', r: -4, text: 'kie.ai' },
    { kind: 'badge', r: 6 },
    { kind: 'photo', r: -3, img: left[2] },
    { kind: 'tag', r: 3, text: 'ElevenLabs' },
    { kind: 'star', r: -10, d: SMALL_STAR },
  ];
  const swap: Record<string, string> = {
    [left[0]]: right[0],
    [left[1]]: right[1],
    [left[2]]: right[2],
    'kie.ai': 'Suno',
    ElevenLabs: 'OpenRouter',
  };
  const mirrored = [...base.slice(3), ...base.slice(0, 3)].map((s): Sticker => {
    if (s.kind === 'photo') return { ...s, r: -s.r, img: swap[s.img] ?? s.img };
    if (s.kind === 'tag') return { ...s, r: -s.r, text: swap[s.text] ?? s.text };
    return { ...s, r: -s.r };
  });
  return { left: base, right: mirrored };
}

export const photoStyle = (img: string): CSSProperties => ({ backgroundImage: `url(/photos/${img}.jpg)` });

interface Sizes {
  star: number;
  badge: number;
}

function StickerView({ sticker, side, lines, sizes }: { sticker: Sticker; side: 'left' | 'right'; lines: string[]; sizes: Sizes }) {
  return (
    <span style={{ display: 'block', transform: `rotate(${sticker.r}deg)` }}>
      {sticker.kind === 'photo' ? (
        <span className="stk-pol">
          <span className="stk-photo" style={photoStyle(sticker.img)} />
        </span>
      ) : null}
      {sticker.kind === 'star' ? (
        <svg width={sizes.star} height={sizes.star} viewBox="0 0 100 100">
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
        <svg width={sizes.badge} height={sizes.badge} viewBox="0 0 100 100">
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
        <svg width={sizes.badge} height={sizes.badge} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="48" fill="#111111" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="#555555" strokeWidth="1" />
          <circle cx="50" cy="50" r="10" fill="#ffffff" />
        </svg>
      ) : null}
      {sticker.kind === 'tag' ? (
        <span className={`stk-tag ${side === 'left' ? 'stk-tag-dark' : 'stk-tag-light'}`}>{sticker.text}</span>
      ) : null}
    </span>
  );
}

interface StickerColumnsProps {
  /** The two short lines on the black stars of the left column. */
  starText: [string, string];
  /** The 3 photos of the left column, then the 3 photos of the right column. */
  photos: { left: Photos; right: Photos };
  /** Home uses larger stickers than the auth screens. */
  large?: boolean;
  /** The distance of each column from the edge of the page, in px. */
  inset?: number;
}

// Decorative only, so screen readers skip the two columns.
export function StickerColumns({ starText, photos, large = false, inset = 20 }: StickerColumnsProps) {
  const sets = stickers(photos.left, photos.right);
  const sizes = large ? { star: 118, badge: 112 } : { star: 108, badge: 104 };
  return (
    <>
      {(['left', 'right'] as const).map((side) => (
        <div
          key={side}
          className={`stk-col ${large ? 'stk-large' : ''} ${side === 'right' ? 'stk-right' : ''}`}
          style={side === 'left' ? { left: inset } : { right: inset }}
          aria-hidden="true"
        >
          {/* The track holds the list two times, so the scroll loops without a jump. */}
          <div className="stk-track">
            {[...sets[side], ...sets[side]].map((sticker, i) => (
              <StickerView key={i} sticker={sticker} side={side} lines={side === 'left' ? starText : ['V6']} sizes={sizes} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
