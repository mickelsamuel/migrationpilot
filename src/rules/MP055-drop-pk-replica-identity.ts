import type { Rule, RuleContext, RuleViolation } from './engine.js';

export const dropPkReplicaIdentity: Rule = {
  id: 'MP055',
  name: 'drop-pk-replica-identity-break',
  severity: 'critical',
  description: 'Dropping a primary key breaks logical replication unless REPLICA IDENTITY is explicitly set.',
  whyItMatters: 'The default replica identity IS the primary key. When you drop a PK without setting REPLICA IDENTITY FULL or USING INDEX, all subsequent UPDATE and DELETE operations fail on logical replication subscribers (Supabase, Neon, AWS RDS read replicas, Debezium CDC). The publisher succeeds but the subscriber errors with "cannot delete from table because it does not have a replica identity."',
  docsUrl: 'https://migrationpilot.dev/rules/mp055',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('AlterTableStmt' in stmt)) return null;

    const alter = stmt.AlterTableStmt as {
      relation?: { relname?: string };
      cmds?: Array<{
        AlterTableCmd: {
          subtype: string;
          name?: string;
        };
      }>;
    };

    if (!alter.cmds) return null;
    const table = alter.relation?.relname ?? 'unknown';

    for (const cmd of alter.cmds) {
      const subtype = cmd.AlterTableCmd.subtype;
      const name = cmd.AlterTableCmd.name ?? '';

      // Detect DROP CONSTRAINT where the constraint name looks like a PK
      if (subtype !== 'AT_DropConstraint') continue;
      if (!name.endsWith('_pkey') && !name.toLowerCase().includes('pk')) continue;

      // Check if migration has REPLICA IDENTITY set for this table
      const hasReplicaIdentity = ctx.allStatements.some(s => {
        const sql = s.originalSql.toLowerCase();
        return sql.includes('replica identity') &&
          sql.includes(table.toLowerCase());
      });

      if (hasReplicaIdentity) continue;

      return {
        ruleId: 'MP055',
        ruleName: 'drop-pk-replica-identity-break',
        severity: 'critical',
        message: `Dropping primary key constraint "${name}" on "${table}" without setting REPLICA IDENTITY. This breaks logical replication (Supabase, Neon, RDS read replicas, CDC pipelines).`,
        line: ctx.line,
        safeAlternative: `-- Before dropping the PK, set replica identity:
ALTER TABLE ${table} REPLICA IDENTITY FULL;
-- Or create a unique index and use it:
-- CREATE UNIQUE INDEX CONCURRENTLY idx_${table}_new_pk ON ${table} (id);
-- ALTER TABLE ${table} REPLICA IDENTITY USING INDEX idx_${table}_new_pk;`,
      };
    }

    return null;
  },
};
