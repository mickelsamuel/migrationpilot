import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

export const metadata: Metadata = {
  title: 'MigrationPilot — PostgreSQL Migration Safety',
  description: 'Know exactly what your PostgreSQL migration will do to production — before you merge. 83 safety rules, auto-fix, risk scoring, and safe alternatives.',
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
    title: 'MigrationPilot — PostgreSQL Migration Safety',
    description: '83 safety rules powered by the real PostgreSQL parser. Lock analysis, risk scoring, auto-fix, and safe alternatives — all without touching your database.',
    url: 'https://migrationpilot.dev',
    siteName: 'MigrationPilot',
    type: 'website',
    // og:image / twitter:image come from app/opengraph-image.tsx — do not hardcode
    // a path here, it overrides the generated route and 404s.
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MigrationPilot — PostgreSQL Migration Safety',
    description: '83 safety rules powered by the real PostgreSQL parser. Lock analysis, risk scoring, auto-fix, and safe alternatives.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="bg-slate-950 text-slate-100 antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
