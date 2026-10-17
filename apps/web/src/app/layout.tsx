import type { Metadata } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

// The three canvas fonts. globals.css reads them through these CSS variables.
const geist = Geist({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap', variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], weight: '400', display: 'swap', variable: '--font-geist-mono' });
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: 'italic',
  display: 'swap',
  variable: '--font-instrument-serif',
});

export const metadata: Metadata = {
  title: 'Minstrel',
  description: 'Make songs with your own music provider keys.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
