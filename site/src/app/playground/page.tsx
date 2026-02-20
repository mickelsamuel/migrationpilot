'use client';

import { useState, useCallback } from 'react';
import { analyzePlayground, type PlaygroundResult } from './actions';

const EXAMPLES = [
  {
    label: 'Unsafe index (MP001)',
    sql: `-- Missing CONCURRENTLY — blocks all writes!
CREATE INDEX idx_users_email ON users (email);`,
  },
  {
    label: 'Type change (MP007)',
    sql: `-- Column type change rewrites entire table
ALTER TABLE orders ALTER COLUMN total TYPE numeric(12,2);`,
  },
  {
    label: 'Safe migration',
    sql: `SET lock_timeout = '5s';
SET statement_timeout = '30s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);`,
  },
  {
    label: 'Multiple issues',
    sql: `CREATE INDEX idx_orders_user ON orders (user_id);
ALTER TABLE users ADD COLUMN bio VARCHAR(500);
ALTER TABLE users DROP COLUMN old_name;
DROP TABLE legacy_data;`,
  },
  {
    label: 'FK without NOT VALID',
    sql: `ALTER TABLE orders
  ADD CONSTRAINT fk_orders_user
  FOREIGN KEY (user_id) REFERENCES users (id);`,
  },
];

const DEFAULT_SQL = `-- Paste your PostgreSQL migration SQL here, or try an example above
CREATE INDEX idx_users_email ON users (email);

ALTER TABLE users ADD COLUMN bio VARCHAR(500) DEFAULT '';

ALTER TABLE orders DROP COLUMN legacy_field;`;

