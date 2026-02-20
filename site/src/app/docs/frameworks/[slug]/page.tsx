import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { frameworks } from '../../framework-data';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return frameworks.map((fw) => ({ slug: fw.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const fw = frameworks.find((f) => f.slug === slug);
  if (!fw) return { title: 'Not Found — MigrationPilot' };
  return {
    title: `${fw.name} Setup Guide — MigrationPilot Docs`,
    description: `How to use MigrationPilot with ${fw.name} migrations. ${fw.description}`,
  };
}

export default async function FrameworkPage({ params }: PageProps) {
  const { slug } = await params;
  const fw = frameworks.find((f) => f.slug === slug);
  if (!fw) notFound();

  return (
    <main className="min-h-screen">
      <nav className="fixed top-0 w-full z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">MP</div>
            <span className="font-semibold text-lg">MigrationPilot</span>
          </a>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <a href="/docs" className="hover:text-white transition-colors">Docs</a>
            <a href="/#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      <article className="pt-28 pb-20 px-6 max-w-3xl mx-auto">
        <a href="/docs" className="text-sm text-slate-400 hover:text-white transition-colors mb-6 inline-block">&larr; All docs</a>

        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-3xl font-bold">{fw.name}</h1>
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-500/20 text-slate-400">{fw.language}</span>
        </div>

        <p className="text-slate-400 text-lg mb-10">{fw.description}</p>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Auto-Detection</h2>
          <p className="text-slate-400 leading-relaxed">{fw.detectHint}</p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Migration Path</h2>
          <p className="text-slate-400 mb-3">Default migration file pattern:</p>
          <pre className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm font-mono text-blue-300 overflow-x-auto">
            {fw.migrationPath}
          </pre>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Setup</h2>
          <pre className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm font-mono text-slate-300 overflow-x-auto">
            {fw.setup}
          </pre>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">GitHub Action</h2>
          <p className="text-slate-400 mb-3">Add to your CI workflow:</p>
          <pre className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm font-mono text-slate-300 overflow-x-auto">
            {fw.ciExample}
          </pre>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Configuration</h2>
          <p className="text-slate-400 mb-3">Add a config file to set the default migration path:</p>
          <pre className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm font-mono text-slate-300 overflow-x-auto">
{`# .migrationpilotrc.yml
migrationPath: "${fw.migrationPath}"
failOn: critical`}
          </pre>
        </section>

        <div className="mt-12 flex items-center gap-4">
          <a href="/docs" className="text-sm text-slate-400 hover:text-white transition-colors">&larr; All docs</a>
          <a href="/docs/configuration" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">Configuration guide</a>
        </div>
      </article>

      <footer className="border-t border-slate-800/50 py-8 px-6">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center font-bold text-[10px]">MP</div>
            <span className="text-xs text-slate-500">MigrationPilot</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <a href="/" className="hover:text-slate-300 transition-colors">Home</a>
            <a href="/docs" className="hover:text-slate-300 transition-colors">Docs</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-slate-300 transition-colors">GitHub</a>
          </div>
          <p className="text-xs text-slate-600">&copy; 2026 MigrationPilot</p>
        </div>
      </footer>
    </main>
  );
}
