import type { Metadata } from 'next';
import { Mrs_Saint_Delafield } from 'next/font/google';
import { AuthForm } from '@/components/auth/auth-form';
import { photoStyle } from '@/components/brand/sticker-columns';
import { HomeHero } from '@/components/home/home-hero';
import { SiteFooter } from '@/components/legal/site-footer';

export const metadata: Metadata = { title: 'Minstrel · Make songs with your own keys' };

// The signature in the closing section. Only Home uses this font.
const signature = Mrs_Saint_Delafield({ subsets: ['latin'], weight: '400', display: 'swap' });

const ABOUT = [
  'Minstrel started with a simple wish: say what a song is about, and hear it a minute later. No studio, no plug-ins and no new subscription.',
  'It works with the music services you already pay for. Paste a kie.ai key, and Minstrel talks to it for you.',
  'When you want help, a text model writes the lyrics, the style and the title. Any OpenAI-compatible service works, so you choose the voice behind the words.',
  'Every take lands in your library. Play it, rename it, download it or keep it. Your keys stay encrypted, and your songs stay yours.',
];

// The Home artboard. The proxy sends a signed-in user to /studio, so only a signed-out visitor sees it.
export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <HomeHero />
      <main>
        <section className="home-sec pt-28 pb-32" id="signin" aria-labelledby="signin-h">
          <h2 className="home-h" id="signin-h">
            Your keys. Your songs.<span className="serif">Start a song</span>
          </h2>
          <div className="mx-auto mt-10 max-w-[760px]">
            <AuthForm mode="sign-in" bare />
          </div>
        </section>

        <section className="home-sec pb-40" aria-labelledby="about-h">
          <div
            className="home-photo home-about-photo absolute top-[300px] left-8 h-[330px] w-[260px]"
            role="img"
            aria-label="A home recording studio with a drum kit and a keyboard"
            style={photoStyle('p2')}
          />
          <div
            className="home-photo home-about-photo absolute top-20 right-8 h-[220px] w-[300px]"
            role="img"
            aria-label="A small home studio with guitars and speakers"
            style={photoStyle('p3')}
          />
          <div className="relative mx-auto max-w-[380px]">
            <h2 className="home-h mb-[52px]" id="about-h">
              The art of turning ideas into<span className="serif">Songs</span>
            </h2>
            {ABOUT.map((text) => (
              <p key={text} className="mu mt-0 mb-9 leading-loose last:mb-0">
                {text}
              </p>
            ))}
          </div>
        </section>

        <section className="home-sec pb-36" aria-labelledby="ack-h">
          <div className="flex flex-wrap items-center gap-x-20 gap-y-14">
            <div
              className="home-photo h-[440px] flex-[1_1_420px]"
              role="img"
              aria-label="Vinyl records on a shelf next to a turntable"
              style={photoStyle('p1')}
            />
            <div className="flex flex-[1_1_360px] flex-col gap-7">
              <h2 className="m-0 text-[13px] font-semibold uppercase" id="ack-h">
                Your keys. Your songs.
              </h2>
              <span aria-hidden="true" className={`${signature.className} text-[96px] leading-[0.8]`}>
                Minstrel
              </span>
              <p className="mu m-0 max-w-[420px] leading-[1.8]">
                Songs for the <span className="serif text-[16px]">hummers</span>, the{' '}
                <span className="serif text-[16px]">shower singers</span>, the{' '}
                <span className="serif text-[16px]">tinkerers</span> and the{' '}
                <span className="serif text-[16px]">late-night writers</span>. Your keys stay yours. Your songs stay
                yours.
              </p>
              <a className="pill dark self-start" href="#signin">
                Sign in <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter credits />
    </div>
  );
}
