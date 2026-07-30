import type { Metadata, Viewport } from 'next';
import { Inter, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/*
 * Inter for the interface, downloaded at build time and served from this app —
 * no CDN call at runtime, so the plant's network cannot leave the UI in a
 * fallback face.
 *
 * A mono cut is kept for indent numbers, quantities and phone numbers. Those
 * are read as columns of digits rather than as words, and MQ/IND/26-27/0953 is
 * materially easier to check character by character when the digits are all one
 * width.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Purchase Indent · Marudhar Quartz',
  description: 'Raise, approve and track purchase indents.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
