'use client';

import { type FormEvent, useId, useState } from 'react';
import { FieldError } from '@/components/ui/text-field';
import { LEGAL } from './legal-document';

const TOPICS = [
  { label: 'A key does not work', hint: 'Which service is it, and what does the Test button say?' },
  { label: 'A song failed', hint: 'Which song, which service, and about what time?' },
  { label: 'Privacy', hint: 'Tell us what you want: a copy of your data, a correction, or a deletion.' },
  { label: 'An idea', hint: 'What should Minstrel do next?' },
  { label: 'Something else', hint: 'Tell us what happened.' },
];

interface ContactMessage {
  topic: string;
  name: string;
  message: string;
}

// Minstrel has no API for contact messages, so the form writes an email in the visitor's email app.
export function contactMailto({ topic, name, message }: ContactMessage): string {
  const body = name ? `${message}\n\n${name}` : message;
  return `mailto:${LEGAL.email}?subject=${encodeURIComponent(`Minstrel: ${topic}`)}&body=${encodeURIComponent(body)}`;
}

const LABEL = 'pl-[18px] text-[11px] font-semibold uppercase';

export function ContactForm({ openMail = (url) => window.location.assign(url) }: { openMail?: (url: string) => void }) {
  const ids = useId();
  const [topic, setTopic] = useState(0);
  const [error, setError] = useState<string>();
  const [opened, setOpened] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = String(form.get('message') ?? '').trim();
    if (!message) return setError('Write a message.');
    setError(undefined);
    openMail(contactMailto({ topic: TOPICS[topic].label, name: String(form.get('name') ?? '').trim(), message }));
    setOpened(true);
  }

  const messageId = `${ids}-message`;
  return (
    <form noValidate onSubmit={onSubmit} aria-label="Write to Minstrel" className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-2">
        <span className={LABEL} id={`${ids}-topic`}>
          What is it about?
        </span>
        <div role="group" aria-labelledby={`${ids}-topic`} className="flex flex-wrap gap-1.5">
          {TOPICS.map((item, i) => (
            <button
              key={item.label}
              type="button"
              className={`pill min-h-9 px-4 text-[12px] ${i === topic ? 'dark' : 'gl'}`}
              aria-pressed={i === topic}
              onClick={() => setTopic(i)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label className={LABEL} htmlFor={`${ids}-name`}>
          Name
        </label>
        <input className="in" id={`${ids}-name`} name="name" type="text" autoComplete="name" />
      </div>
      <div className="flex flex-col gap-2">
        <label className={LABEL} htmlFor={messageId}>
          Message
        </label>
        <textarea
          className="in resize-y rounded-[22px] leading-[1.6]"
          id={messageId}
          name="message"
          rows={6}
          placeholder={TOPICS[topic].hint}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${messageId}-error` : undefined}
        />
        {error ? <FieldError id={`${messageId}-error`}>{error}</FieldError> : null}
        <p className="mono mu m-0 pl-[18px] text-[11px]">Never paste an API key here. We do not need it to help you.</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {opened ? (
          <p role="status" className="mu m-0 text-[13px]">
            Your email app opens with the message. Send it from there.
          </p>
        ) : null}
        <button type="submit" className="pill dark">
          Write the email <span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}
