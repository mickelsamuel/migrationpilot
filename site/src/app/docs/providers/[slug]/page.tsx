import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { providers } from '../../provider-data';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return providers.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const provider = providers.find((p) => p.slug === slug);
  if (!provider) return { title: 'Not Found — MigrationPilot' };
  return {
    title: `${provider.name} Guide — MigrationPilot Docs`,
    description: `How to use MigrationPilot with ${provider.name}. ${provider.description}`,
  };
}

export default async function ProviderPage({ params }: PageProps) {
  const { slug } = await params;
  const provider = providers.find((p) => p.slug === slug);
  if (!provider) notFound();

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

        <h1 className="text-3xl font-bold mb-4">{provider.name}</h1>
        <p className="text-slate-400 text-lg mb-10">{provider.description}</p>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Connection</h2>
          <p className="text-slate-400 leading-relaxed">{provider.connectionNote}</p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Setup</h2>
          <pre className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm font-mono text-slate-300 overflow-x-auto">
            {provider.setup}
          </pre>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Tips</h2>
          <ul className="space-y-3">
            {provider.tips.map((tip, i) => (
              <li key={i} className="flex gap-3 text-slate-400">
                <span className="text-blue-400 mt-1 shrink-0">&#8226;</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
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
