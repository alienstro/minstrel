import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';

// The privacy policy and the terms read these values, so the two pages always agree.
export const LEGAL = {
  operator: 'Robinx Prhynz Aquino',
  email: 'robinxaquino@gmail.com',
  site: 'https://minstrel.alienstro.xyz',
  updated: '17 October 2026',
} as const;

export function ContactLink() {
  return (
    <a href={`mailto:${LEGAL.email}`} className="dotted">
      {LEGAL.email}
    </a>
  );
}

const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

interface LegalSectionProps {
  title: string;
  children: ReactNode;
}

export function LegalSection({ title, children }: LegalSectionProps) {
  return (
    <section id={slug(title)} className="flex scroll-mt-6 flex-col gap-3 border-b border-dotted border-black/10 py-7 text-[#333333] last:border-b-0">
      <h2 className="serif m-0 text-[34px] leading-[1.1] text-ink">{title}</h2>
      {children}
    </section>
  );
}

interface LegalDocumentProps {
  /** The small uppercase line above the heading. */
  label: string;
  /** The large serif heading. */
  title: string;
  /** The "In short" points at the top of the document. */
  summary: string[];
  children: ReactNode;
}

// The Privacy and Terms artboards: a centered heading, a sticky "On this page" list, an "In short" card,
// and the sections. The list reads the section titles, so each title is written only once.
export function LegalDocument({ label, title, summary, children }: LegalDocumentProps) {
  const titles = Children.toArray(children)
    .filter((child): child is ReactElement<LegalSectionProps> => isValidElement(child) && child.type === LegalSection)
    .map((section) => section.props.title);
  return (
    <>
      <div className="flex flex-col items-center gap-4 px-8 py-14 text-center">
        <h1 className="m-0 text-[13px] font-semibold uppercase">
          <span>{label}</span>{' '}
          <span className="serif mt-1 block text-[56px] leading-none normal-case sm:text-[80px]">{title}</span>
        </h1>
        <span className="pill gl mono min-h-[34px] px-4 text-[11px]">Last updated {LEGAL.updated}</span>
      </div>
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-start gap-x-[72px] gap-y-10 px-4 pt-8 pb-24 text-[14px] leading-[1.6] sm:px-8">
        <nav aria-label="On this page" className="mono sticky top-6 flex-[1_1_220px] text-[12px]">
          <span className="block pb-2 font-sans text-[11px] font-semibold uppercase">On this page</span>
          {titles.map((sectionTitle) => (
            <a
              key={sectionTitle}
              href={`#${slug(sectionTitle)}`}
              className="mu block border-b border-dotted border-black/10 px-1 py-[9px] no-underline hover:text-ink"
            >
              {sectionTitle}
            </a>
          ))}
        </nav>
        <article className="min-w-0 max-w-[680px] flex-[999_1_560px]">
          <div className="card px-7 py-6">
            <span className="text-[11px] font-semibold uppercase">In short</span>
            <ul className="m-0 list-disc pl-[18px]">
              {summary.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
          {children}
        </article>
      </div>
    </>
  );
}
