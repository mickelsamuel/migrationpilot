/**
 * Who owns an index — the one question MP070 and MP097 both turn on.
 *
 * A `UNIQUE` or `PRIMARY KEY` constraint owns the index enforcing it, and while
 * it does, `DROP INDEX` is refused:
 *
 *   ERROR: cannot drop index users_email_key because constraint users_email_key
 *          on table users requires it
 *
 * `IF EXISTS` does not soften it and neither does `CONCURRENTLY` — both were
 * verified against PostgreSQL 18.3, along with the counter-case: a plain
 * `CREATE UNIQUE INDEX` is not owned by anything and drops without complaint.
 *
 * So "unique" and "constraint-backed" are different properties, and guessing one
 * from the other — or from a `_key` suffix on a name — is how MP097 came to
 * raise a merge-blocking critical against a correct migration. Ownership is only
 * ever reported here when something actually says so: the production catalog, or
 * a statement in the file that adopts the index into a constraint.
 */

import type { RuleContext } from './engine.js';

export type OwnershipSource = 'catalog' | 'migration';

export interface ConstraintOwnership {
  /** Where the claim comes from. */
  source: OwnershipSource;
  /** Name of the owning constraint. */
  constraintName: string;
  /** PRIMARY KEY or UNIQUE. */
  kind: 'PRIMARY KEY' | 'UNIQUE';
  /** Table the constraint is on, when known. */
  tableName?: string;
  /** Statement index that establishes it, for the `migration` source. */
  statementIndex?: number;
}

interface Statement {
  stmt: Record<string, unknown>;
  originalSql: string;
}

/**
 * Does a constraint own `indexName` by the time statement `before` runs?
 *
 * Checked against the production catalog first, then against the statements
 * ahead of this one in the migration. Returns null when nothing establishes it —
 * which is the answer for every plain `CREATE UNIQUE INDEX`, and the reason this
 * function exists rather than a name-suffix test.
 */
export function constraintOwning(
  ctx: RuleContext,
  indexName: string,
  before = ctx.statementIndex,
): ConstraintOwnership | null {
  return fromCatalog(ctx, indexName) ?? adoptionInMigration(ctx.allStatements, indexName, 0, before);
}

/**
 * Is `indexName` adopted into a constraint *after* statement `after`?
 *
 * This is the s06 shape: build the unique index concurrently, then hand it to
 * `ADD CONSTRAINT ... USING INDEX`. From that point the index cannot be dropped,
 * so the drop-first retry convention does not apply to it.
 */
export function adoptedLaterInMigration(
  ctx: RuleContext,
  indexName: string,
): ConstraintOwnership | null {
  return adoptionInMigration(ctx.allStatements, indexName, ctx.statementIndex + 1, ctx.allStatements.length);
}

/** The catalog's own answer, available when --database-url was given. */
function fromCatalog(ctx: RuleContext, indexName: string): ConstraintOwnership | null {
  const byTable = ctx.cluster?.indexes;
  if (!byTable) return null;

  const target = indexName.toLowerCase();
  for (const indexes of byTable.values()) {
    for (const idx of indexes) {
      if (idx.indexName.toLowerCase() !== target) continue;
      if (!idx.isConstraintBacked) return null;
      return {
        source: 'catalog',
        constraintName: idx.indexName,
        kind: idx.isPrimary ? 'PRIMARY KEY' : 'UNIQUE',
        tableName: idx.tableName,
      };
    }
  }
  return null;
}

/**
 * Scan `[from, to)` for a statement that puts `indexName` under a constraint.
 *
 * Two forms do it: `ADD CONSTRAINT c UNIQUE USING INDEX <indexName>`, which
 * adopts an index that already exists, and `ADD CONSTRAINT <indexName> UNIQUE
 * (cols)`, which builds an index of that name and owns it from the start.
 */
function adoptionInMigration(
  statements: Statement[],
  indexName: string,
  from: number,
  to: number,
): ConstraintOwnership | null {
  const target = indexName.toLowerCase();

  for (let i = Math.max(0, from); i < Math.min(to, statements.length); i++) {
    const entry = statements[i];
    if (!entry || !('AlterTableStmt' in entry.stmt)) continue;

    const alter = entry.stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd?: { subtype?: string; def?: Record<string, unknown> } }>;
    };

    for (const wrapper of alter.cmds ?? []) {
      const cmd = wrapper.AlterTableCmd;
      if (cmd?.subtype !== 'AT_AddConstraint') continue;

      const constraint = cmd.def?.Constraint as
        | { contype?: string; conname?: string; indexname?: string }
        | undefined;
      if (!constraint) continue;

      const kind = constraintKind(constraint.contype);
      if (!kind) continue;

      const adopts = constraint.indexname?.toLowerCase() === target;
      const named = constraint.conname?.toLowerCase() === target;
      if (!adopts && !named) continue;

      return {
        source: 'migration',
        constraintName: constraint.conname ?? indexName,
        kind,
        tableName: alter.relation?.relname,
        statementIndex: i,
      };
    }
  }

  return null;
}

function constraintKind(contype: string | undefined): 'PRIMARY KEY' | 'UNIQUE' | null {
  if (contype === 'CONSTR_PRIMARY') return 'PRIMARY KEY';
  if (contype === 'CONSTR_UNIQUE') return 'UNIQUE';
  return null;
}
