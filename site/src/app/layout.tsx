import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MigrationPilot — PostgreSQL Migration Safety',
  description: 'Know exactly what your PostgreSQL migration will do to production — before you merge. 48 safety rules, auto-fix, risk scoring, and safe alternatives.',
  keywords: ['postgresql', 'migration', 'database', 'safety', 'DDL', 'locks', 'github action', 'CLI', 'linter', 'static analysis', 'zero downtime'],
  metadataBase: new URL('https://migrationpilot.dev'),
  icons: {
    icon: '/icon.svg',
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'MigrationPilot — PostgreSQL Migration Safety',
    description: '48 safety rules powered by the real PostgreSQL parser. Lock analysis, risk scoring, auto-fix, and safe alternatives — all without touching your database.',
    url: 'https://migrationpilot.dev',
    siteName: 'MigrationPilot',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'MigrationPilot — Know what your migration will do to production',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MigrationPilot — PostgreSQL Migration Safety',
    description: '48 safety rules powered by the real PostgreSQL parser. Lock analysis, risk scoring, auto-fix, and safe alternatives.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
