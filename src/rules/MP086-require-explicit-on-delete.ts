import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP086: require-explicit-on-delete
 *
 * A foreign key with no ON DELETE clause defaults to NO ACTION, which means
 * deleting a referenced parent row raises:
 *
 *   ERROR: update or delete on table "users" violates foreign key constraint
 *
 * That is often the right behaviour — but it should be a decision, not a
 * default nobody noticed. The AST records the default and an explicit
 * ON DELETE NO ACTION identically (fk_del_action 'a'), so the original SQL is
 * consulted to tell "chose NO ACTION" apart from "wrote nothing".
 */

const FK_DEL_NO_ACTION = 'a';

interface ConstraintShape {
  contype?: string;
  conname?: string;
  fk_del_action?: string;
  pktable?: { relname?: string };
  fk_attrs?: Array<{ String?: { sval?: string } }>;
}

export const requireExplicitOnDelete: Rule = {
  id: 'MP086',
  name: 'require-explicit-on-delete',
  severity: 'warning',
  description: 'Foreign key without an explicit ON DELETE clause silently defaults to NO ACTION.',
  whyItMatters:
    'The default is NO ACTION, so every attempt to delete a referenced parent row fails once the ' +
    'first child row exists. Teams usually discover this from a production error rather than from ' +
    'the migration, because the constraint behaves fine until someone deletes something. Writing ' +
    'the clause out, whether NO ACTION, RESTRICT, CASCADE, SET NULL, or SET DEFAULT, turns an invisible ' +
    'default into a reviewable decision, and CASCADE in particular deserves to be seen in review ' +
    'given it deletes rows in tables the migration never mentions.',
  docsUrl: 'https://migrationpilot.dev/rules/mp086',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // An explicit ON DELETE anywhere in the statement means the author made a choice.
    if (/\bON\s+DELETE\b/i.test(ctx.originalSql)) return null;

    const found = findForeignKey(stmt);
    if (!found) return null;

    const { constraint, tableName } = found;
    if (constraint.fk_del_action !== FK_DEL_NO_ACTION) return null;

    const constraintName = constraint.conname ?? 'unnamed FK';
    const refTable = constraint.pktable?.relname ?? 'the referenced table';
    const column = constraint.fk_attrs?.[0]?.String?.sval;
    const columnPhrase = column ? ` on column "${column}"` : '';

    return {
      ruleId: 'MP086',
      ruleName: 'require-explicit-on-delete',
      severity: 'warning',
      message: `Foreign key "${constraintName}" on "${tableName}"${columnPhrase} → "${refTable}" has no ON DELETE clause, so it defaults to NO ACTION. Deleting a referenced row in "${refTable}" will fail once child rows exist. State the behaviour explicitly.`,
      line: ctx.line,
      safeAlternative: `-- Spell out the intended behaviour:
--   NO ACTION / RESTRICT: refuse the parent delete (what you get today)
--   CASCADE:              delete the child rows too
--   SET NULL:             orphan the child rows
ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName}
  FOREIGN KEY (${column ?? '<column>'}) REFERENCES ${refTable} (<column>)
  ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE ${tableName} VALIDATE CONSTRAINT ${constraintName};`,
    };
  },
};

/** Locate an FK constraint in either ALTER TABLE ADD CONSTRAINT or CREATE TABLE. */
function findForeignKey(
  stmt: Record<string, unknown>,
): { constraint: ConstraintShape; tableName: string } | null {
  if ('AlterTableStmt' in stmt) {
    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{ AlterTableCmd?: { subtype?: string; def?: { Constraint?: ConstraintShape } } }>;
    };
    for (const cmdWrapper of alter.cmds ?? []) {
      const cmd = cmdWrapper.AlterTableCmd;
      if (!cmd || cmd.subtype !== 'AT_AddConstraint') continue;
      const constraint = cmd.def?.Constraint;
      if (constraint?.contype === 'CONSTR_FOREIGN') {
        return { constraint, tableName: alter.relation?.relname ?? 'unknown' };
      }
    }
    return null;
  }

  if ('CreateStmt' in stmt) {
    const create = stmt.CreateStmt as {
      relation?: { relname?: string };
      tableElts?: Array<{
        Constraint?: ConstraintShape;
        ColumnDef?: { constraints?: Array<{ Constraint?: ConstraintShape }> };
      }>;
    };
    const tableName = create.relation?.relname ?? 'unknown';
    for (const elt of create.tableElts ?? []) {
      // Table-level FOREIGN KEY (...) REFERENCES ...
      if (elt.Constraint?.contype === 'CONSTR_FOREIGN') {
        return { constraint: elt.Constraint, tableName };
      }
      // Column-level REFERENCES ...
      for (const colConstraint of elt.ColumnDef?.constraints ?? []) {
        if (colConstraint.Constraint?.contype === 'CONSTR_FOREIGN') {
          return { constraint: colConstraint.Constraint, tableName };
        }
      }
    }
  }

  return null;
}
