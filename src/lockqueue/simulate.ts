/**
 * Lock queue simulation.
 *
 * Simulates the lock queue effects of DDL operations. For each DDL statement,
 * determines what PostgreSQL lock it acquires, what concurrent operations it
 * blocks, and estimates queue buildup based on active connection count and
 * average query duration.
 *
 * This helps teams understand the blast radius of their migrations and plan
 * deployment windows accordingly.
 */

export interface LockQueueResult {
  /** The PostgreSQL lock type acquired by this DDL statement. */
  ddlLockType: string;
  /** Operations that will be blocked while this DDL holds its lock. */
  blockedOperations: string[];
  /** Estimated maximum time queries will be queued. */
  maxQueueTime: string;
  /** Actionable recommendations to reduce lock impact. */
  recommendations: string[];
}

interface SimulationOpts {
  /** Number of active database connections (default: 50). */
  activeConnections?: number;
  /** Average query duration in milliseconds (default: 100). */
  avgQueryDuration?: number;
}

/**
 * PostgreSQL lock compatibility matrix.
 * Locks are listed from weakest to strongest.
 */
const LOCK_HIERARCHY = [
  'ACCESS SHARE',
  'ROW SHARE',
  'ROW EXCLUSIVE',
  'SHARE UPDATE EXCLUSIVE',
  'SHARE',
  'SHARE ROW EXCLUSIVE',
  'EXCLUSIVE',
  'ACCESS EXCLUSIVE',
] as const;

/**
 * Maps each lock type to the operations it blocks.
 */
const LOCK_CONFLICTS: Record<string, string[]> = {
  'ACCESS SHARE': [],
  'ROW SHARE': [
    'ACCESS EXCLUSIVE',
  ],
  'ROW EXCLUSIVE': [
    'SHARE', 'SHARE ROW EXCLUSIVE', 'EXCLUSIVE', 'ACCESS EXCLUSIVE',
  ],
  'SHARE UPDATE EXCLUSIVE': [
    'SHARE UPDATE EXCLUSIVE', 'SHARE', 'SHARE ROW EXCLUSIVE', 'EXCLUSIVE', 'ACCESS EXCLUSIVE',
  ],
  'SHARE': [
    'ROW EXCLUSIVE', 'SHARE UPDATE EXCLUSIVE', 'SHARE ROW EXCLUSIVE', 'EXCLUSIVE', 'ACCESS EXCLUSIVE',
  ],
  'SHARE ROW EXCLUSIVE': [
    'ROW EXCLUSIVE', 'SHARE UPDATE EXCLUSIVE', 'SHARE', 'SHARE ROW EXCLUSIVE', 'EXCLUSIVE', 'ACCESS EXCLUSIVE',
  ],
  'EXCLUSIVE': [
    'ROW SHARE', 'ROW EXCLUSIVE', 'SHARE UPDATE EXCLUSIVE', 'SHARE', 'SHARE ROW EXCLUSIVE', 'EXCLUSIVE', 'ACCESS EXCLUSIVE',
  ],
  'ACCESS EXCLUSIVE': [
    'ACCESS SHARE', 'ROW SHARE', 'ROW EXCLUSIVE', 'SHARE UPDATE EXCLUSIVE', 'SHARE', 'SHARE ROW EXCLUSIVE', 'EXCLUSIVE', 'ACCESS EXCLUSIVE',
  ],
};

/**
 * Maps lock types to the common SQL operations that acquire them.
 */
const LOCK_TO_OPERATIONS: Record<string, string[]> = {
  'ACCESS SHARE': ['SELECT'],
  'ROW SHARE': ['SELECT FOR UPDATE', 'SELECT FOR SHARE'],
  'ROW EXCLUSIVE': ['INSERT', 'UPDATE', 'DELETE'],
  'SHARE UPDATE EXCLUSIVE': ['VACUUM', 'ANALYZE', 'CREATE INDEX CONCURRENTLY'],
  'SHARE': ['CREATE INDEX'],
  'SHARE ROW EXCLUSIVE': ['CREATE TRIGGER', 'ALTER TABLE (some forms)'],
  'EXCLUSIVE': ['REFRESH MATERIALIZED VIEW CONCURRENTLY'],
  'ACCESS EXCLUSIVE': [
    'ALTER TABLE', 'DROP TABLE', 'TRUNCATE', 'REINDEX', 'VACUUM FULL',
    'REFRESH MATERIALIZED VIEW',
  ],
};

