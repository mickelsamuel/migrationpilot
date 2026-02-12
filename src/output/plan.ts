/**
 * Execution plan formatter for MigrationPilot.
 *
 * Shows a visual step-by-step plan of what each DDL statement will do:
 * - Lock type and blocking behavior
 * - Duration estimation (instant / seconds / minutes / hours)
 * - Transaction boundaries
 * - Blocking impact on reads/writes
 */

import chalk from 'chalk';
import { extractTargets } from '../parser/extract.js';
import type { LockClassification } from '../locks/classify.js';
import type { RiskScore } from '../scoring/score.js';
import type { RuleViolation } from '../rules/engine.js';
import type { TransactionContext } from '../analysis/transaction.js';

export interface PlanStatement {
  index: number;
  sql: string;
  line: number;
  lock: LockClassification;
  risk: RiskScore;
  violations: RuleViolation[];
  targets: string[];
  durationClass: DurationClass;
  inTransaction: boolean;
}

export type DurationClass = 'instant' | 'seconds' | 'minutes' | 'hours' | 'unknown';

export interface ExecutionPlan {
  file: string;
  statements: PlanStatement[];
  txContext: TransactionContext;
  totalViolations: number;
  overallRisk: RiskScore;
}

/**
 * Format an execution plan for terminal output.
 */
