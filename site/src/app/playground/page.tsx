'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Navbar from '@/components/navbar';
import { loadEngine, type Engine, type ProductionRule, type Report } from './engine';
import { decodeShare, encodeShare, type SharedState } from './share';
import { DEFAULT_SQL, EXAMPLES } from './examples';
import { LockTable, ProductionRulesNotice, ReportSummary, RiskBadge, ViolationCard } from './report';

const PG_VERSIONS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

type EngineStatus = 'loading' | 'ready' | 'failed';
type CopyState = 'link' | 'cli' | 'too-long' | 'failed' | null;

/**
 * `?sql=<url-encoded>&pg=<major>` — the plain-text way in, used by the "try
 * this rule" links on the rule pages.
 *
 * Share links stay on the fragment, which never reaches a server. A query
 * string does, so this path is only for SQL that is already public: a rule
 * page's own example. The engine caps input size itself, so nothing here has
 * to guard length.
 */
function readSqlParam(search: string): SharedState | null {
  const params = new URLSearchParams(search);
  const sql = params.get('sql');
  if (!sql?.trim()) return null;
  const pg = Number(params.get('pg'));
  return { sql, pgVersion: PG_VERSIONS.includes(pg) ? pg : 17 };
}

export default function PlaygroundPage() {
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [pgVersion, setPgVersion] = useState(17);
  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState<EngineStatus>('loading');
  const [statusMessage, setStatusMessage] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [ruleCount, setRuleCount] = useState(0);
  const [productionRules, setProductionRules] = useState<ProductionRule[]>([]);
  const [copied, setCopied] = useState<CopyState>(null);

  const engineRef = useRef<Engine | null>(null);

  // Pull any shared migration out of the URL fragment, load the engine, and —
  // if the link carried SQL — analyze it straight away.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const shared =
        (window.location.hash ? await decodeShare(window.location.hash) : null) ??
        readSqlParam(window.location.search);
      if (cancelled) return;
      if (shared) {
        setSql(shared.sql);
        setPgVersion(shared.pgVersion);
      }

      try {
        const engine = await loadEngine();
        if (cancelled) return;
        engineRef.current = engine;
        setRuleCount(engine.ruleCount);
        setProductionRules(engine.productionRules);
        setStatus('ready');

        if (shared) {
          setAnalyzing(true);
          const result = await engine.analyzeMigration(shared.sql, shared.pgVersion);
          if (cancelled) return;
          setReport(result);
          setAnalyzing(false);
        }
      } catch (err) {
        if (cancelled) return;
        setStatus('failed');
        setStatusMessage(err instanceof Error ? err.message : 'Engine failed to load.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const analyze = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setAnalyzing(true);
    try {
      setReport(await engine.analyzeMigration(sql, pgVersion));
    } catch (err) {
      setStatus('failed');
      setStatusMessage(err instanceof Error ? err.message : 'Analysis failed.');
    }
    setAnalyzing(false);
  }, [sql, pgVersion]);

  const copy = useCallback(async (text: string, state: CopyState) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(state);
    } catch {
      setCopied('failed');
    }
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const copyShareLink = useCallback(async () => {
    const hash = await encodeShare(sql, pgVersion);
    if (!hash) {
      setCopied('too-long');
      setTimeout(() => setCopied(null), 2000);
      return;
    }
    window.history.replaceState(null, '', hash);
    await copy(`${window.location.origin}${window.location.pathname}${hash}`, 'link');
  }, [sql, pgVersion, copy]);

  const cliCommand = `npx migrationpilot analyze migration.sql --pg-version ${pgVersion}`;

  return (
    <main className="min-h-screen">
      <Navbar />

      <div className="pt-28 pb-20 px-6 max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">SQL Playground</h1>
        <p className="text-slate-400 text-lg mb-4">
          Runs entirely in your browser — your SQL never leaves this page.
        </p>

        <div className="mb-8 text-sm">
          {status === 'loading' && (
            <span className="text-slate-500">Loading the analysis engine…</span>
          )}
          {status === 'ready' && (
            <span className="text-slate-400">
              <span className="text-green-400">&#9679;</span> {ruleCount} rules and the real
              PostgreSQL parser loaded locally. No network call analyzes your SQL.
            </span>
          )}
          {status === 'failed' && (
            <span className="text-red-400">
              {statusMessage} Reload the page, or run{' '}
              <code className="text-xs">npx migrationpilot analyze</code> instead.
            </span>
          )}
        </div>

        {/* Examples */}
        <div className="flex flex-wrap gap-2 mb-6">
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              onClick={() => {
                setSql(example.sql);
                setReport(null);
              }}
              className="px-3 py-1.5 text-xs rounded-full border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            >
              {example.label}
              <span className="text-slate-600 ml-2">{example.hint}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input panel */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label htmlFor="sql-input" className="text-sm font-medium text-slate-300">
                SQL input
              </label>
              <div className="flex items-center gap-3">
                <label htmlFor="pg-version" className="text-xs text-slate-500">
                  PG version:
                </label>
                <select
                  id="pg-version"
                  value={pgVersion}
                  onChange={(e) => {
                    setPgVersion(Number(e.target.value));
                    setReport(null);
                  }}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300"
                >
                  {PG_VERSIONS.map((v) => (
                    <option key={v} value={v}>
                      PG {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <textarea
              id="sql-input"
              value={sql}
              onChange={(e) => {
                setSql(e.target.value);
                setReport(null);
              }}
              className="w-full h-80 bg-slate-900 border border-slate-700 rounded-lg p-4 font-mono text-sm text-slate-200 resize-none focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="Enter your SQL migration here…"
              spellCheck={false}
            />

            <button
              onClick={analyze}
              disabled={status !== 'ready' || analyzing || !sql.trim()}
              className="mt-4 w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 font-medium transition-colors"
            >
              {status === 'loading'
                ? 'Loading engine…'
                : analyzing
                  ? 'Analyzing…'
                  : 'Analyze migration'}
            </button>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={copyShareLink}
                className="px-3 py-1.5 text-xs rounded border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
              >
                {copied === 'link'
                  ? 'Link copied'
                  : copied === 'too-long'
                    ? 'Migration too long to share'
                    : 'Copy share link'}
              </button>
              <button
                onClick={() => copy(cliCommand, 'cli')}
                className="px-3 py-1.5 text-xs rounded border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
              >
                {copied === 'cli' ? 'Command copied' : 'Copy CLI command'}
              </button>
              {copied === 'failed' && (
                <span className="text-xs text-slate-500 self-center">
                  Clipboard blocked — copy manually.
                </span>
              )}
            </div>

            <p className="mt-3 text-[11px] text-slate-500 font-mono break-all">{cliCommand}</p>
          </div>

          {/* Results panel */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-300">Results</span>
              {report && !report.parseError && (
                <RiskBadge level={report.riskLevel} score={report.riskScore} />
              )}
            </div>

            <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 min-h-80">
              {!report && (
                <div className="flex items-center justify-center h-72 text-slate-500 text-sm text-center px-6">
                  {status === 'ready'
                    ? 'Click "Analyze migration" to see results.'
                    : status === 'loading'
                      ? 'Fetching the rule engine and PostgreSQL parser…'
                      : 'The engine could not load.'}
                </div>
              )}

              {report?.parseError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
                  <p className="text-sm font-medium text-red-400">Parse error</p>
                  <p className="text-xs text-red-300 mt-1 font-mono">{report.parseError}</p>
                </div>
              )}

              {report && !report.parseError && (
                <>
                  <ReportSummary report={report} />

                  {report.violations.length === 0 && report.statements.length > 0 && (
                    <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4">
                      <p className="text-sm font-medium text-green-400">All clear</p>
                      <p className="text-xs text-green-300 mt-1">
                        {report.statements.length} statement
                        {report.statements.length !== 1 ? 's' : ''} checked against all {ruleCount}{' '}
                        rules — nothing flagged.
                      </p>
                    </div>
                  )}

                  {report.violations.length > 0 && (
                    <div className="space-y-3">
                      {report.violations.map((violation, i) => (
                        <ViolationCard key={`${violation.ruleId}-${violation.line}-${i}`} violation={violation} />
                      ))}
                    </div>
                  )}

                  {report.statements.length > 0 && <LockTable report={report} />}
                </>
              )}
            </div>
          </div>
        </div>

        <ProductionRulesNotice rules={productionRules} />

        {/* Info section */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-lg p-5">
            <h3 className="font-medium mb-2">Your SQL never leaves this page</h3>
            <p className="text-sm text-slate-400">
              The rule engine and the PostgreSQL parser are downloaded once as WebAssembly and run
              on your machine. There is no analysis request to send, so there is nothing to log,
              store, or leak. Open DevTools and watch the network tab.
            </p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-lg p-5">
            <h3 className="font-medium mb-2">How it works</h3>
            <p className="text-sm text-slate-400">
              Your SQL is parsed by the real PostgreSQL grammar (libpg-query), not a regex. Each
              statement gets a lock classification, then the full rule set runs over the parse tree
              — the same code path the CLI uses.
            </p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-lg p-5">
            <h3 className="font-medium mb-2">Same results in CI</h3>
            <p className="text-sm text-slate-400">
              Copy the command above to check the file on disk, or add the GitHub Action to block
              unsafe migrations before merge.{' '}
              <a href="/docs" className="text-blue-400 hover:text-blue-300">
                Read the docs &rarr;
              </a>
            </p>
          </div>
        </div>
      </div>

      <footer className="border-t border-slate-800/50 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center font-bold text-[10px]">
              MP
            </div>
            <span className="text-xs text-slate-500">MigrationPilot</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <a href="/" className="hover:text-slate-300 transition-colors">
              Home
            </a>
            <a href="/docs" className="hover:text-slate-300 transition-colors">
              Docs
            </a>
            <a
              href="https://github.com/mickelsamuel/migrationpilot"
              className="hover:text-slate-300 transition-colors"
            >
              GitHub
            </a>
          </div>
          <p className="text-xs text-slate-600">&copy; 2026 MigrationPilot</p>
        </div>
      </footer>
    </main>
  );
}
