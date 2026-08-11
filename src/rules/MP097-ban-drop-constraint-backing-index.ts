import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP097: ban-drop-constraint-backing-index
 *
 * A PRIMARY KEY or UNIQUE constraint owns the index that enforces it, and
 * PostgreSQL refuses to let go of that index on its own:
 *
 *   DROP INDEX users_pkey;
 *   ERROR: cannot drop index users_pkey because constraint users_pkey
 *          on table users requires it
 *
 * The statement fails, so the migration aborts. Reaching for DROP ... CASCADE
 * to get past it is worse: that drops the constraint too, along with any
 * foreign key pointing at it.
 *
 * DROP CONSTRAINT on a primary key is left to MP055, which covers the
 * replication consequences of that specific case.
 */

const PK_SUFFIX = '_pkey';
const UNIQUE_SUFFIXES = ['_key', '_unique', '_uniq'];

export const banDropConstraintBackingIndex: Rule = {
  id: 'MP097',
  name: 'ban-drop-constraint-backing-index',
  severity: 'critical',
  description: 'Dropping the index behind a PRIMARY KEY or UNIQUE constraint is rejected by PostgreSQL and aborts the migration.',
  whyItMatters:
    'The index is owned by the constraint, so PostgreSQL rejects the DROP INDEX with "cannot drop ' +
    'index ... because constraint ... requires it" and the migration aborts at that statement. The ' +
    'usual next move — adding CASCADE — turns a failed migration into a data-integrity change, ' +
    'because it drops the constraint as well and takes every foreign key referencing it along too. ' +
    'Dropping a unique constraint also removes the only thing preventing duplicate rows, and ' +
    're-adding it later means a full table scan that fails outright if duplicates appeared while it ' +
    'was gone.',
  docsUrl: 'https://migrationpilot.dev/rules/mp097',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    const fromDropIndex = checkDropIndex(stmt, ctx);
    if (fromDropIndex) return fromDropIndex;
    return checkDropUniqueConstraint(stmt, ctx);
  },
};

/** DROP INDEX naming an index that backs a PK or UNIQUE constraint. */
function checkDropIndex(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
  if (!('DropStmt' in stmt)) return null;

  const drop = stmt.DropStmt as {
    removeType?: string;
    behavior?: string;
    objects?: Array<{ List?: { items?: Array<{ String?: { sval?: string } }> } }>;
  };

  if (drop.removeType !== 'OBJECT_INDEX') return null;

  for (const obj of drop.objects ?? []) {
    const parts = (obj.List?.items ?? [])
      .map(i => i.String?.sval)
      .filter((s): s is string => typeof s === 'string');
    const indexName = parts[parts.length - 1];
    if (!indexName) continue;

    const lower = indexName.toLowerCase();
    const isPk = lower.endsWith(PK_SUFFIX);
    const isUnique = UNIQUE_SUFFIXES.some(s => lower.endsWith(s));
    if (!isPk && !isUnique) continue;

    const constraintKind = isPk ? 'PRIMARY KEY' : 'UNIQUE';
    const cascading = drop.behavior === 'DROP_CASCADE';

    const message = cascading
      ? `DROP INDEX "${indexName}" CASCADE drops the ${constraintKind} constraint that owns this index, and every foreign key referencing it. The index cannot be dropped on its own — CASCADE turns the error into silent loss of the constraint.`
      : `DROP INDEX "${indexName}" targets the index behind a ${constraintKind} constraint. PostgreSQL rejects this with "cannot drop index ${indexName} because constraint ${indexName} ... requires it" and the migration aborts here.`;

    return {
      ruleId: 'MP097',
      ruleName: 'ban-drop-constraint-backing-index',
      severity: 'critical',
      message,
      line: ctx.line,
      safeAlternative: `-- The index cannot outlive its constraint, and cannot be dropped while the
-- constraint exists. Decide which one you actually mean:

-- To keep the constraint: leave the index alone, it is not redundant.

-- To remove the guarantee, drop the constraint and let the index go with it:
ALTER TABLE <table> DROP CONSTRAINT ${indexName};

-- To swap in a differently-built index without losing the guarantee:
CREATE UNIQUE INDEX CONCURRENTLY ${indexName}_new ON <table> (<columns>);
ALTER TABLE <table> DROP CONSTRAINT ${indexName},
  ADD CONSTRAINT ${indexName} ${constraintKind} USING INDEX ${indexName}_new;`,
    };
  }

  return null;
}

/** ALTER TABLE ... DROP CONSTRAINT on a UNIQUE constraint (PK is MP055's remit). */
function checkDropUniqueConstraint(
  stmt: Record<string, unknown>,
  ctx: RuleContext,
): RuleViolation | null {
  if (!('AlterTableStmt' in stmt)) return null;

  const alter = stmt.AlterTableStmt as {
    relation?: { relname?: string };
    cmds?: Array<{ AlterTableCmd?: { subtype?: string; name?: string } }>;
  };

  if (!alter.cmds) return null;
  const tableName = alter.relation?.relname ?? 'unknown';

  for (const cmdWrapper of alter.cmds) {
    const cmd = cmdWrapper.AlterTableCmd;
    if (!cmd || cmd.subtype !== 'AT_DropConstraint') continue;

    const name = cmd.name ?? '';
    const lower = name.toLowerCase();

    // Primary keys are MP055's territory — it reports the replication angle.
    if (lower.endsWith(PK_SUFFIX)) continue;
    if (!UNIQUE_SUFFIXES.some(s => lower.endsWith(s))) continue;

    return {
      ruleId: 'MP097',
      ruleName: 'ban-drop-constraint-backing-index',
      severity: 'critical',
      message: `DROP CONSTRAINT "${name}" on "${tableName}" removes a UNIQUE constraint and the index enforcing it in one step. Duplicate rows become possible immediately, and any foreign key referencing these columns is dropped with it.`,
      line: ctx.line,
      safeAlternative: `-- Keep an index in place if queries depend on it, so dropping the
-- constraint does not also remove the access path:
CREATE INDEX CONCURRENTLY ${name}_idx ON ${tableName} (<columns>);
ALTER TABLE ${tableName} DROP CONSTRAINT ${name};

-- Re-adding the constraint later needs a full scan and fails if duplicates
-- appeared while it was gone. Check before you rely on being able to:
SELECT <columns>, count(*) FROM ${tableName}
  GROUP BY <columns> HAVING count(*) > 1;`,
    };
  }

  return null;
}