/**
 * Simulate the lock queue effects of DDL operations.
 *
 * For each DDL statement, determines the lock type, blocked operations,
 * and estimated queue buildup time based on connection characteristics.
 *
 * @param sql - SQL containing DDL statements.
 * @param opts - Optional simulation parameters.
 * @returns Array of lock queue results, one per DDL statement.
 */
export function simulateLockQueue(
  sql: string,
  opts?: SimulationOpts,
): LockQueueResult[] {
  const activeConnections = opts?.activeConnections ?? 50;
  const avgQueryDuration = opts?.avgQueryDuration ?? 100;

  const statements = splitStatements(sql);
  const results: LockQueueResult[] = [];

  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;

    const result = simulateStatement(trimmed, activeConnections, avgQueryDuration);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Per-statement simulation
// ---------------------------------------------------------------------------

function simulateStatement(
  sql: string,
  activeConnections: number,
  avgQueryDuration: number,
): LockQueueResult | null {
  const upper = sql.toUpperCase().replace(/\s+/g, ' ').trim();
  const lockType = classifyLockType(upper);

  if (!lockType) return null;

  const blockedLocks = LOCK_CONFLICTS[lockType] ?? [];
  const blockedOps = mapLocksToOperations(blockedLocks);
  const recommendations = generateRecommendations(upper, lockType, activeConnections);
  const maxQueueTime = estimateQueueTime(lockType, activeConnections, avgQueryDuration);

  return {
    ddlLockType: lockType,
    blockedOperations: blockedOps,
    maxQueueTime,
    recommendations,
  };
}

function classifyLockType(upper: string): string | null {
  // CREATE INDEX CONCURRENTLY — SHARE UPDATE EXCLUSIVE
  if (upper.includes('CREATE') && upper.includes('INDEX') && upper.includes('CONCURRENTLY')) {
    return 'SHARE UPDATE EXCLUSIVE';
  }

  // CREATE INDEX (non-concurrent) — SHARE
  if (upper.startsWith('CREATE INDEX') || upper.startsWith('CREATE UNIQUE INDEX')) {
    return 'SHARE';
  }

  // DROP INDEX CONCURRENTLY — SHARE UPDATE EXCLUSIVE (briefly, then ACCESS EXCLUSIVE)
  if (upper.includes('DROP INDEX') && upper.includes('CONCURRENTLY')) {
    return 'ACCESS EXCLUSIVE';
  }

  // DROP INDEX — ACCESS EXCLUSIVE
  if (upper.startsWith('DROP INDEX')) {
    return 'ACCESS EXCLUSIVE';
  }

  // ALTER TABLE — ACCESS EXCLUSIVE (most forms)
  if (upper.startsWith('ALTER TABLE')) {
    // Some ALTER TABLE forms take weaker locks
    if (upper.includes('VALIDATE CONSTRAINT')) {
      return 'SHARE UPDATE EXCLUSIVE';
    }
    if (upper.includes('ADD CONSTRAINT') && upper.includes('NOT VALID')) {
      return 'SHARE UPDATE EXCLUSIVE';
    }
    if (upper.includes('SET STATISTICS')) {
      return 'SHARE UPDATE EXCLUSIVE';
    }
    return 'ACCESS EXCLUSIVE';
  }

  // DROP TABLE — ACCESS EXCLUSIVE
  if (upper.startsWith('DROP TABLE')) {
    return 'ACCESS EXCLUSIVE';
  }

  // TRUNCATE — ACCESS EXCLUSIVE
  if (upper.startsWith('TRUNCATE')) {
    return 'ACCESS EXCLUSIVE';
  }

  // VACUUM FULL — ACCESS EXCLUSIVE
  if (upper.startsWith('VACUUM') && upper.includes('FULL')) {
    return 'ACCESS EXCLUSIVE';
  }

  // VACUUM (regular) — SHARE UPDATE EXCLUSIVE
  if (upper.startsWith('VACUUM')) {
    return 'SHARE UPDATE EXCLUSIVE';
  }

  // REINDEX — ACCESS EXCLUSIVE
  if (upper.startsWith('REINDEX')) {
    if (upper.includes('CONCURRENTLY')) {
      return 'SHARE UPDATE EXCLUSIVE';
    }
    return 'ACCESS EXCLUSIVE';
  }

  // REFRESH MATERIALIZED VIEW — ACCESS EXCLUSIVE (or EXCLUSIVE if CONCURRENTLY)
  if (upper.includes('REFRESH MATERIALIZED VIEW')) {
    if (upper.includes('CONCURRENTLY')) {
      return 'EXCLUSIVE';
    }
    return 'ACCESS EXCLUSIVE';
  }

  // CREATE TABLE — no conflict with existing tables (ShareLock on schema)
  if (upper.startsWith('CREATE TABLE')) {
    return 'ACCESS EXCLUSIVE';
  }

  // CREATE TRIGGER — SHARE ROW EXCLUSIVE
  if (upper.startsWith('CREATE TRIGGER') || upper.startsWith('CREATE OR REPLACE TRIGGER')) {
    return 'SHARE ROW EXCLUSIVE';
  }

  return null;
}

function mapLocksToOperations(blockedLocks: string[]): string[] {
  const ops = new Set<string>();

  for (const lock of blockedLocks) {
    const lockOps = LOCK_TO_OPERATIONS[lock];
    if (lockOps) {
      for (const op of lockOps) {
        ops.add(op);
      }
    }
  }

  return [...ops];
}

function estimateQueueTime(
  lockType: string,
  activeConnections: number,
  avgQueryDuration: number,
): string {
  const lockIndex = LOCK_HIERARCHY.indexOf(lockType as typeof LOCK_HIERARCHY[number]);

  if (lockIndex === -1) return 'unknown';

  // Higher lock types block more operations, creating longer queues.
  // The queue time is roughly proportional to:
  //   (blocked fraction of connections) * (avg query duration)
  //
  // ACCESS EXCLUSIVE blocks everything, so all connections queue up.
  // SHARE only blocks writes.

  const blockFraction = lockIndex / (LOCK_HIERARCHY.length - 1);
  const queuedConnections = Math.ceil(activeConnections * blockFraction);
  const estimatedMs = queuedConnections * avgQueryDuration;

  if (estimatedMs < 100) return '< 100ms';
  if (estimatedMs < 1000) return `~${Math.round(estimatedMs)}ms`;
  if (estimatedMs < 5000) return `~${(estimatedMs / 1000).toFixed(1)}s`;
  if (estimatedMs < 60000) return `~${Math.round(estimatedMs / 1000)}s`;
  return `~${Math.round(estimatedMs / 60000)}min`;
}

function generateRecommendations(
  upper: string,
  lockType: string,
  activeConnections: number,
): string[] {
  const recs: string[] = [];

  // ACCESS EXCLUSIVE recommendations
  if (lockType === 'ACCESS EXCLUSIVE') {
    recs.push('Set lock_timeout to prevent indefinite blocking (e.g., SET lock_timeout = \'5s\')');

    if (upper.startsWith('CREATE INDEX') && !upper.includes('CONCURRENTLY')) {
      recs.push('Use CREATE INDEX CONCURRENTLY to avoid blocking writes');
    }

    if (upper.startsWith('DROP INDEX') && !upper.includes('CONCURRENTLY')) {
      recs.push('Use DROP INDEX CONCURRENTLY to avoid blocking reads');
    }

    if (upper.includes('VACUUM FULL')) {
      recs.push('Consider pg_repack instead of VACUUM FULL for lower lock impact');
    }

    if (upper.startsWith('REINDEX') && !upper.includes('CONCURRENTLY')) {
      recs.push('Use REINDEX CONCURRENTLY (PG 12+) to avoid blocking queries');
    }

    if (activeConnections > 100) {
      recs.push(`High connection count (${activeConnections}) — consider running during low-traffic window`);
    }

    if (upper.startsWith('ALTER TABLE')) {
      recs.push('Consider breaking multi-step ALTER TABLE into separate statements with retry logic');
    }
  }

  // SHARE lock recommendations
  if (lockType === 'SHARE') {
    recs.push('This lock blocks INSERT/UPDATE/DELETE but allows SELECT');
    if (upper.startsWith('CREATE INDEX')) {
      recs.push('Use CREATE INDEX CONCURRENTLY to allow writes during index creation');
    }
  }

  // SHARE UPDATE EXCLUSIVE recommendations
  if (lockType === 'SHARE UPDATE EXCLUSIVE') {
    recs.push('This lock allows most operations — minimal impact on read/write traffic');
  }

  // General recommendations for high-connection environments
  if (activeConnections > 200 && lockType !== 'SHARE UPDATE EXCLUSIVE') {
    recs.push('With 200+ connections, use statement_timeout to prevent long-running DDL from snowballing');
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitStatements(sql: string): string[] {
  const results: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (const ch of sql) {
    if (inQuote) {
      current += ch;
      if (ch === quoteChar) inQuote = false;
      continue;
    }

    if (ch === "'" || ch === '"') {
      inQuote = true;
      quoteChar = ch;
      current += ch;
      continue;
    }

    if (ch === ';') {
      if (current.trim()) results.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) results.push(current);
  return results;
}
