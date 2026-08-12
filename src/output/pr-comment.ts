import { VIOLATION_FACTOR } from '../scoring/score.js';
import { violationsOfStatement } from '../rules/engine.js';
import type { RiskLevel, RiskScore } from '../scoring/score.js';
import type { Rule, RuleViolation } from '../rules/engine.js';
import type { LockClassification } from '../locks/classify.js';
import type { AffectedQuery } from '../scoring/score.js';

export interface PRAnalysisResult {
  file: string;
  statements: Array<{
    sql: string;
    /** 1-based line the statement starts on. Lets a row find its own violations. */
    line?: number;
    lock: LockClassification;
    risk: RiskScore;
    /** This statement's violations, when the caller has already grouped them. */
    violations?: RuleViolation[];
  }>;
  overallRisk: RiskScore;
  violations: RuleViolation[];
  affectedQueries?: AffectedQuery[];
}

export function buildPRComment(analysis: PRAnalysisResult, rules?: Rule[]): string {
  const emoji = analysis.overallRisk.level === 'RED' ? '🔴'
    : analysis.overallRisk.level === 'YELLOW' ? '🟡' : '🟢';
  const ruleMap = rules ? new Map(rules.map(r => [r.id, r])) : undefined;

  const lines: string[] = [];

  // Header
  lines.push(`## ${emoji} MigrationPilot — Migration Safety Report`);
  lines.push('');
  lines.push(`**Risk Level**: **${analysis.overallRisk.level}** (score: ${analysis.overallRisk.score}/100)`);
  lines.push('');

  // DDL Operations table
  if (analysis.statements.length > 0) {
    lines.push('### DDL Operations');
    lines.push('');
    lines.push('| # | Statement | Lock Type | Blocks R/W | Long lock? | Risk |');
    lines.push('|---|-----------|-----------|:---:|:---:|:---:|');

    for (let i = 0; i < analysis.statements.length; i++) {
      const s = analysis.statements[i];
      if (!s) continue;
      const sqlFlat = s.sql.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
      const sqlPreview = sqlFlat.length > 55 ? `\`${sqlFlat.slice(0, 52)}...\`` : `\`${sqlFlat}\``;
      const blocksRW = s.lock.blocksReads && s.lock.blocksWrites ? '🔴 R+W'
        : s.lock.blocksWrites ? '🟡 W' : '🟢 —';
      const longHeld = s.lock.longHeld ? '⚠️ Yes' : '✅ No';
      const own = s.violations ?? violationsOfStatement(analysis.violations, i, s.line ?? -1);

      lines.push(`| ${i + 1} | ${sqlPreview} | ${s.lock.lockType} | ${blocksRW} | ${longHeld} | ${riskEmoji(rowLevel(s.risk.level, own))} |`);
    }

    lines.push('');
  }

  // Violations
  if (analysis.violations.length > 0) {
    lines.push('### Safety Violations');
    lines.push('');

    for (const v of analysis.violations) {
      const icon = v.severity === 'critical' ? '🚨' : '⚠️';
      // The location is what makes a bullet actionable: a multi-file PR, or one
      // rule firing on three identical statements, is otherwise a list of
      // sentences with nothing to click.
      lines.push(`- ${icon} **${v.severity.toUpperCase()}** [\`${v.ruleId}\`] \`${analysis.file}:${v.line}\`: ${v.message}`);
      if (ruleMap) {
        const rule = ruleMap.get(v.ruleId);
        if (rule?.whyItMatters) {
          lines.push(`  > **Why:** ${rule.whyItMatters}`);
        }
      }
    }

    lines.push('');

    // Safe alternatives (show first one with an alternative)
    const withAlt = analysis.violations.find(v => v.safeAlternative);
    if (withAlt) {
      lines.push('<details>');
      lines.push(`<summary>💡 Suggested safe alternative for ${withAlt.ruleId}</summary>`);
      lines.push('');
      lines.push('```sql');
      lines.push(withAlt.safeAlternative!);
      lines.push('```');
      lines.push('</details>');
      lines.push('');
    }
  }

  // Affected queries (only present with --database-url)
  if (analysis.affectedQueries && analysis.affectedQueries.length > 0) {
    lines.push('### Affected Queries (from pg_stat_statements)');
    lines.push('');
    lines.push('| Query | Calls/hr | Avg Time | Service |');
    lines.push('|-------|----------|----------|---------|');

    for (const q of analysis.affectedQueries.slice(0, 10)) {
      const queryFlat = q.normalizedQuery.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
      const queryPreview = queryFlat.length > 45
        ? `\`${queryFlat.slice(0, 42)}...\``
        : `\`${queryFlat}\``;
      lines.push(`| ${queryPreview} | ${q.calls.toLocaleString()} | ${q.meanExecTime.toFixed(1)}ms | ${q.serviceName ?? 'unknown'} |`);
    }

    if (analysis.affectedQueries.length > 10) {
      lines.push(`| ... and ${analysis.affectedQueries.length - 10} more | | | |`);
    }

    lines.push('');
  }

  // Risk factors
  if (analysis.overallRisk.factors.length > 0) {
    lines.push('<details>');
    lines.push('<summary>📊 Risk Score Breakdown</summary>');
    lines.push('');
    lines.push('| Factor | Score | Detail |');
    lines.push('|--------|:-----:|--------|');
    for (const f of analysis.overallRisk.factors) {
      lines.push(`| ${f.name} | ${f.value}/${f.weight} | ${f.detail} |`);
    }

    // Without this the table reads as arithmetic that does not work: 40 and 100
    // under a headline of 100. They are two competing tracks, not addends.
    const violationTrack = analysis.overallRisk.factors.find(f => f.name === VIOLATION_FACTOR);
    if (violationTrack) {
      const blastRadius = analysis.overallRisk.factors
        .filter(f => f.name !== VIOLATION_FACTOR)
        .reduce((sum, f) => sum + f.value, 0);
      lines.push('');
      lines.push(
        `**${analysis.overallRisk.score}/100 is the worse of two tracks, not the sum of these rows**: `
        + `blast radius **${blastRadius}** (everything above) against rule violations **${violationTrack.value}**.`
      );
    }

    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  lines.push('---');
  lines.push('<sub>Generated by <a href="https://migrationpilot.dev">MigrationPilot</a>');

  // Point at the input that would deepen the analysis, not at a price page.
  if (!analysis.affectedQueries) {
    lines.push(' · pass <code>database-url</code> to add production context: table sizes, affected queries, replication state');
  }

  lines.push('</sub>');

  return lines.join('\n');
}

/**
 * The badge for one row of the statement table.
 *
 * `risk.level` is blast radius alone — the lock this statement takes — so a
 * statement carrying a CRITICAL violation could render 🟡 under a 🔴 header,
 * which reads as the report contradicting itself. A violation escalates the
 * row it belongs to; it never de-escalates a brutal lock.
 */
function rowLevel(risk: RiskLevel, violations: RuleViolation[]): RiskLevel {
  if (violations.some(v => v.severity === 'critical')) return 'RED';
  if (violations.length > 0 && risk === 'GREEN') return 'YELLOW';
  return risk;
}

function riskEmoji(level: string): string {
  switch (level) {
    case 'RED': return '🔴';
    case 'YELLOW': return '🟡';
    case 'GREEN': return '🟢';
    default: return '⚪';
  }
}