export function formatPlan(plan: ExecutionPlan): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(chalk.bold.cyan('  ╔══════════════════════════════════════════════════════════╗'));
  lines.push(chalk.bold.cyan('  ║') + chalk.bold('  MigrationPilot — Execution Plan                       ') + chalk.bold.cyan('║'));
  lines.push(chalk.bold.cyan('  ╚══════════════════════════════════════════════════════════╝'));
  lines.push('');
  lines.push(`  ${chalk.dim('File:')} ${plan.file}`);
  lines.push(`  ${chalk.dim('Statements:')} ${plan.statements.length}  ${chalk.dim('Violations:')} ${plan.totalViolations}  ${chalk.dim('Risk:')} ${formatRiskBadge(plan.overallRisk.level)}`);
  lines.push('');

  // Timeline
  let inTx = false;

  for (const stmt of plan.statements) {
    // Transaction boundary markers
    if (stmt.inTransaction && !inTx) {
      inTx = true;
      lines.push(chalk.yellow('  ┌─ BEGIN TRANSACTION ──────────────────────────────────────'));
      lines.push(chalk.yellow('  │') + chalk.dim('  All locks held until COMMIT'));
      lines.push(chalk.yellow('  │'));
    }

    const prefix = inTx ? chalk.yellow('  │ ') : '    ';
    const stepNum = chalk.dim(`Step ${String(stmt.index + 1).padStart(2)}:`);

    // Statement SQL (truncated)
    const sqlPreview = stmt.sql.replace(/\s+/g, ' ').trim();
    const sqlDisplay = sqlPreview.length > 60 ? sqlPreview.slice(0, 57) + '...' : sqlPreview;

    lines.push(`${prefix}${stepNum} ${chalk.bold(sqlDisplay)}`);

    // Lock info
    const lockColor = stmt.lock.lockType === 'ACCESS EXCLUSIVE' ? chalk.red
      : stmt.lock.lockType === 'SHARE' ? chalk.yellow
      : stmt.lock.lockType === 'SHARE UPDATE EXCLUSIVE' ? chalk.cyan
      : chalk.green;

    lines.push(`${prefix}  ${chalk.dim('Lock:')} ${lockColor(stmt.lock.lockType)}`);

    // Blocking info
    const blockParts: string[] = [];
    if (stmt.lock.blocksReads) blockParts.push(chalk.red('blocks reads'));
    if (stmt.lock.blocksWrites) blockParts.push(chalk.yellow('blocks writes'));
    if (blockParts.length === 0) blockParts.push(chalk.green('non-blocking'));
    lines.push(`${prefix}  ${chalk.dim('Impact:')} ${blockParts.join(', ')}`);

    // Duration
    const durationEmoji = durationIcon(stmt.durationClass);
    lines.push(`${prefix}  ${chalk.dim('Duration:')} ${durationEmoji} ${stmt.durationClass}`);

    // Tables
    if (stmt.targets.length > 0) {
      lines.push(`${prefix}  ${chalk.dim('Tables:')} ${stmt.targets.join(', ')}`);
    }

    // Violations on this statement
    if (stmt.violations.length > 0) {
      for (const v of stmt.violations) {
        const icon = v.severity === 'critical' ? chalk.red('  ✗') : chalk.yellow('  ⚠');
        lines.push(`${prefix}${icon} ${chalk.dim(`[${v.ruleId}]`)} ${v.message.slice(0, 80)}`);
      }
    }

    lines.push(`${prefix}`);

    // Check if we're leaving a transaction
    if (inTx && !stmt.inTransaction) {
      // This shouldn't happen — the COMMIT itself is in the transaction
    }
  }

  // Close transaction if still open
  if (inTx) {
    lines.push(chalk.yellow('  └─ COMMIT ────────────────────────────────────────────────'));
    lines.push('');
  }

  // Summary
  lines.push(chalk.dim('  ─'.repeat(30)));

  const critCount = plan.statements.reduce((sum, s) => sum + s.violations.filter(v => v.severity === 'critical').length, 0);
  const warnCount = plan.statements.reduce((sum, s) => sum + s.violations.filter(v => v.severity === 'warning').length, 0);

  if (critCount > 0) {
    lines.push(`  ${chalk.red.bold(`${critCount} critical`)}${warnCount > 0 ? `, ${chalk.yellow.bold(`${warnCount} warning`)}` : ''} — ${chalk.red('migration is NOT safe to deploy')}`);
  } else if (warnCount > 0) {
    lines.push(`  ${chalk.yellow.bold(`${warnCount} warning(s)`)} — ${chalk.yellow('review before deploying')}`);
  } else {
    lines.push(`  ${chalk.green.bold('All clear')} — migration is safe to deploy`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Estimate the duration class of a DDL operation.
 */
export function estimateDuration(
  stmt: Record<string, unknown>,
  lock: LockClassification,
  rowCount?: number,
): DurationClass {
  // SET/RESET statements are instant
  if ('VariableSetStmt' in stmt) return 'instant';
  if ('TransactionStmt' in stmt) return 'instant';

  // CREATE TABLE is instant (no data)
  if ('CreateStmt' in stmt) return 'instant';

  // CREATE INDEX CONCURRENTLY depends on table size
  if ('IndexStmt' in stmt) {
    const idx = stmt.IndexStmt as { concurrent?: boolean };
    if (idx.concurrent) {
      if (!rowCount) return 'unknown';
      if (rowCount < 100_000) return 'seconds';
      if (rowCount < 10_000_000) return 'minutes';
      return 'hours';
    }
    // Non-concurrent: still depends on size, but holds lock
    if (!rowCount) return 'unknown';
    if (rowCount < 10_000) return 'seconds';
    if (rowCount < 1_000_000) return 'minutes';
    return 'hours';
  }

  // VACUUM FULL — always slow
  if ('VacuumStmt' in stmt) {
    const vacuum = stmt.VacuumStmt as { options?: Array<{ DefElem?: { defname?: string } }> };
    const isFull = vacuum.options?.some(o => o.DefElem?.defname === 'full');
    if (isFull) return rowCount && rowCount < 100_000 ? 'minutes' : 'hours';
    return 'seconds'; // Regular VACUUM
  }

  // CLUSTER — always slow
  if ('ClusterStmt' in stmt) return 'hours';

  // ALTER TABLE operations
  if ('AlterTableStmt' in stmt) {
    const alter = stmt.AlterTableStmt as {
      cmds?: Array<{ AlterTableCmd?: { subtype?: string } }>;
    };

    for (const cmd of alter.cmds || []) {
      const subtype = cmd.AlterTableCmd?.subtype;

      // Type changes require table rewrite
      if (subtype === 'AT_AlterColumnType') {
        if (!rowCount) return 'unknown';
        if (rowCount < 100_000) return 'seconds';
        if (rowCount < 10_000_000) return 'minutes';
        return 'hours';
      }

      // SET NOT NULL — scans entire table
      if (subtype === 'AT_SetNotNull') {
        if (!rowCount) return 'unknown';
        if (rowCount < 1_000_000) return 'seconds';
        return 'minutes';
      }

      // VALIDATE CONSTRAINT — scans entire table
      if (subtype === 'AT_ValidateConstraint') {
        if (!rowCount) return 'unknown';
        if (rowCount < 1_000_000) return 'seconds';
        return 'minutes';
      }

      // ADD COLUMN without default — instant (PG 11+)
      if (subtype === 'AT_AddColumn') return 'instant';

      // DROP COLUMN — instant (just marks as dropped)
      if (subtype === 'AT_DropColumn') return 'instant';
    }
  }

  // Default based on lock type
  if (lock.longHeld) return 'unknown';
  return 'instant';
}

function formatRiskBadge(level: string): string {
  switch (level) {
    case 'RED': return chalk.bgRed.white.bold(' RED ');
    case 'YELLOW': return chalk.bgYellow.black.bold(' YELLOW ');
    case 'GREEN': return chalk.bgGreen.black.bold(' GREEN ');
    default: return level;
  }
}

function durationIcon(duration: DurationClass): string {
  switch (duration) {
    case 'instant': return chalk.green('⚡');
    case 'seconds': return chalk.green('◷');
    case 'minutes': return chalk.yellow('◷');
    case 'hours': return chalk.red('◷');
    case 'unknown': return chalk.dim('?');
  }
}
