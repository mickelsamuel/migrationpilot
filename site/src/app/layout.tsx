import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

const description =
  'Local, deterministic analysis of PostgreSQL migrations using the real PostgreSQL parser. 112 rules, lock analysis, risk scoring and safe alternatives, in your terminal and your CI.';

export const metadata: Metadata = {
  title: 'MigrationPilot: PostgreSQL migration safety',
  description,
  keywords: ['postgresql', 'migration', 'database', 'safety', 'DDL', 'locks', 'github action', 'CLI', 'linter', 'static analysis', 'zero downtime'],
  metadataBase: new URL('https://migrationpilot.dev'),
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'MigrationPilot: PostgreSQL migration safety',
    description,
    url: 'https://migrationpilot.dev',
    siteName: 'MigrationPilot',
    type: 'website',
    // og:image / twitter:image come from app/opengraph-image.tsx. Do not hardcode
    // a path here, it overrides the generated route and 404s.
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MigrationPilot: PostgreSQL migration safety',
    description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-bg text-fg font-sans">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
