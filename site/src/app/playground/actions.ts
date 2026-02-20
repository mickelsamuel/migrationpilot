'use server';

import { parse as pgParse } from 'libpg-query';

// Inline the minimal analysis logic for server-side playground
// This avoids importing the full CLI (which has chalk, commander, etc.)

type Severity = 'critical' | 'warning';

interface PlaygroundViolation {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  message: string;
  line: number;
  safeAlternative?: string;
}

interface PlaygroundLock {
  lockType: string;
  blocksReads: boolean;
  blocksWrites: boolean;
}

interface PlaygroundStatement {
  sql: string;
  line: number;
  lockType: string;
  blocksReads: boolean;
  blocksWrites: boolean;
}

export interface PlaygroundResult {
  statements: PlaygroundStatement[];
  violations: PlaygroundViolation[];
  riskLevel: 'RED' | 'YELLOW' | 'GREEN';
  parseError?: string;
}

// Minimal lock classification for the playground
function classifyLockSimple(stmt: Record<string, unknown>): PlaygroundLock {
  if ('IndexStmt' in stmt) {
    const idx = stmt.IndexStmt as { concurrent?: boolean };
    if (idx.concurrent) return { lockType: 'SHARE UPDATE EXCLUSIVE', blocksReads: false, blocksWrites: false };
    return { lockType: 'SHARE', blocksReads: false, blocksWrites: true };
  }
  if ('AlterTableStmt' in stmt) return { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true };
  if ('CreateStmt' in stmt) return { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true };
  if ('DropStmt' in stmt) return { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true };
  if ('RenameStmt' in stmt) return { lockType: 'ACCESS EXCLUSIVE', blocksReads: true, blocksWrites: true };
  if ('VacuumStmt' in stmt) {
    const vac = stmt.VacuumStmt as { is_vacuumcmd?: boolean; options?: number };
    if (vac.is_vacuumcmd) return { lockType: 'SHARE UPDATE EXCLUSIVE', blocksReads: false, blocksWrites: false };
    return { lockType: 'SHARE UPDATE EXCLUSIVE', blocksReads: false, blocksWrites: false };
  }
  if ('SelectStmt' in stmt) return { lockType: 'ACCESS SHARE', blocksReads: false, blocksWrites: false };
  return { lockType: 'ACCESS SHARE', blocksReads: false, blocksWrites: false };
}

// Simplified rule checks for the playground — top 20 most impactful rules
interface SimpleRule {
  id: string;
  name: string;
  severity: Severity;
  check: (stmt: Record<string, unknown>, sql: string) => PlaygroundViolation | null;
}

