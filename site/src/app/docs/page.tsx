import type { Metadata } from 'next';
import { docs } from './docs-data';
import { frameworks } from './framework-data';
import { providers } from './provider-data';

export const metadata: Metadata = {
  title: 'Documentation — MigrationPilot',
  description: 'Comprehensive documentation for MigrationPilot: quick start, configuration, CI integration, framework guides, and more.',
};

export default function DocsIndex() {
  return (
    <main className="min-h-screen">
      <nav className="fixed top-0 w-full z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">MP</div>
            <span className="font-semibold text-lg">MigrationPilot</span>
          </a>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <a href="/docs" className="text-white">Docs</a>
            <a href="/#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      <div className="pt-28 pb-20 px-6 max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">Documentation</h1>
        <p className="text-slate-400 text-lg mb-12">Everything you need to get started with MigrationPilot.</p>

        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6">Getting Started</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {docs.map((doc) => (
              <a
                key={doc.slug}
                href={`/docs/${doc.slug}`}
                className="group block rounded-lg border border-slate-800 bg-slate-900/50 p-5 hover:border-blue-500/50 hover:bg-slate-900 transition-all"
              >
                <h3 className="font-semibold mb-2 group-hover:text-blue-400 transition-colors">{doc.title}</h3>
                <p className="text-sm text-slate-400">{doc.description}</p>
              </a>
            ))}
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6">Framework Guides</h2>
          <p className="text-slate-400 mb-6">Step-by-step setup for your migration framework.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {frameworks.map((fw) => (
              <a
                key={fw.slug}
                href={`/docs/frameworks/${fw.slug}`}
                className="group block rounded-lg border border-slate-800 bg-slate-900/50 p-5 hover:border-blue-500/50 hover:bg-slate-900 transition-all"
              >
                <h3 className="font-semibold mb-1 group-hover:text-blue-400 transition-colors">{fw.name}</h3>
                <p className="text-xs text-slate-500 mb-2">{fw.language}</p>
                <p className="text-sm text-slate-400">{fw.description.slice(0, 80)}...</p>
              </a>
            ))}
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6">Rules Reference</h2>
          <p className="text-slate-400 mb-6">80 safety rules covering locks, data safety, and best practices.</p>
          <a
            href="/docs/rules"
            className="group block rounded-lg border border-slate-800 bg-slate-900/50 p-5 hover:border-blue-500/50 hover:bg-slate-900 transition-all max-w-sm"
          >
            <h3 className="font-semibold mb-2 group-hover:text-blue-400 transition-colors">All Rules</h3>
            <p className="text-sm text-slate-400">Browse all 80 safety rules with severity, examples, and configuration.</p>
          </a>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6">Cloud Provider Guides</h2>
          <p className="text-slate-400 mb-6">Production context setup for your PostgreSQL provider.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {providers.map((p) => (
              <a
                key={p.slug}
                href={`/docs/providers/${p.slug}`}
                className="group block rounded-lg border border-slate-800 bg-slate-900/50 p-5 hover:border-blue-500/50 hover:bg-slate-900 transition-all"
              >
                <h3 className="font-semibold mb-2 group-hover:text-blue-400 transition-colors">{p.name}</h3>
                <p className="text-sm text-slate-400">{p.description.slice(0, 80)}...</p>
              </a>
            ))}
          </div>
        </section>
      </div>

      <footer className="border-t border-slate-800/50 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center font-bold text-[10px]">MP</div>
            <span className="text-xs text-slate-500">MigrationPilot</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <a href="/" className="hover:text-slate-300 transition-colors">Home</a>
            <a href="/#pricing" className="hover:text-slate-300 transition-colors">Pricing</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-slate-300 transition-colors">GitHub</a>
            <a href="https://www.npmjs.com/package/migrationpilot" className="hover:text-slate-300 transition-colors">npm</a>
          </div>
          <p className="text-xs text-slate-600">&copy; 2026 MigrationPilot</p>
        </div>
      </footer>
    </main>
  );
}
