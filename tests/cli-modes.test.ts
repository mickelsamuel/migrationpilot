import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';
import { allRules, runRules } from '../src/rules/index.js';
import { formatCliOutput, formatQuietOutput, formatVerboseOutput } from '../src/output/cli.js';
import { formatMarkdown } from '../src/output/markdown.js';
import { autoFix } from '../src/fixer/fix.js';
import type { AnalysisOutput, StatementResult } from '../src/output/cli.js';
import { calculateRisk } from '../src/scoring/score.js';

async function buildAnalysis(sql: string, file = 'test.sql', pgVersion = 17): Promise<AnalysisOutput> {
  const parsed = await parseMigration(sql);
  const statements = parsed.statements.map((s) => {
    const lock = classifyLock(s.stmt, pgVersion);
    const line = sql.slice(0, s.stmtLocation).split('\n').length;
    return { ...s, lock, line };
  });

  const violations = runRules(allRules, statements, pgVersion);

  const statementResults: StatementResult[] = statements.map(s => {
    const stmtViolations = violations.filter(v => v.line === s.line);
    const risk = calculateRisk(s.lock);
    return { sql: s.originalSql, lock: s.lock, risk, violations: stmtViolations };
  });

  const worstStatement = statementResults.reduce(
    (worst, s) => s.risk.score > worst.risk.score ? s : worst,
    statementResults[0] ?? { risk: calculateRisk({ lockType: 'ACCESS SHARE' as const, blocksReads: false, blocksWrites: false, longHeld: false }) }
  );

  return {
    file,
    statements: statementResults,
    overallRisk: worstStatement.risk,
    violations,
  };
}

// --- Quiet mode ---

describe('--quiet mode', () => {
  it('outputs one line per violation in gcc-style format', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const output = formatQuietOutput(analysis);
    expect(output).toContain('test.sql:');
    expect(output).toContain('[MP001]');
    expect(output).toContain('CRITICAL');
  });

  it('returns empty string when no violations', async () => {
    const analysis = await buildAnalysis("SET lock_timeout = '5s'; CREATE INDEX CONCURRENTLY IF NOT EXISTS idx ON users (email);");
    const output = formatQuietOutput(analysis);
    expect(output).toBe('');
  });

  it('shows multiple violations on separate lines', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email); DROP INDEX old_idx;');
    const output = formatQuietOutput(analysis);
    const lines = output.split('\n').filter(l => l.length > 0);
    expect(lines.length).toBeGreaterThan(1);
  });
});

// --- Verbose mode ---

describe('--verbose mode', () => {
  it('includes PASS/FAIL per rule for each statement', async () => {
    const analysis = await buildAnalysis("SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN bio text;");
    const output = formatVerboseOutput(analysis, allRules);
    expect(output).toContain('PASS');
    expect(output).toContain('MP001');
  });

  it('shows FAIL for violated rules', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const output = formatVerboseOutput(analysis, allRules);
    expect(output).toContain('FAIL');
    expect(output).toContain('MP001');
  });

  it('contains all rule IDs', async () => {
    const analysis = await buildAnalysis("SET lock_timeout = '5s'; CREATE TABLE IF NOT EXISTS users (id int);");
    const output = formatVerboseOutput(analysis, allRules);
    // Should mention all rules (at least a sample)
    expect(output).toContain('MP001');
    expect(output).toContain('MP010');
    expect(output).toContain('MP020');
  });
});

// --- Markdown output ---

describe('--format markdown', () => {
  it('produces valid markdown with header', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const md = formatMarkdown(analysis);
    expect(md).toContain('# Migration Safety Report');
    expect(md).toContain('**File**');
    expect(md).toContain('**Risk Level**');
  });

  it('includes DDL operations table', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const md = formatMarkdown(analysis);
    expect(md).toContain('## DDL Operations');
    expect(md).toContain('| # |');
    expect(md).toContain('Lock Type');
  });

  it('includes violations with code blocks', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const md = formatMarkdown(analysis);
    expect(md).toContain('## Violations');
    expect(md).toContain('CRITICAL');
    expect(md).toContain('```sql');
  });

  it('shows clean result when no violations', async () => {
    const analysis = await buildAnalysis("SET lock_timeout = '5s'; CREATE INDEX CONCURRENTLY IF NOT EXISTS idx ON users (email);");
    const md = formatMarkdown(analysis);
    expect(md).toContain('No violations found');
  });

  it('includes risk factors table', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const md = formatMarkdown(analysis);
    expect(md).toContain('## Risk Factors');
    expect(md).toContain('| Factor |');
  });

  it('includes MigrationPilot footer', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const md = formatMarkdown(analysis);
    expect(md).toContain('Generated by [MigrationPilot]');
  });
});

