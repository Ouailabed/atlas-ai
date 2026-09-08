import './globals.css';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const DESC =
  'A personal AI system that coordinates specialised agents across your tasks, ' +
  'finances, research and job search — and tells you plainly what it cannot do.';

export const metadata = {
  metadataBase: new URL(APP_URL),
  title: 'ATLAS — Your Personal AI',
  description: DESC,
  applicationName: 'Atlas',
  // The project shipped with no icon at all, which is why the tab looked like a
  // placeholder. SVG first for crisp rendering, PNG as the iOS home-screen icon.
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: ['/favicon.svg'],
    apple: [{ url: '/apple-touch-icon.png', sizes: '512x512' }],
  },
  openGraph: {
    type: 'website',
    siteName: 'Atlas',
    title: 'ATLAS — Your Personal AI',
    description: DESC,
    url: APP_URL,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Atlas — personal AI system' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ATLAS — Your Personal AI',
    description: DESC,
    images: ['/og.png'],
  },
  robots: { index: true, follow: true },
};

export const viewport = {
  themeColor: '#08090C',
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
