import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SQL Playground — Test PostgreSQL Migration Safety | MigrationPilot',
  description:
    'Paste a PostgreSQL migration and see the locks it takes, the risk level, and the safety violations instantly. Runs in the browser session, nothing stored.',
  alternates: {
    canonical: '/playground',
  },
  openGraph: {
    title: 'SQL Playground — Test PostgreSQL Migration Safety',
    description:
      'Paste a PostgreSQL migration and see the locks it takes, the risk level, and the safety violations instantly.',
    url: 'https://migrationpilot.dev/playground',
  },
};

export default function PlaygroundLayout({ children }: { children: React.ReactNode }) {
  return children;
}
