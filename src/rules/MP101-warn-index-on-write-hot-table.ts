/**
 * MP101: warn-index-on-write-hot-table
 *
 * Adding an index to a table that takes heavy write traffic. Every index is a
 * tax on every write, and the build itself competes with that traffic.
 *
 * Production-context rule: silent without --database-url. Reads
 * pg_stat_user_tables, so unlike MP013 it does not need pg_stat_statements.
 */

import type { Rule, RuleContext, RuleViolation } from './engine.js';
import { formatDuration, totalWrites, writesPerSecond } from './catalog-helpers.js';

/** Writes per second above which an extra index is worth flagging. */
const HOT_WRITES_PER_SECOND = 50;

/** Fallback when the stats window is unknown: total writes since the counters started. */
const HOT_TOTAL_WRITES = 5_000_000;

export const warnIndexOnWriteHotTable: Rule = {
  id: 'MP101',
  name: 'warn-index-on-write-hot-table',
  severity: 'warning',
  description: 'New index on a table with heavy write traffic. Every write pays for the extra index.',
  whyItMatters:
    'An index is not free after it is built. Every INSERT and DELETE maintains it, and an UPDATE that ' +
    'touches an indexed column loses the heap-only-tuple optimisation, so it writes a new index entry ' +
    'as well. On a write-hot table that shows up as higher latency on the write path and more WAL. ' +
    'The build is also slower and more disruptive here than anywhere else: a plain CREATE INDEX blocks ' +
    'writes for its whole duration, and CONCURRENTLY has to keep up with everything committed while it runs.',
  docsUrl: 'https://migrationpilot.dev/rules/mp101',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Only fires with production context — write counters come from the catalog
    if (!ctx.tableFacts) return null;
    if (!('IndexStmt' in stmt)) return null;

    const idx = stmt.IndexStmt as {
      idxname?: string;
      concurrent?: boolean;
      relation?: { relname?: string };
    };

    const facts = ctx.tableFacts;
    const writes = totalWrites(facts);
    const rate = writesPerSecond(facts);

    if (rate !== undefined) {
      if (rate < HOT_WRITES_PER_SECOND) return null;
    } else if (writes < HOT_TOTAL_WRITES) {
      return null;
    }

    const tableName = idx.relation?.relname ?? facts.tableName;
    const indexName = idx.idxname ?? 'the new index';
    const traffic = rate !== undefined
      ? `about ${Math.round(rate).toLocaleString()} writes/sec (${writes.toLocaleString()} row writes over the last ${formatDuration(facts.windowSeconds ?? 0)})`
      : `${writes.toLocaleString()} row writes since the statistics counters were last reset`;

    const buildNote = idx.concurrent
      ? 'The CONCURRENTLY build has to track every write committed while it runs, so on this table expect it to take considerably longer than a quiet-hours build.'
      : 'This build is not CONCURRENTLY, so writes are blocked on the table until it finishes.';

    return {
      ruleId: 'MP101',
      ruleName: 'warn-index-on-write-hot-table',
      severity: 'warning',
      message: `"${tableName}" is taking ${traffic} — ${facts.inserts.toLocaleString()} inserts, ${facts.updates.toLocaleString()} updates, ${facts.deletes.toLocaleString()} deletes. Adding "${indexName}" makes every one of those writes maintain another index. ${buildNote}`,
      line: ctx.line,
      safeAlternative: `-- Build without blocking writes, outside a transaction:
CREATE INDEX CONCURRENTLY ${indexName === 'the new index' ? 'idx_name' : indexName} ON ${tableName} (...);

-- Then confirm the index earns the write overhead it costs:
SELECT indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE relname = '${tableName}'
ORDER BY idx_scan;

-- Indexes that never appear in idx_scan are pure write tax — drop them.`,
    };
  },
};
