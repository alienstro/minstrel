import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ContactForm } from '@/components/legal/contact-form';
import { ContactLink } from '@/components/legal/legal-document';

export const metadata: Metadata = { title: 'Contact · Minstrel' };

const ROW = 'border-b border-dotted border-black/10 px-1 py-4 first:border-t';
const SIDE_TITLE = 'mt-0 mb-3 text-[11px] font-semibold uppercase';

const ANSWERS: { question: string; answer: ReactNode }[] = [
  {
    question: 'My key does not work.',
    answer: (
      <>
        Open{' '}
        <Link href="/settings/connections" className="dotted">
          Connections
        </Link>{' '}
        and press Test. The result tells you what the service said.
      </>
    ),
  },
  {
    question: 'Who charges me for songs?',
    answer: 'Your music service does, on your own account. Minstrel never sees your card.',
  },
  {
    question: 'How do I delete my account?',
    answer: (
      <>
        Go to Settings, then{' '}
        <Link href="/settings/account" className="dotted">
          Account
        </Link>
        , then Delete account.
      </>
    ),
  },
];

// The Contact artboard: a message card, other ways to reach Minstrel, and quick answers.
export default function ContactPage() {
  return (
    <>
      <div className="flex flex-col items-center gap-4 px-8 py-14 text-center">
        <h1 className="m-0 text-[13px] font-semibold uppercase">
          <span>We read every message</span>{' '}
          <span className="serif mt-1 block text-[56px] leading-none normal-case sm:text-[80px]">Contact</span>
        </h1>
        <span className="pill gl mono min-h-[34px] px-4 text-[11px]">We answer by email</span>
      </div>
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-start gap-x-16 gap-y-10 px-4 pt-8 pb-24 text-[14px] leading-[1.6] sm:px-8">
        <section aria-label="Send a message" className="card min-w-0 flex-[999_1_520px] p-7">
          <ContactForm />
        </section>
        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-10">
          <section aria-labelledby="ways-h">
            <h2 id="ways-h" className={SIDE_TITLE}>
              Other ways
            </h2>
            <ul className="m-0 list-none p-0">
              <li className={ROW}>
                <span className="block font-medium">Email</span>
                <ContactLink />
              </li>
              <li className={ROW}>
                <span className="block font-medium">Privacy requests</span>
                <ContactLink />
              </li>
            </ul>
          </section>
          <section aria-labelledby="faq-h">
            <h2 id="faq-h" className={SIDE_TITLE}>
              Quick answers
            </h2>
            <ul className="m-0 list-none p-0">
              {ANSWERS.map((item) => (
                <li key={item.question} className={ROW}>
                  <span className="serif block text-[22px] leading-[1.2]">“{item.question}”</span>
                  <span className="mu">{item.answer}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
