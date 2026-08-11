'use client';

import type { ProductionRule, Report, RiskLevel, Violation } from './engine';

const RISK_STYLES: Record<RiskLevel, string> = {
  RED: 'bg-red-500/10 text-red-400 border-red-500/20',
  YELLOW: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  GREEN: 'bg-green-500/10 text-green-400 border-green-500/20',
};

const RISK_LABELS: Record<RiskLevel, string> = {
  RED: 'High risk',
  YELLOW: 'Moderate risk',
  GREEN: 'Low risk',
};

export function RiskBadge({ level, score }: { level: RiskLevel; score: number }) {
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded border ${RISK_STYLES[level]}`}>
      {RISK_LABELS[level]} &middot; {score}/100
    </span>
  );
}

export function ReportSummary({ report }: { report: Report }) {
  const { criticalCount, warningCount, totalStatements } = report.summary;

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      <Stat label="Critical" value={criticalCount} tone={criticalCount > 0 ? 'red' : 'muted'} />
      <Stat label="Warnings" value={warningCount} tone={warningCount > 0 ? 'yellow' : 'muted'} />
      <Stat label="Statements" value={totalStatements} tone="muted" />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'red' | 'yellow' | 'muted';
}) {
  const color =
    tone === 'red' ? 'text-red-400' : tone === 'yellow' ? 'text-yellow-400' : 'text-slate-300';
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}

export function ViolationCard({ violation }: { violation: Violation }) {
  const critical = violation.severity === 'critical';
  return (
    <div
      className={`rounded-lg border p-3 ${
        critical ? 'bg-red-500/5 border-red-500/20' : 'bg-yellow-500/5 border-yellow-500/20'
      }`}
    >
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span
          className={`text-xs font-mono font-medium ${critical ? 'text-red-400' : 'text-yellow-400'}`}
        >
          {violation.ruleId}
        </span>
        <span className="text-xs text-slate-500 font-mono">{violation.ruleName}</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded ${
            critical ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'
          }`}
        >
          {violation.severity}
        </span>
        <span className="text-xs text-slate-500">line {violation.line}</span>
      </div>

      <p className="text-sm text-slate-300">{violation.message}</p>

      {violation.whyItMatters && (
        <p className="text-xs text-slate-400 mt-2">{violation.whyItMatters}</p>
      )}

      {violation.safeAlternative && (
        <div className="mt-2 bg-slate-800/50 rounded p-2 overflow-x-auto">
          <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Safe alternative</p>
          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
            {violation.safeAlternative}
          </pre>
        </div>
      )}

      <a
        href={`/rules/${violation.ruleId.toLowerCase()}`}
        className="text-[11px] text-blue-400 hover:text-blue-300 mt-2 inline-block"
      >
        View rule docs &rarr;
      </a>
    </div>
  );
}

export function LockTable({ report }: { report: Report }) {
  return (
    <div className="mt-6 pt-4 border-t border-slate-800">
      <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider">Lock analysis</p>
      <div className="space-y-2">
        {report.statements.map((statement, i) => (
          <div key={i} className="flex items-center gap-3 text-xs">
            <span
              className={`px-2 py-0.5 rounded font-mono whitespace-nowrap border ${
                statement.blocksReads
                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                  : statement.blocksWrites
                    ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                    : 'bg-green-500/10 text-green-400 border-green-500/20'
              }`}
            >
              {statement.lockType}
            </span>
            <span className="text-slate-400 font-mono truncate">
              {statement.sql.slice(0, 70)}
              {statement.sql.length > 70 ? '…' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Three rules score against live table stats, query traffic, and connection
 * counts. A browser has none of that, so they are listed rather than silently
 * skipped.
 */
export function ProductionRulesNotice({ rules }: { rules: ProductionRule[] }) {
  if (rules.length === 0) return null;

  return (
    <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/50 p-5">
      <h3 className="font-medium mb-1">{rules.length} rules need a database connection</h3>
      <p className="text-sm text-slate-400 mb-4">
        These score your migration against real table sizes, query traffic, and open connections.
        The browser can&apos;t see any of that, so they stay quiet here. Run the CLI with{' '}
        <code className="text-blue-400 text-xs">--database-url</code> to turn them on.
      </p>
      <div className="space-y-2">
        {rules.map((rule) => (
          <div key={rule.id} className="flex gap-3 text-sm">
            <a
              href={`/rules/${rule.id.toLowerCase()}`}
              className="font-mono text-xs text-blue-400 hover:text-blue-300 shrink-0 pt-0.5"
            >
              {rule.id}
            </a>
            <span className="text-slate-400 text-xs">{rule.description}</span>
          </div>
        ))}
      </div>
      <a
        href="/docs"
        className="text-[11px] text-blue-400 hover:text-blue-300 mt-4 inline-block"
      >
        Production context docs &rarr;
      </a>
    </div>
  );
}