const playgroundRules: SimpleRule[] = [
  {
    id: 'MP001', name: 'require-concurrent-index', severity: 'critical',
    check: (stmt, sql) => {
      if (!('IndexStmt' in stmt)) return null;
      const idx = stmt.IndexStmt as { concurrent?: boolean };
      if (idx.concurrent) return null;
      return { ruleId: 'MP001', ruleName: 'require-concurrent-index', severity: 'critical', message: 'CREATE INDEX without CONCURRENTLY blocks all writes for the duration of the index build.', line: 0, safeAlternative: 'CREATE INDEX CONCURRENTLY ...' };
    },
  },
  {
    id: 'MP004', name: 'require-lock-timeout', severity: 'critical',
    check: (stmt, sql) => {
      if ('AlterTableStmt' in stmt || 'CreateStmt' in stmt || 'IndexStmt' in stmt) {
        const lowerSql = sql.toLowerCase();
        if (lowerSql.includes('lock_timeout')) return null;
        return { ruleId: 'MP004', ruleName: 'require-lock-timeout', severity: 'critical', message: 'DDL without SET lock_timeout — queries will queue behind the lock indefinitely.', line: 0, safeAlternative: "SET lock_timeout = '5s';" };
      }
      return null;
    },
  },
  {
    id: 'MP005', name: 'require-not-valid-fk', severity: 'critical',
    check: (stmt, sql) => {
      if (!('AlterTableStmt' in stmt)) return null;
      const alter = stmt.AlterTableStmt as { cmds?: Array<{ AlterTableCmd: { subtype: string; def?: Record<string, unknown> } }> };
      if (!alter.cmds) return null;
      for (const cmd of alter.cmds) {
        if (cmd.AlterTableCmd.subtype !== 'AT_AddConstraint') continue;
        const def = cmd.AlterTableCmd.def;
        if (!def) continue;
        const defStr = JSON.stringify(def);
        if (defStr.includes('CONSTR_FOREIGN') && !defStr.includes('skip_validation')) {
          return { ruleId: 'MP005', ruleName: 'require-not-valid-fk', severity: 'critical', message: 'Foreign key without NOT VALID scans the entire table while holding ACCESS EXCLUSIVE lock.', line: 0, safeAlternative: 'ADD CONSTRAINT ... FOREIGN KEY ... NOT VALID;\nALTER TABLE ... VALIDATE CONSTRAINT ...;' };
        }
      }
      return null;
    },
  },
  {
    id: 'MP006', name: 'no-vacuum-full', severity: 'critical',
    check: (stmt) => {
      if (!('VacuumStmt' in stmt)) return null;
      const vac = stmt.VacuumStmt as { is_vacuumcmd?: boolean; options?: Array<{ DefElem?: { defname?: string } }> };
      if (!vac.options) return null;
      const hasFull = vac.options.some(o => o.DefElem?.defname === 'full');
      if (!hasFull) return null;
      return { ruleId: 'MP006', ruleName: 'no-vacuum-full', severity: 'critical', message: 'VACUUM FULL rewrites the entire table under ACCESS EXCLUSIVE lock — no reads or writes possible.', line: 0, safeAlternative: 'Use pg_repack or VACUUM (without FULL) instead.' };
    },
  },
  {
    id: 'MP007', name: 'no-column-type-change', severity: 'critical',
    check: (stmt) => {
      if (!('AlterTableStmt' in stmt)) return null;
      const alter = stmt.AlterTableStmt as { cmds?: Array<{ AlterTableCmd: { subtype: string } }> };
      if (!alter.cmds) return null;
      for (const cmd of alter.cmds) {
        if (cmd.AlterTableCmd.subtype === 'AT_AlterColumnType') {
          return { ruleId: 'MP007', ruleName: 'no-column-type-change', severity: 'critical', message: 'ALTER COLUMN TYPE rewrites the entire table under ACCESS EXCLUSIVE lock.', line: 0, safeAlternative: 'Add a new column, backfill, then swap.' };
        }
      }
      return null;
    },
  },
  {
    id: 'MP009', name: 'require-drop-index-concurrently', severity: 'warning',
    check: (stmt, sql) => {
      if (!('DropStmt' in stmt)) return null;
      const drop = stmt.DropStmt as { removeType?: string; concurrent?: boolean };
      if (drop.removeType !== 'OBJECT_INDEX') return null;
      if (drop.concurrent) return null;
      return { ruleId: 'MP009', ruleName: 'require-drop-index-concurrently', severity: 'warning', message: 'DROP INDEX without CONCURRENTLY acquires ACCESS EXCLUSIVE lock.', line: 0, safeAlternative: 'DROP INDEX CONCURRENTLY ...' };
    },
  },
  {
    id: 'MP010', name: 'no-rename-column', severity: 'warning',
    check: (stmt) => {
      if (!('RenameStmt' in stmt)) return null;
      const rename = stmt.RenameStmt as { renameType?: string | number };
      if (rename.renameType !== 'OBJECT_COLUMN' && rename.renameType !== 7) return null;
      return { ruleId: 'MP010', ruleName: 'no-rename-column', severity: 'warning', message: 'RENAME COLUMN breaks all running queries that reference the old name.', line: 0, safeAlternative: 'Add new column, backfill, swap using views.' };
    },
  },
  {
    id: 'MP017', name: 'no-drop-column', severity: 'warning',
    check: (stmt) => {
      if (!('AlterTableStmt' in stmt)) return null;
      const alter = stmt.AlterTableStmt as { cmds?: Array<{ AlterTableCmd: { subtype: string } }> };
      if (!alter.cmds) return null;
      for (const cmd of alter.cmds) {
        if (cmd.AlterTableCmd.subtype === 'AT_DropColumn') {
          return { ruleId: 'MP017', ruleName: 'no-drop-column', severity: 'warning', message: 'DROP COLUMN acquires ACCESS EXCLUSIVE lock and may break application queries.', line: 0 };
        }
      }
      return null;
    },
  },
  {
    id: 'MP026', name: 'ban-drop-table', severity: 'critical',
    check: (stmt) => {
      if (!('DropStmt' in stmt)) return null;
      const drop = stmt.DropStmt as { removeType?: string };
      if (drop.removeType !== 'OBJECT_TABLE') return null;
      return { ruleId: 'MP026', ruleName: 'ban-drop-table', severity: 'critical', message: 'DROP TABLE permanently removes the table and all its data.', line: 0 };
    },
  },
  {
    id: 'MP037', name: 'prefer-text-over-varchar', severity: 'warning',
    check: (_, sql) => {
      if (/VARCHAR\s*\(\s*\d+\s*\)/i.test(sql)) {
        return { ruleId: 'MP037', ruleName: 'prefer-text-over-varchar', severity: 'warning', message: 'VARCHAR(n) offers no performance benefit over TEXT in PostgreSQL.', line: 0, safeAlternative: 'Use TEXT instead of VARCHAR(n).' };
      }
      return null;
    },
  },
  {
    id: 'MP040', name: 'prefer-timestamptz', severity: 'warning',
    check: (_, sql) => {
      if (/\bTIMESTAMP\b(?!\s*WITH\s*TIME\s*ZONE|\s*WITHOUT\s*TIME\s*ZONE|TZ)/i.test(sql) && !/TIMESTAMPTZ/i.test(sql)) {
        return { ruleId: 'MP040', ruleName: 'prefer-timestamptz', severity: 'warning', message: 'TIMESTAMP without time zone causes silent timezone bugs.', line: 0, safeAlternative: 'Use TIMESTAMPTZ instead.' };
      }
      return null;
    },
  },
  {
    id: 'MP045', name: 'require-primary-key', severity: 'warning',
    check: (stmt) => {
      if (!('CreateStmt' in stmt)) return null;
      const create = stmt.CreateStmt as { tableElts?: Array<Record<string, unknown>> };
      if (!create.tableElts) return null;
      const json = JSON.stringify(create.tableElts);
      if (!json.includes('CONSTR_PRIMARY')) {
        return { ruleId: 'MP045', ruleName: 'require-primary-key', severity: 'warning', message: 'Table without PRIMARY KEY breaks logical replication and can cause performance issues.', line: 0, safeAlternative: 'Add a PRIMARY KEY column.' };
      }
      return null;
    },
  },
];

