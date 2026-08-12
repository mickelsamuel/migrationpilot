import type { LockClassification } from '../locks/classify.js';
import type { TableStats, AffectedQuery } from '../scoring/score.js';
import type { ProductionContext } from '../production/context.js';
import type {
  CatalogContext,
  ExistingIndex,
  TableExtensionInfo,
  TableFacts,
} from '../production/catalog.js';
import { extractTargets } from '../parser/extract.js';
import { parseDisableDirectives, filterDisabledViolations, findStaleDirectives } from './disable.js';
export type { StaleDirective } from './disable.js';

export type Severity = 'critical' | 'warning';

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  message: string;
  line: number;
  safeAlternative?: string;
  /**
   * Index of the statement that triggered this violation, stamped by
   * `runRules`. Rules do not set it. Grouping violations under their statement
   * by line number alone breaks the moment two statements share a line, which
   * `DROP TABLE a; DROP TABLE b;` on one line does.
   */
  statementIndex?: number;
}

export interface RuleContext {
  /** The original SQL text of this statement */
  originalSql: string;
  /** Line number in the migration file */
  line: number;
  /** Target PostgreSQL version */
  pgVersion: number;
  /** Lock classification for this statement */
  lock: LockClassification;
  /** All statements in the migration (for multi-statement rules) */
  allStatements: Array<{ stmt: Record<string, unknown>; originalSql: string }>;
  /** Index of this statement in allStatements */
  statementIndex: number;
  /** Production context — table stats (paid tier, optional) */
  tableStats?: TableStats;
  /** Production context — affected queries (paid tier, optional) */
  affectedQueries?: AffectedQuery[];
  /** Production context — active connections on target table (paid tier, optional) */
  activeConnections?: number;
  /** Production context — existing indexes on the target table (optional) */
  existingIndexes?: ExistingIndex[];
  /** Production context — write counters and partition shape for the target table (optional) */
  tableFacts?: TableFacts;
  /** Production context — TimescaleDB / Citus / pg_partman info for the target table (optional) */
  tableExtensions?: TableExtensionInfo;
  /** Production context — cluster-wide state: replication, disk, settings, installed extensions (optional) */
  cluster?: CatalogContext;
  /**
   * Production context — the whole context, for rules whose target table is not
   * the one the engine resolved (DML statements, partition parents).
   */
  production?: ProductionContext;
}

export interface Rule {
  id: string;
  name: string;
  severity: Severity;
  description: string;
  whyItMatters: string;
  docsUrl: string;
  check(stmt: Record<string, unknown>, context: RuleContext): RuleViolation | null;
}

/**
 * Runs all enabled rules against a set of parsed statements.
 * Returns all violations sorted by line number.
 *
 * When productionContext is provided (paid tier), rules receive table stats,
 * affected queries, and active connection counts for the target tables.
 *
 * When fullSql is provided, inline disable comments are respected:
 * -- migrationpilot-disable MP001       (disable for next statement)
 * -- migrationpilot-disable-file        (disable for entire file)
 */
export function runRules(
  rules: Rule[],
  statements: Array<{ stmt: Record<string, unknown>; originalSql: string; line: number; lock: LockClassification }>,
  pgVersion: number,
  productionContext?: ProductionContext,
  fullSql?: string,
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (let i = 0; i < statements.length; i++) {
    const entry = statements[i];
    if (!entry) continue;
    const { stmt, originalSql, line, lock } = entry;

    // Resolve production context for target tables
    let tableStats: TableStats | undefined;
    let affectedQueries: AffectedQuery[] | undefined;
    let activeConnections: number | undefined;
    let existingIndexes: ExistingIndex[] | undefined;
    let tableFacts: TableFacts | undefined;
    let tableExtensions: TableExtensionInfo | undefined;

    if (productionContext) {
      const targets = extractTargets(stmt);
      const tableName = targets[0]?.tableName;
      if (tableName) {
        tableStats = productionContext.tableStats.get(tableName);
        const queries = productionContext.affectedQueries.get(tableName);
        if (queries && queries.length > 0) affectedQueries = queries;
        const conns = productionContext.activeConnections.get(tableName);
        if (conns && conns > 0) activeConnections = conns;

        const catalog = productionContext.catalog;
        if (catalog) {
          const indexes = catalog.indexes.get(tableName);
          if (indexes && indexes.length > 0) existingIndexes = indexes;
          tableFacts = catalog.tableFacts.get(tableName);
          tableExtensions = catalog.extensionTables.get(tableName);
        }
      }
    }

    const context: RuleContext = {
      originalSql,
      line,
      pgVersion,
      lock,
      allStatements: statements,
      statementIndex: i,
      tableStats,
      affectedQueries,
      activeConnections,
      existingIndexes,
      tableFacts,
      tableExtensions,
      cluster: productionContext?.catalog,
      production: productionContext,
    };

    for (const rule of rules) {
      const violation = rule.check(stmt, context);
      if (violation) {
        violations.push({ statementIndex: i, ...violation });
      }
    }
  }

  const sorted = violations.sort((a, b) => a.line - b.line);

  // Apply inline disable directives if we have the full SQL
  if (fullSql) {
    const directives = parseDisableDirectives(fullSql);
    if (directives.length > 0) {
      const statementLines = statements.map(s => s.line);
      return filterDisabledViolations(sorted, directives, statementLines);
    }
  }

  return sorted;
}

/**
 * The violations belonging to one statement.
 *
 * `runRules` stamps every violation with the statement that produced it, so
 * that is the authority. The line fallback covers violations raised outside the
 * per-statement loop — the raw-text PG18 pass is the only one today.
 */
export function violationsOfStatement(
  violations: RuleViolation[],
  statementIndex: number,
  line: number,
): RuleViolation[] {
  return violations.filter(v =>
    v.statementIndex === undefined ? v.line === line : v.statementIndex === statementIndex
  );
}

/**
 * Find disable directives that don't suppress any violations (stale comments).
 */
export function checkStaleDirectives(
  fullSql: string,
  violations: RuleViolation[],
  statementLines: number[],
) {
  const directives = parseDisableDirectives(fullSql);
  if (directives.length === 0) return [];
  return findStaleDirectives(directives, violations, statementLines);
}

/**
 * Apply config-based severity overrides to violations.
 * Allows users to downgrade critical→warning or upgrade warning→critical per rule.
 */
export function applySeverityOverrides(
  violations: RuleViolation[],
  ruleOverrides?: Record<string, boolean | { enabled?: boolean; severity?: Severity; threshold?: number }>,
): RuleViolation[] {
  if (!ruleOverrides) return violations;

  return violations.map(v => {
    const override = ruleOverrides[v.ruleId];
    if (!override || typeof override === 'boolean') return v;
    if (override.severity && override.severity !== v.severity) {
      return { ...v, severity: override.severity };
    }
    return v;
  });
}