// --- Dry-run ---

describe('--fix --dry-run', () => {
  it('autoFix returns fixed SQL without writing', async () => {
    const sql = 'CREATE INDEX idx ON users (email);';
    const analysis = await buildAnalysis(sql);
    const result = autoFix(sql, analysis.violations);
    expect(result.fixedCount).toBeGreaterThan(0);
    expect(result.fixedSql).toContain('CONCURRENTLY');
    // Original SQL is unchanged
    expect(sql).not.toContain('CONCURRENTLY');
  });

  it('reports unfixable violations separately', async () => {
    const sql = 'ALTER TABLE users ALTER COLUMN name TYPE varchar(50);';
    const analysis = await buildAnalysis(sql);
    const result = autoFix(sql, analysis.violations);
    expect(result.unfixable.length).toBeGreaterThan(0);
  });
});

// --- Exit codes ---

describe('exit code logic', () => {
  it('clean SQL produces no violations', async () => {
    const analysis = await buildAnalysis("SET lock_timeout = '5s'; SET statement_timeout = '30s'; CREATE INDEX CONCURRENTLY IF NOT EXISTS idx ON users (email);");
    expect(analysis.violations).toHaveLength(0);
  });

  it('critical violation produces violations with critical severity', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const hasCritical = analysis.violations.some(v => v.severity === 'critical');
    expect(hasCritical).toBe(true);
  });

  it('warning-only SQL produces no critical violations', async () => {
    const analysis = await buildAnalysis("SET lock_timeout = '5s'; SET statement_timeout = '30s'; ALTER TABLE users RENAME COLUMN name TO full_name;");
    const hasCritical = analysis.violations.some(v => v.severity === 'critical');
    const hasWarning = analysis.violations.some(v => v.severity === 'warning');
    expect(hasCritical).toBe(false);
    expect(hasWarning).toBe(true);
  });
});

// --- Explainability: "Why" and docs URL ---

describe('rule explainability in CLI output', () => {
  it('formatCliOutput shows "Why:" when rules are provided', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const output = formatCliOutput(analysis, { rules: allRules });
    expect(output).toContain('Why:');
  });

  it('formatCliOutput shows docs URL when rules are provided', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const output = formatCliOutput(analysis, { rules: allRules });
    expect(output).toContain('migrationpilot.dev/rules/mp001');
  });

  it('formatCliOutput omits "Why:" when no rules provided', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const output = formatCliOutput(analysis);
    expect(output).not.toContain('Why:');
  });

  it('formatMarkdown shows "Why:" when rules are provided', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const md = formatMarkdown(analysis, allRules);
    expect(md).toContain('**Why:**');
    expect(md).toContain('migrationpilot.dev/rules/');
  });

  it('formatMarkdown omits "Why:" when no rules provided', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const md = formatMarkdown(analysis);
    expect(md).not.toContain('**Why:**');
  });

  it('formatVerboseOutput shows whyItMatters for failed rules', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const output = formatVerboseOutput(analysis, allRules);
    expect(output).toContain('Why:');
  });
});

// --- Timing output ---

describe('timing output', () => {
  it('formatCliOutput shows "rules checked" when timing provided', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const output = formatCliOutput(analysis, { timing: { ruleCount: 25, elapsedMs: 120 } });
    expect(output).toContain('25 rules checked in 120ms');
  });

  it('formats milliseconds for sub-second durations', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const output = formatCliOutput(analysis, { timing: { ruleCount: 25, elapsedMs: 450 } });
    expect(output).toContain('450ms');
  });

  it('formats seconds for durations >= 1s', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const output = formatCliOutput(analysis, { timing: { ruleCount: 25, elapsedMs: 1500 } });
    expect(output).toContain('1.50s');
  });

  it('omits timing when not provided', async () => {
    const analysis = await buildAnalysis('CREATE INDEX idx ON users (email);');
    const output = formatCliOutput(analysis);
    expect(output).not.toContain('rules checked');
  });
});
