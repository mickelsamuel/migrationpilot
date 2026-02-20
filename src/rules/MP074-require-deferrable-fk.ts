import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP074: require-deferrable-fk
 *
 * Foreign key constraints should be DEFERRABLE INITIALLY DEFERRED (or at
 * least DEFERRABLE) to support safe bulk operations and data migrations.
 *
 * Non-deferrable FKs are checked on every row during INSERT/UPDATE, which
 * means the order of operations matters for circular references and bulk
 * imports. DEFERRABLE constraints are checked at COMMIT time instead.
 */

export const requireDeferrableFk: Rule = {
  id: 'MP074',
  name: 'require-deferrable-fk',
  severity: 'warning',
  description: 'FK constraints should be DEFERRABLE to support safe bulk operations and avoid ordering issues.',
  whyItMatters:
    'Non-deferrable foreign keys are checked per-row during INSERT/UPDATE, requiring careful ' +
    'insertion order. With DEFERRABLE INITIALLY DEFERRED, FK checks happen at COMMIT time, ' +
    'allowing bulk inserts, circular references, and data migrations to proceed without ordering ' +
    'constraints. This is especially important for tables that reference each other.',
  docsUrl: 'https://migrationpilot.dev/rules/mp074',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Check ALTER TABLE ADD CONSTRAINT ... FOREIGN KEY (without DEFERRABLE)
    if ('AlterTableStmt' in stmt) {
      const alter = stmt.AlterTableStmt as {
        relation?: { relname?: string };
        cmds?: Array<{
          AlterTableCmd?: {
            subtype?: string;
            def?: Record<string, unknown>;
          };
        }>;
      };

      if (!alter.cmds) return null;

      for (const cmdWrapper of alter.cmds) {
        const cmd = cmdWrapper.AlterTableCmd;
        if (!cmd || cmd.subtype !== 'AT_AddConstraint') continue;

        const constraint = cmd.def?.Constraint as {
          contype?: string;
          conname?: string;
          deferrable?: boolean;
          pktable?: { relname?: string };
        } | undefined;

        if (!constraint || constraint.contype !== 'CONSTR_FOREIGN') continue;
        if (constraint.deferrable) continue;

        const table = alter.relation?.relname ?? 'unknown';
        const name = constraint.conname ?? 'unnamed_fk';
        const ref = constraint.pktable?.relname ?? 'unknown';

        return {
          ruleId: 'MP074',
          ruleName: 'require-deferrable-fk',
          severity: 'warning',
          message: `FK "${name}" on "${table}" → "${ref}" is not DEFERRABLE. This forces row-by-row checking during bulk operations.`,
          line: ctx.line,
          safeAlternative: `ALTER TABLE ${table} ADD CONSTRAINT ${name}
  FOREIGN KEY (...) REFERENCES ${ref} (...)
  DEFERRABLE INITIALLY DEFERRED NOT VALID;`,
        };
      }
    }

    // Check inline FK in CREATE TABLE
    if ('CreateStmt' in stmt) {
      const create = stmt.CreateStmt as {
        relation?: { relname?: string };
        tableElts?: Array<{
          ColumnDef?: {
            colname?: string;
            constraints?: Array<{
              Constraint?: {
                contype?: string;
                deferrable?: boolean;
                pktable?: { relname?: string };
              };
            }>;
          };
          Constraint?: {
            contype?: string;
            conname?: string;
            deferrable?: boolean;
            pktable?: { relname?: string };
          };
        }>;
      };

      if (!create.tableElts) return null;
      const table = create.relation?.relname ?? 'unknown';

      for (const elt of create.tableElts) {
        // Table-level constraint
        if (elt.Constraint?.contype === 'CONSTR_FOREIGN' && !elt.Constraint.deferrable) {
          const name = elt.Constraint.conname ?? 'unnamed_fk';
          const ref = elt.Constraint.pktable?.relname ?? 'unknown';
          return {
            ruleId: 'MP074',
            ruleName: 'require-deferrable-fk',
            severity: 'warning',
            message: `FK "${name}" on "${table}" → "${ref}" is not DEFERRABLE. Add DEFERRABLE INITIALLY DEFERRED for safe bulk operations.`,
            line: ctx.line,
          };
        }

        // Column-level constraint
        if (elt.ColumnDef?.constraints) {
          for (const c of elt.ColumnDef.constraints) {
            if (c.Constraint?.contype === 'CONSTR_FOREIGN' && !c.Constraint.deferrable) {
              const ref = c.Constraint.pktable?.relname ?? 'unknown';
              return {
                ruleId: 'MP074',
                ruleName: 'require-deferrable-fk',
                severity: 'warning',
                message: `FK on "${table}"."${elt.ColumnDef.colname}" → "${ref}" is not DEFERRABLE. Add DEFERRABLE for safe bulk operations.`,
                line: ctx.line,
              };
            }
          }
        }
      }
    }

    return null;
  },
};
