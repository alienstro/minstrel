import Link from 'next/link';
import { Fragment } from 'react';
import { Logo } from '@/components/brand/logo';
import { PHOTO_CREDITS } from './photo-credits';

// The canvas footer. Google requires that the home page links to the privacy policy before it publishes
// the consent screen. `credits` adds the photo credits that CC BY 2.0 requires on a page that shows the photos.
export function SiteFooter({ credits = false }: { credits?: boolean }) {
  return (
    <footer className="mx-auto w-full max-w-[1200px] px-4 pb-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-dotted border-[var(--bd)] pt-5">
        <span className="flex items-center gap-2.5">
          <Logo size={20} />
          2026 Minstrel
        </span>
        <span className="mu">All rights reserved</span>
        <nav aria-label="Legal" className="flex gap-5">
          <Link href="/privacy" className="dotted">
            Privacy
          </Link>
          <Link href="/terms" className="dotted">
            Terms
          </Link>
          <Link href="/contact" className="dotted">
            Contact
          </Link>
        </nav>
      </div>
      {credits ? (
        <p className="mono mu mt-4 mb-0 text-[10px] leading-[1.7]">
          Photos, cropped:{' '}
          {PHOTO_CREDITS.map((credit, i) => (
            <Fragment key={credit.img}>
              {i > 0 ? ', ' : null}
              <a className="dotted" href={credit.source}>
                {credit.creator}
              </a>
              {credit.license === 'CC0 1.0' ? ' (CC0)' : null}
            </Fragment>
          ))}
          . The other photos use the{' '}
          <a className="dotted" href="https://creativecommons.org/licenses/by/2.0/">
            CC BY 2.0
          </a>{' '}
          license.
        </p>
      ) : null}
    </footer>
  );
}
