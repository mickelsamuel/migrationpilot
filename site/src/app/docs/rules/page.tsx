import type { Metadata } from 'next';
import { rules } from '../../rule-data';

export const metadata: Metadata = {
  title: 'All Rules — MigrationPilot Docs',
  description: 'Complete reference of all 80 MigrationPilot safety rules for PostgreSQL migrations. Lock safety, data safety, and best practices.',
};

const categories: { title: string; ids: string[] }[] = [
  {
    title: 'Lock Safety — Critical',
    ids: ['MP001', 'MP002', 'MP003', 'MP004', 'MP005', 'MP006', 'MP007', 'MP008', 'MP009', 'MP010', 'MP011', 'MP012', 'MP015', 'MP018', 'MP021', 'MP025', 'MP026', 'MP027', 'MP028', 'MP029', 'MP030', 'MP031', 'MP032', 'MP033', 'MP046', 'MP047', 'MP049', 'MP062', 'MP064', 'MP065', 'MP069', 'MP072', 'MP073'],
  },
  {
    title: 'Production Context — Pro',
    ids: ['MP013', 'MP014', 'MP019'],
  },
  {
    title: 'Data Safety',
    ids: ['MP017', 'MP022', 'MP024', 'MP034', 'MP035', 'MP036', 'MP044', 'MP067', 'MP071', 'MP080'],
  },
  {
    title: 'Best Practices',
    ids: ['MP016', 'MP020', 'MP023', 'MP037', 'MP038', 'MP039', 'MP040', 'MP041', 'MP042', 'MP043', 'MP045', 'MP048', 'MP050', 'MP051', 'MP061', 'MP063', 'MP066', 'MP068', 'MP070', 'MP074', 'MP075', 'MP076', 'MP077', 'MP078', 'MP079'],
  },
];

export default function RulesIndex() {
  return (
    <main className="min-h-screen">
      <nav className="fixed top-0 w-full z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">MP</div>
            <span className="font-semibold text-lg">MigrationPilot</span>
          </a>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <a href="/docs" className="hover:text-white transition-colors">Docs</a>
            <a href="/pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      <div className="pt-28 pb-20 px-6 max-w-5xl mx-auto">
        <a href="/docs" className="text-sm text-slate-400 hover:text-white transition-colors mb-6 inline-block">&larr; All docs</a>

        <h1 className="text-4xl font-bold mb-4">All Rules</h1>
        <p className="text-slate-400 text-lg mb-12">
          80 safety rules across 4 categories. 77 free, 3 Pro-only.
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
                          {rule.tier === 'pro' && (
                            <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">PRO</span>
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
          <p className="text-xs text-slate-600">&copy; 2026 MigrationPilot</p>
        </div>
      </footer>
    </main>
  );
}
