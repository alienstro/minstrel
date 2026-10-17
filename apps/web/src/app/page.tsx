import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Minstrel · Make songs with your own keys' };

const STEPS = [
  {
    title: 'Add your key',
    text: 'Paste a key from kie.ai, a Suno-compatible service, or ElevenLabs Music. Minstrel keeps it encrypted.',
  },
  {
    title: 'Write an idea',
    text: 'Say what the song is about. Minstrel can write the lyrics, suggest a style, and suggest a title.',
  },
  {
    title: 'Make the song',
    text: 'Press Make song. Play each take as it arrives, then keep it in your library.',
  },
];

// Spec §10.1: a signed-out visitor sees what Minstrel does in three steps. The proxy sends a
// signed-in user to /studio.
export default function Home() {
  return (
    <div className="laser-scene flex min-h-dvh flex-col px-4 py-6 sm:px-8">
      <span className="type-page-title">Minstrel</span>
      <main className="mx-auto mt-16 flex w-full max-w-3xl flex-col gap-10">
        <h1 className="type-page-title">Make songs with your own music provider keys.</h1>
        <ol className="grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card flex flex-col gap-2">
              <span className="card-pill">Step {i + 1}</span>
              <h2 className="type-section-title">{step.title}</h2>
              <p className="text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/sign-up" className="btn btn-primary">
            Create an account <span aria-hidden="true">›</span>
          </Link>
          <Link href="/sign-in" className="btn btn-text">
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
