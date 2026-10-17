import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Logo } from './logo';
import { photoStyle, StickerColumns } from './sticker-columns';
import './auth-stage.css';

const COVERS = Array.from({ length: 18 }, (_, n) => ({
  angle: n * 20,
  delay: `${(0.2 + n * 0.05).toFixed(2)}s`,
  img: `i${(n % 12) + 1}`,
}));

const delay = (seconds: number): CSSProperties => ({ animationDelay: `${seconds}s` });

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

      <StickerColumns starText={starText} photos={{ left: ['i2', 'i7', 'i11'], right: ['i9', 'i12', 'i3'] }} />

      <div className="auth-ringmask" aria-hidden="true">
        <div className="auth-ringpos">
          <div className="auth-ring">
            {COVERS.map((cover) => (
              <div key={cover.angle} className="auth-slot" style={{ transform: `rotate(${cover.angle}deg) translateY(-400px)` }}>
                <span className="auth-cv" style={{ ...photoStyle(cover.img), animationDelay: cover.delay }} />
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