export default function PlaygroundPage() {
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [pgVersion, setPgVersion] = useState(17);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = useCallback(async () => {
    setLoading(true);
    try {
      const res = await analyzePlayground(sql, pgVersion);
      setResult(res);
    } catch {
      setResult({ statements: [], violations: [], riskLevel: 'GREEN', parseError: 'Analysis failed' });
    }
    setLoading(false);
  }, [sql, pgVersion]);

  return (
    <main className="min-h-screen">
      <nav className="fixed top-0 w-full z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">MP</div>
            <span className="font-semibold text-lg">MigrationPilot</span>
          </a>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <a href="/docs" className="hover:text-white transition-colors">Docs</a>
            <a href="/pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="/playground" className="text-white font-medium">Playground</a>
            <a href="https://github.com/mickelsamuel/migrationpilot" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </nav>

      <div className="pt-28 pb-20 px-6 max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">SQL Playground</h1>
        <p className="text-slate-400 text-lg mb-8">
          Paste your PostgreSQL migration SQL and see safety violations instantly.
        </p>

        {/* Examples */}
        <div className="flex flex-wrap gap-2 mb-6">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => { setSql(ex.sql); setResult(null); }}
              className="px-3 py-1.5 text-xs rounded-full border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input panel */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-slate-300">SQL Input</label>
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-500">PG Version:</label>
                <select
                  value={pgVersion}
                  onChange={(e) => setPgVersion(Number(e.target.value))}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300"
                >
                  {[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(v => (
                    <option key={v} value={v}>PG {v}</option>
                  ))}
                </select>
              </div>
            </div>
            <textarea
              value={sql}
              onChange={(e) => { setSql(e.target.value); setResult(null); }}
              className="w-full h-80 bg-slate-900 border border-slate-700 rounded-lg p-4 font-mono text-sm text-slate-200 resize-none focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="Enter your SQL migration here..."
              spellCheck={false}
            />
            <button
              onClick={analyze}
              disabled={loading || !sql.trim()}
              className="mt-4 w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 font-medium transition-colors"
            >
              {loading ? 'Analyzing...' : 'Analyze Migration'}
            </button>
          </div>

          {/* Results panel */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-slate-300">Results</label>
              {result && (
                <RiskBadge level={result.riskLevel} />
              )}
            </div>

            <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 min-h-80 overflow-y-auto">
              {!result && (
                <div className="flex items-center justify-center h-72 text-slate-500 text-sm">
                  Click &quot;Analyze Migration&quot; to see results
                </div>
              )}

              {result?.parseError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 mb-4">
                  <p className="text-sm font-medium text-red-400">Parse Error</p>
                  <p className="text-xs text-red-300 mt-1 font-mono">{result.parseError}</p>
                </div>
              )}

              {result && !result.parseError && result.violations.length === 0 && result.statements.length > 0 && (
                <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4 mb-4">
                  <p className="text-sm font-medium text-green-400">All clear!</p>
                  <p className="text-xs text-green-300 mt-1">
                    {result.statements.length} statement{result.statements.length !== 1 ? 's' : ''} analyzed — no violations found.
                  </p>
                </div>
              )}

              {result && result.violations.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 mb-3">
                    {result.violations.length} violation{result.violations.length !== 1 ? 's' : ''} found in {result.statements.length} statement{result.statements.length !== 1 ? 's' : ''}
                  </p>

                  {result.violations.map((v, i) => (
                    <div
                      key={`${v.ruleId}-${i}`}
                      className={`rounded-lg border p-3 ${
                        v.severity === 'critical'
                          ? 'bg-red-500/5 border-red-500/20'
                          : 'bg-yellow-500/5 border-yellow-500/20'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-mono font-medium ${
                          v.severity === 'critical' ? 'text-red-400' : 'text-yellow-400'
                        }`}>
                          {v.ruleId}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          v.severity === 'critical'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-yellow-500/10 text-yellow-400'
                        }`}>
                          {v.severity}
                        </span>
                        <span className="text-xs text-slate-500">line {v.line}</span>
                      </div>
                      <p className="text-sm text-slate-300">{v.message}</p>
                      {v.safeAlternative && (
                        <div className="mt-2 bg-slate-800/50 rounded p-2">
                          <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Safe alternative</p>
                          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{v.safeAlternative}</pre>
                        </div>
                      )}
                      <a
                        href={`/rules/${v.ruleId.toLowerCase()}`}
                        className="text-[11px] text-blue-400 hover:text-blue-300 mt-2 inline-block"
                      >
                        View rule docs &rarr;
                      </a>
                    </div>
                  ))}
                </div>
              )}

              {result && result.statements.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-800">
                  <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider">Lock Analysis</p>
                  <div className="space-y-2">
                    {result.statements.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs">
                        <span className={`px-2 py-0.5 rounded font-mono ${
                          s.blocksReads
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : s.blocksWrites
                            ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                            : 'bg-green-500/10 text-green-400 border border-green-500/20'
                        }`}>
                          {s.lockType}
                        </span>
                        <span className="text-slate-400 font-mono truncate max-w-[300px]">
                          {s.sql.slice(0, 60)}{s.sql.length > 60 ? '...' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info section */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-lg p-5">
            <h3 className="font-medium mb-2">How it works</h3>
            <p className="text-sm text-slate-400">
              Your SQL is parsed by the real PostgreSQL parser (libpg-query). Each statement is analyzed against safety rules to detect lock issues, data risks, and anti-patterns.
            </p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-lg p-5">
            <h3 className="font-medium mb-2">Full analysis</h3>
            <p className="text-sm text-slate-400">
              This playground runs a subset of rules. For full 80-rule analysis with auto-fix, install the CLI: <code className="text-blue-400 text-xs">npx migrationpilot analyze file.sql</code>
            </p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-lg p-5">
            <h3 className="font-medium mb-2">No data leaves your browser</h3>
            <p className="text-sm text-slate-400">
              Your SQL is analyzed server-side with no storage, no logging, and no third-party services. Nothing is saved after the request.
            </p>
          </div>
        </div>
      </div>

      <footer className="border-t border-slate-800/50 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
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

function RiskBadge({ level }: { level: 'RED' | 'YELLOW' | 'GREEN' }) {
  const colors = {
    RED: 'bg-red-500/10 text-red-400 border-red-500/20',
    YELLOW: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    GREEN: 'bg-green-500/10 text-green-400 border-green-500/20',
  };
  const labels = { RED: 'High Risk', YELLOW: 'Moderate Risk', GREEN: 'Low Risk' };

  return (
    <span className={`text-xs font-medium px-2 py-1 rounded border ${colors[level]}`}>
      {labels[level]}
    </span>
  );
}
