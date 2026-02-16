/**
 * MP015: no-add-column-serial
 *
 * Adding a column with SERIAL or BIGSERIAL type creates an implicit sequence
 * and DEFAULT, acquiring ACCESS EXCLUSIVE lock while rewriting the table on PG < 11.
 * Even on PG 11+, it creates a dependency on a new sequence.
 *
 * Safe alternative: Add an INTEGER/BIGINT column, create the sequence separately,
 * and set the default to nextval() in a separate statement.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const noAddColumnSerial: Rule = {
  id: 'MP015',
  name: 'no-add-column-serial',
  severity: 'warning',
  description: 'ADD COLUMN with SERIAL/BIGSERIAL creates implicit sequence and may rewrite table.',
  whyItMatters: 'SERIAL/BIGSERIAL creates an implicit sequence and DEFAULT, which on PG versions before 11 causes a full table rewrite. Use GENERATED ALWAYS AS IDENTITY or manually create the sequence to avoid the rewrite.',
  docsUrl: 'https://migrationpilot.dev/rules/mp015',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relname?: string;
      relation?: { relname?: string };
      cmds?: Array<{
        AlterTableCmd?: {
          subtype?: string;
          def?: {
            ColumnDef?: {
              colname?: string;
              typeName?: {
                names?: Array<{ String?: { sval: string } }>;
              };
            };
          };
        };
      }>;
    };

    const tableName = alter.relation?.relname || alter.relname || 'unknown';

    if (!alter.cmds) return null;

    for (const cmd of alter.cmds) {
      const atCmd = cmd.AlterTableCmd;
      if (!atCmd || atCmd.subtype !== 'AT_AddColumn') continue;

      const colDef = atCmd.def?.ColumnDef;
      if (!colDef?.typeName?.names) continue;

      const typeNames = colDef.typeName.names
        .filter(n => n.String?.sval)
        .map(n => n.String!.sval.toLowerCase());

      const isSerial = typeNames.some(t =>
        t === 'serial' || t === 'bigserial' || t === 'smallserial' ||
        t === 'serial4' || t === 'serial8' || t === 'serial2'
      );

      if (isSerial) {
        const typeName = typeNames.find(t => t.startsWith('serial') || t.startsWith('bigserial') || t.startsWith('smallserial')) || 'serial';
        const intType = typeName.includes('big') ? 'bigint' : typeName.includes('small') ? 'smallint' : 'integer';

        return {
          ruleId: 'MP015',
          ruleName: 'no-add-column-serial',
          severity: 'warning',
          message: `ADD COLUMN "${colDef.colname}" with ${typeName.toUpperCase()} on "${tableName}" creates an implicit sequence and may cause table rewrite.`,
          line: ctx.line,
          safeAlternative: ctx.pgVersion >= 10
            ? `-- PG 10+: Use GENERATED ALWAYS AS IDENTITY instead of SERIAL:
ALTER TABLE ${tableName} ADD COLUMN ${colDef.colname} ${intType} GENERATED ALWAYS AS IDENTITY;`
            : `-- Step 1: Add column without default
ALTER TABLE ${tableName} ADD COLUMN ${colDef.colname} ${intType};
-- Step 2: Create sequence
CREATE SEQUENCE ${tableName}_${colDef.colname}_seq OWNED BY ${tableName}.${colDef.colname};
-- Step 3: Set default (non-blocking on PG 11+)
ALTER TABLE ${tableName} ALTER COLUMN ${colDef.colname} SET DEFAULT nextval('${tableName}_${colDef.colname}_seq');`,
        };
      }
    }

    return null;
  },
};
