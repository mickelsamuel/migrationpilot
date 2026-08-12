import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { ruleCategories, rules } from '../../rule-data';

export const metadata: Metadata = {
  title: 'All Rules — MigrationPilot Docs',
  description: 'Complete reference of all 112 MigrationPilot safety rules for PostgreSQL migrations — lock safety, data safety, constraints, partitioning, privileges, and extension awareness.',
};

// Grouped by rule-data, so a new rule shows up here the moment it ships rather
// than when someone remembers to add its ID to a list in this file.
const categories = ruleCategories.map((category) => ({
  title: category.title,
  ids: category.rules.map((rule) => rule.id),
}));

export default function RulesIndex() {
  return (
    <main className="min-h-screen">
      <Navbar active="docs" />

      <div className="pt-28 pb-20 px-6 max-w-5xl mx-auto">
        <a href="/docs" className="text-sm text-slate-400 hover:text-white transition-colors mb-6 inline-block">&larr; All docs</a>

        <h1 className="text-4xl font-bold mb-4">All Rules</h1>
        <p className="text-slate-400 text-lg mb-12">
          {rules.length} safety rules across {categories.length} categories. All free.
        </p>

        {categories.map((category) => (
          <section key={category.title} className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">{category.title}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left py-2 pr-3 text-slate-400 font-medium w-20">ID</th>
                    <th className="text-left py-2 pr-3 text-slate-400 font-medium">Name</th>
                    <th className="text-left py-2 pr-3 text-slate-400 font-medium w-20">Severity</th>
                    <th className="text-left py-2 text-slate-400 font-medium w-16">Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {category.ids.map((id) => {
                    const rule = rules.find(r => r.id === id);
                    if (!rule) return null;
                    return (
                      <tr key={id} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                        <td className="py-2.5 pr-3">
                          <a href={`/rules/${id.toLowerCase()}`} className="text-blue-400 hover:text-blue-300 font-mono text-xs">
                            {id}
                          </a>
                        </td>
                        <td className="py-2.5 pr-3">
                          <a href={`/rules/${id.toLowerCase()}`} className="text-slate-300 hover:text-white transition-colors">
                            {rule.name}
                          </a>
                          {rule.requiresDatabaseUrl && (
                            <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">NEEDS DB</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={`text-xs font-medium ${rule.severity === 'critical' ? 'text-red-400' : 'text-yellow-400'}`}>
                            {rule.severity}
                          </span>
                        </td>
                        <td className="py-2.5">
                          {rule.autoFixable && <span className="text-xs text-green-400">auto</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <footer className="border-t border-slate-800/50 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center font-bold text-[10px]">MP</div>
            <span className="text-xs text-slate-500">MigrationPilot</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <a href="/" className="hover:text-slate-300 transition-colors">Home</a>
            <a href="/docs" className="hover:text-slate-300 transition-colors">Docs</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-slate-300 transition-colors">GitHub</a>
          </div>
          <p className="text-xs text-slate-400">&copy; 2026 MigrationPilot</p>
        </div>
      </footer>
    </main>
  );
}