export async function analyzePlayground(sql: string, pgVersion: number): Promise<PlaygroundResult> {
  if (!sql.trim()) {
    return { statements: [], violations: [], riskLevel: 'GREEN' };
  }

  try {
    const result = await pgParse(sql);
    const statements: PlaygroundStatement[] = [];
    const violations: PlaygroundViolation[] = [];

    for (const s of result.stmts) {
      const stmt = s.stmt as Record<string, unknown>;
      const loc = s.stmt_location ?? 0;
      const len = s.stmt_len ?? sql.length - loc;
      const stmtSql = sql.slice(loc, loc + len).trim();
      const line = sql.slice(0, loc).split('\n').length;
      const lock = classifyLockSimple(stmt);

      statements.push({
        sql: stmtSql,
        line,
        lockType: lock.lockType,
        blocksReads: lock.blocksReads,
        blocksWrites: lock.blocksWrites,
      });

      // Run simplified rules
      for (const rule of playgroundRules) {
        const violation = rule.check(stmt, stmtSql);
        if (violation) {
          violations.push({ ...violation, line });
        }
      }
    }

    // Determine risk level
    const hasCritical = violations.some(v => v.severity === 'critical');
    const hasWarning = violations.some(v => v.severity === 'warning');
    const blocksReads = statements.some(s => s.blocksReads);

    let riskLevel: 'RED' | 'YELLOW' | 'GREEN' = 'GREEN';
    if (hasCritical || blocksReads) riskLevel = 'RED';
    else if (hasWarning) riskLevel = 'YELLOW';

    return { statements, violations, riskLevel };
  } catch (err) {
    return {
      statements: [],
      violations: [],
      riskLevel: 'GREEN',
      parseError: err instanceof Error ? err.message : 'Failed to parse SQL',
    };
  }
}
