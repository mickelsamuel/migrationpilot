import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { rules } from '../../rule-data';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return rules.map((r) => ({ id: r.id.toLowerCase() }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const rule = rules.find((r) => r.id.toLowerCase() === id.toLowerCase());
  if (!rule) return { title: 'Rule Not Found — MigrationPilot' };
  return {
    title: `${rule.id}: ${rule.name} — MigrationPilot`,
    description: rule.whyItMatters,
  };
}

export default async function RulePage({ params }: PageProps) {
  const { id } = await params;
  const rule = rules.find((r) => r.id.toLowerCase() === id.toLowerCase());
  if (!rule) notFound();

  return (
    <main className="min-h-screen">
      <nav className="fixed top-0 w-full z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">MP</div>
            <span className="font-semibold text-lg">MigrationPilot</span>
          </a>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <a href="/#rules" className="hover:text-white transition-colors">All Rules</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      <article className="pt-28 pb-20 px-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <span className="font-mono text-blue-400 text-lg">{rule.id}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
            rule.severity === 'critical' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
          }`}>
            {rule.severity.toUpperCase()}
          </span>
          {rule.autoFixable && (
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-green-500/20 text-green-400">
              Auto-fixable
            </span>
          )}
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-500/20 text-slate-400">
            {rule.tier === 'pro' ? 'Pro' : 'Free'}
          </span>
        </div>

        <h1 className="text-3xl font-bold mb-4">{rule.name}</h1>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">What It Detects</h2>
          <p className="text-slate-400 leading-relaxed">{rule.description}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Why It&apos;s Dangerous</h2>
          <p className="text-slate-400 leading-relaxed">{rule.whyItMatters}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Bad Example</h2>
          <pre className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm font-mono text-red-300 overflow-x-auto">
            {rule.badExample}
          </pre>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Good Example</h2>
          <pre className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm font-mono text-green-300 overflow-x-auto">
            {rule.goodExample}
          </pre>
        </section>

        {rule.autoFixable && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3 text-slate-200">Auto-fix</h2>
            <p className="text-slate-400">
              Run <code className="text-blue-400 bg-slate-800 px-1.5 py-0.5 rounded text-sm">migrationpilot analyze file.sql --fix</code> to
              automatically fix this violation.
            </p>
          </section>
        )}

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-slate-200">Configuration</h2>
          <p className="text-slate-400 text-sm mb-3">Disable this rule:</p>
          <pre className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm font-mono text-slate-300 overflow-x-auto mb-4">
{`# .migrationpilotrc.yml
rules:
  ${rule.id}: false`}
          </pre>
          <p className="text-slate-400 text-sm mb-3">Or change its severity:</p>
          <pre className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm font-mono text-slate-300 overflow-x-auto">
{`# .migrationpilotrc.yml
rules:
  ${rule.id}:
    severity: warning`}
          </pre>
        </section>

        <div className="mt-12 flex items-center gap-4">
          <a
            href="/#rules"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            &larr; All rules
          </a>
          <a
            href={`https://github.com/mickelsamuel/migrationpilot/blob/main/docs/rules/${rule.id}.md`}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            View on GitHub
          </a>
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
