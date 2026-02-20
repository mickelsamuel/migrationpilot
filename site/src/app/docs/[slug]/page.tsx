import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { docs } from '../docs-data';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return docs.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = docs.find((d) => d.slug === slug);
  if (!doc) return { title: 'Not Found — MigrationPilot' };
  return {
    title: `${doc.title} — MigrationPilot Docs`,
    description: doc.description,
  };
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = docs.find((d) => d.slug === slug);
  if (!doc) notFound();

  const currentIndex = docs.findIndex((d) => d.slug === slug);
  const prev = currentIndex > 0 ? docs[currentIndex - 1] : undefined;
  const next = currentIndex < docs.length - 1 ? docs[currentIndex + 1] : undefined;

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

        <h1 className="text-3xl font-bold mb-4">{doc.title}</h1>
        <p className="text-slate-400 text-lg mb-10">{doc.description}</p>

        {doc.sections.map((section, i) => (
          <section key={i} className="mb-10">
            <h2 className="text-xl font-semibold mb-3 text-slate-200">{section.heading}</h2>
            <p className="text-slate-400 leading-relaxed mb-4">{section.content}</p>
            {section.code && (
              <pre className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm font-mono text-slate-300 overflow-x-auto">
                {section.code}
              </pre>
            )}
          </section>
        ))}

        <div className="mt-12 flex items-center justify-between border-t border-slate-800 pt-6">
          {prev ? (
            <a href={`/docs/${prev.slug}`} className="text-sm text-slate-400 hover:text-white transition-colors">
              &larr; {prev.title}
            </a>
          ) : <span />}
          {next ? (
            <a href={`/docs/${next.slug}`} className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
              {next.title} &rarr;
            </a>
          ) : <span />}
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
