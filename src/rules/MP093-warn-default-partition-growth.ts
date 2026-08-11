import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP093: warn-default-partition-growth
 *
 * A DEFAULT partition catches every row that matches no other partition. That
 * sounds like a safety net and behaves like one right up until it isn't:
 * rows that should have gone to a partition nobody remembered to create
 * accumulate there silently, with no error and nothing in the logs.
 *
 * The cost surfaces later, at ATTACH time. Attaching the partition those rows
 * should have gone to makes PostgreSQL scan the entire DEFAULT partition to
 * prove none of them belong in the new range, under ACCESS EXCLUSIVE — and
 * if any do, the ATTACH fails and has to be cleaned up by hand.
 */

export const warnDefaultPartitionGrowth: Rule = {
  id: 'MP093',
  name: 'warn-default-partition-growth',
  severity: 'warning',
  description: 'A DEFAULT partition silently absorbs rows that belong to missing partitions, making later ATTACH operations expensive.',
  whyItMatters:
    'The default partition turns a missing partition from a loud failure into a silent one. Without ' +
    'it, an insert with no matching partition raises an error somebody notices the same day; with ' +
    'it, the row lands in the catch-all and the gap goes unnoticed until the default partition is ' +
    'the largest table in the database. Getting out is the expensive part: attaching the partition ' +
    'those rows belonged to requires a full scan of the default partition under ACCESS EXCLUSIVE to ' +
    'prove no row overlaps the new bound, and if one does, the ATTACH fails and the rows have to be ' +
    'moved out by hand first.',
  docsUrl: 'https://migrationpilot.dev/rules/mp093',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    if (!('CreateStmt' in stmt)) return null;

    const create = stmt.CreateStmt as {
      relation?: { relname?: string };
      partbound?: { is_default?: boolean };
      inhRelations?: Array<{ RangeVar?: { relname?: string } }>;
    };

    if (create.partbound?.is_default !== true) return null;

    const partitionName = create.relation?.relname ?? 'unknown';
    const parentName = create.inhRelations?.[0]?.RangeVar?.relname ?? 'the parent table';

    return {
      ruleId: 'MP093',
      ruleName: 'warn-default-partition-growth',
      severity: 'warning',
      message: `"${partitionName}" is a DEFAULT partition of "${parentName}". It will silently absorb every row that matches no other partition, and each later ATTACH PARTITION on "${parentName}" must scan it in full under ACCESS EXCLUSIVE.`,
      line: ctx.line,
      safeAlternative: `-- Prefer creating partitions ahead of time so a missing one fails loudly:
CREATE TABLE ${parentName}_2026_01 PARTITION OF ${parentName}
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- If you keep the default partition, monitor it so it stays near-empty:
SELECT count(*) FROM ${partitionName};

-- and drain it before attaching the partition its rows belong to, so the
-- ATTACH scan has nothing to find.`,
    };
  },
};
