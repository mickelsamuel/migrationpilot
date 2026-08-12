import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP092: require-partitioned-index-strategy
 *
 * Indexing a partitioned parent does not behave like indexing a table.
 *
 *   CREATE INDEX CONCURRENTLY idx ON parent (col);
 *   ERROR: cannot create index on partitioned table "parent" concurrently
 *
 * So the usual advice — always CONCURRENTLY — is not available here, and the
 * plain form recursively builds an index on every partition while holding
 * locks across the whole hierarchy for the entire build.
 *
 * The supported approach is CREATE INDEX ON ONLY parent (a catalog-only,
 * invalid parent index), then CREATE INDEX CONCURRENTLY per partition, then
 * ALTER INDEX ... ATTACH PARTITION to mark the parent index valid.
 *
 * "Is this a partitioned parent?" is answered from the migration itself: a
 * CREATE TABLE ... PARTITION BY, a CREATE TABLE ... PARTITION OF it, or an
 * ATTACH PARTITION onto it.
 */

export const requirePartitionedIndexStrategy: Rule = {
  id: 'MP092',
  name: 'require-partitioned-index-strategy',
  severity: 'warning',
  description: 'CREATE INDEX on a partitioned parent cannot use CONCURRENTLY and recursively locks every partition.',
  whyItMatters:
    'PostgreSQL rejects CREATE INDEX CONCURRENTLY on a partitioned table outright, so the habit that ' +
    'keeps index builds online everywhere else fails here, and it fails at run time, after the ' +
    'migration has started. The plain form is accepted but builds an index on every partition in one ' +
    'statement, holding locks across the whole hierarchy until the last partition finishes; on a ' +
    'table partitioned by month over three years that is thirty-six index builds inside one lock ' +
    'window. Building the parent index ON ONLY first, then each partition concurrently, keeps every ' +
    'individual build online and lets you stop between partitions.',
  docsUrl: 'https://migrationpilot.dev/rules/mp092',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('IndexStmt' in stmt)) return null;

    const index = stmt.IndexStmt as {
      idxname?: string;
      relation?: { relname?: string; inh?: boolean };
      concurrent?: boolean;
    };

    const tableName = index.relation?.relname;
    if (!tableName) return null;

    if (!isPartitionedParent(tableName, ctx)) return null;

    // ON ONLY is the recommended parent-index step — that is the fix, not the problem.
    // The parser records the recursive form as inh: true and omits it for ONLY.
    const usesOnly = index.relation?.inh !== true;
    if (usesOnly && index.concurrent !== true) return null;

    const indexName = index.idxname ?? 'unnamed index';

    const message = index.concurrent === true
      ? `CREATE INDEX CONCURRENTLY "${indexName}" on partitioned table "${tableName}" is rejected by PostgreSQL: "cannot create index on partitioned table ${tableName} concurrently". The migration will fail at this statement.`
      : `CREATE INDEX "${indexName}" on partitioned table "${tableName}" recursively builds an index on every partition, holding locks across the whole hierarchy until the last one completes.`;

    return {
      ruleId: 'MP092',
      ruleName: 'require-partitioned-index-strategy',
      severity: 'warning',
      message,
      line: ctx.line,
      safeAlternative: `-- Build the parent index as a catalog-only placeholder, then fill it in
-- one partition at a time so each build stays online:
CREATE INDEX ${indexName} ON ONLY ${tableName} (<columns>);

-- For each partition:
CREATE INDEX CONCURRENTLY ${indexName}_p1 ON ${tableName}_p1 (<columns>);
ALTER INDEX ${indexName} ATTACH PARTITION ${indexName}_p1;

-- The parent index becomes valid once every partition index is attached.`,
    };
  },
};

/** Decide from the migration itself whether `tableName` is a partitioned parent. */
function isPartitionedParent(tableName: string, ctx: RuleContext): boolean {
  return ctx.allStatements.some(({ stmt }) => {
    if ('CreateStmt' in stmt) {
      const create = stmt.CreateStmt as {
        relation?: { relname?: string };
        partspec?: unknown;
        inhRelations?: Array<{ RangeVar?: { relname?: string } }>;
        partbound?: unknown;
      };
      // CREATE TABLE tableName ... PARTITION BY ...
      if (create.partspec && create.relation?.relname === tableName) return true;
      // CREATE TABLE child PARTITION OF tableName ...
      if (create.partbound) {
        return (create.inhRelations ?? []).some(r => r.RangeVar?.relname === tableName);
      }
      return false;
    }

    if ('AlterTableStmt' in stmt) {
      const alter = stmt.AlterTableStmt as {
        relation?: { relname?: string };
        cmds?: Array<{ AlterTableCmd?: { subtype?: string } }>;
      };
      if (alter.relation?.relname !== tableName) return false;
      // ALTER TABLE tableName ATTACH PARTITION ...
      return (alter.cmds ?? []).some(c => c.AlterTableCmd?.subtype === 'AT_AttachPartition');
    }

    return false;
  });
}
