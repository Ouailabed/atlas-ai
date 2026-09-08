import './globals.css';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(APP_URL),
  title: 'ATLAS — Your Personal AI. Always Working.',
  description:
    'An autonomous AI operating system that handles your emails, calendar, jobs, finances, and decisions. 24/7.',
  applicationName: 'Atlas',
  openGraph: {
    type: 'website',
    siteName: 'Atlas',
    title: 'ATLAS — Your Personal AI. Always Working.',
    description:
      'An autonomous AI operating system that handles your emails, calendar, jobs, finances, and decisions. 24/7.',
    url: APP_URL,
    images: [
      {
        url: '/atlas-hero.png',
        width: 1200,
        height: 630,
        alt: 'Atlas — your personal AI',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ATLAS — Your Personal AI. Always Working.',
    description:
      'An autonomous AI operating system that handles your emails, calendar, jobs, finances, and decisions. 24/7.',
    images: ['/atlas-hero.png'],
  },
  robots: { index: true, follow: true },
};

export const viewport = {
  themeColor: '#0a0806',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
