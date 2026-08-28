import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://showops-prototype.langaz35.chatgpt.site'),
  title: 'ShowOps — Run today. Learn for next time.',
  description: 'A local-first prototype for clearer event-day operations.',
  manifest: '/manifest.webmanifest',
  applicationName: 'ShowOps',
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'ShowOps',
    description: 'Run today. Learn for next time.',
    type: 'website',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ShowOps',
    description: 'Run today. Learn for next time.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
