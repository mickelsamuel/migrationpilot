import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MigrationPilot — PostgreSQL Migration Safety',
  description: 'Know exactly what your PostgreSQL migration will do to production — before you merge. Analyze DDL locks, risk scores, and safe alternatives.',
  keywords: ['postgresql', 'migration', 'database', 'safety', 'DDL', 'locks', 'github action', 'CLI'],
  openGraph: {
    title: 'MigrationPilot — PostgreSQL Migration Safety',
    description: 'Know exactly what your PostgreSQL migration will do to production — before you merge.',
    url: 'https://migrationpilot.dev',
    siteName: 'MigrationPilot',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MigrationPilot — PostgreSQL Migration Safety',
    description: 'Know exactly what your PostgreSQL migration will do to production — before you merge.',
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
