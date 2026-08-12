import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
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
    <>
      <Navbar active="docs" />
      <main className="pt-14">
        <div className="mp-container pt-16 md:pt-20 pb-20">
          <a href="/docs" className="text-sm text-muted hover:text-fg transition-colors mb-6 inline-block">&larr; All docs</a>

          <h1 className="text-4xl font-bold mb-4">All Rules</h1>
          <p className="text-muted text-lg mb-12">
            {rules.length} safety rules across {categories.length} categories. All free.
          </p>

          {categories.map((category) => (
            <section key={category.title} className="mb-12">
              <h2 className="text-2xl font-semibold mb-6">{category.title}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line-soft">
                      <th className="text-left py-2 pr-3 text-muted font-medium w-20">ID</th>
                      <th className="text-left py-2 pr-3 text-muted font-medium">Name</th>
                      <th className="text-left py-2 pr-3 text-muted font-medium w-20">Severity</th>
                      <th className="text-left py-2 text-muted font-medium w-16">Fix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {category.ids.map((id) => {
                      const rule = rules.find(r => r.id === id);
                      if (!rule) return null;
                      return (
                        <tr key={id} className="border-b border-line-soft hover:bg-surface">
                          <td className="py-2.5 pr-3">
                            <a href={`/rules/${id.toLowerCase()}`} className="text-accent hover:text-accent-hover font-mono text-xs">
                              {id}
                            </a>
                          </td>
                          <td className="py-2.5 pr-3">
                            <a href={`/rules/${id.toLowerCase()}`} className="text-muted hover:text-fg transition-colors">
                              {rule.name}
                            </a>
                            {rule.requiresDatabaseUrl && (
                              <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent-soft text-accent border border-accent/35">NEEDS DB</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className={`text-xs font-medium ${rule.severity === 'critical' ? 'text-danger' : 'text-warn'}`}>
                              {rule.severity}
                            </span>
                          </td>
                          <td className="py-2.5">
                            {rule.autoFixable && <span className="text-xs text-ok">auto</span>}
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
      </main>
      <Footer />
    </>
  );
}
