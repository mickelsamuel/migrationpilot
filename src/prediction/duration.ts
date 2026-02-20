/**
 * Migration duration prediction.
 *
 * Estimates how long a migration will take based on the operation type
 * and optional table statistics (row count, size, index count). Uses
 * empirical heuristics derived from common PostgreSQL workloads.
 *
 * All estimates are conservative (worst-case) to help teams plan
 * maintenance windows appropriately.
 */

export interface DurationEstimate {
  /** The original SQL statement. */
  statement: string;
  /** Classified operation type (e.g. "CREATE INDEX", "ALTER TABLE ADD COLUMN"). */
  operation: string;
  /** Human-readable estimated duration (e.g. "< 1s", "1-5s", "5-15min"). */
  estimatedDuration: string;
  /** Confidence level of the estimate. */
  confidence: 'high' | 'medium' | 'low';
  /** Factors that influenced the estimate. */
  factors: string[];
}

interface TableStats {
  /** Number of rows in the table. */
  rowCount: number;
  /** Table size in bytes (including TOAST). */
  sizeBytes: number;
  /** Number of existing indexes on the table. */
  indexCount: number;
}

/**
 * Predict the duration of each DDL statement in the provided SQL.
 *
 * When `tableStats` are provided, estimates are calibrated to the actual
 * table size. Without stats, estimates are based on general heuristics
 * and confidence is lower.
 *
 * @param sql - SQL containing one or more DDL statements.
 * @param tableStats - Optional table statistics for more accurate estimates.
 * @returns Array of duration estimates, one per detected DDL statement.
 */
export function predictDuration(
  sql: string,
  tableStats?: TableStats,
): DurationEstimate[] {
  const statements = splitStatements(sql);
  const estimates: DurationEstimate[] = [];

  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;

    const estimate = estimateStatement(trimmed, tableStats);
    if (estimate) {
      estimates.push(estimate);
    }
  }

  return estimates;
}

// ---------------------------------------------------------------------------
// Statement classification and estimation
// ---------------------------------------------------------------------------

function estimateStatement(
  sql: string,
  stats?: TableStats,
): DurationEstimate | null {
  const upper = sql.toUpperCase().replace(/\s+/g, ' ').trim();

  // CREATE INDEX
  if (upper.startsWith('CREATE INDEX') || upper.startsWith('CREATE UNIQUE INDEX')) {
    return estimateCreateIndex(sql, upper, stats);
  }

  // ALTER TABLE
  if (upper.startsWith('ALTER TABLE')) {
    return estimateAlterTable(sql, upper, stats);
  }

  // DROP INDEX
  if (upper.startsWith('DROP INDEX')) {
    return estimateDropIndex(sql, upper);
  }

  // DROP TABLE
  if (upper.startsWith('DROP TABLE')) {
    return estimateDropTable(sql);
  }

  // CREATE TABLE
  if (upper.startsWith('CREATE TABLE')) {
    return estimateCreateTable(sql);
  }

  // VACUUM
  if (upper.startsWith('VACUUM')) {
    return estimateVacuum(sql, upper, stats);
  }

  // REINDEX
  if (upper.startsWith('REINDEX')) {
    return estimateReindex(sql, upper, stats);
  }

  // TRUNCATE
  if (upper.startsWith('TRUNCATE')) {
    return estimateTruncate(sql);
  }

  // CREATE SEQUENCE, DROP SEQUENCE, etc. — instant
  if (upper.startsWith('CREATE SEQUENCE') || upper.startsWith('DROP SEQUENCE')) {
    return {
      statement: sql,
      operation: upper.startsWith('CREATE') ? 'CREATE SEQUENCE' : 'DROP SEQUENCE',
      estimatedDuration: '< 1s',
      confidence: 'high',
      factors: ['Metadata-only operation'],
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Per-operation estimators
// ---------------------------------------------------------------------------

function estimateCreateIndex(
  sql: string,
  upper: string,
  stats?: TableStats,
): DurationEstimate {
  const concurrent = upper.includes('CONCURRENTLY');
  const unique = upper.includes('UNIQUE');
  const operation = `CREATE${unique ? ' UNIQUE' : ''} INDEX${concurrent ? ' CONCURRENTLY' : ''}`;
  const factors: string[] = [];

  if (concurrent) {
    factors.push('CONCURRENTLY adds ~2x overhead (two table scans)');
  }

  if (!stats) {
    factors.push('No table stats provided — estimate based on general heuristics');
    return {
      statement: sql,
      operation,
      estimatedDuration: concurrent ? '1s-5min' : '< 1s-2min',
      confidence: 'low',
      factors,
    };
  }

  const millions = stats.rowCount / 1_000_000;
  factors.push(`Table has ${formatRowCount(stats.rowCount)} rows`);

  if (stats.sizeBytes > 0) {
    factors.push(`Table size: ${formatBytes(stats.sizeBytes)}`);
  }

  // ~1s per million rows, CONCURRENTLY doubles it
  const baseSeconds = Math.max(0.1, millions * 1);
  const adjustedSeconds = concurrent ? baseSeconds * 2 : baseSeconds;

  // Additional indexes slow down creation
  if (stats.indexCount > 3) {
    factors.push(`${stats.indexCount} existing indexes may cause I/O contention`);
  }

  return {
    statement: sql,
    operation,
    estimatedDuration: formatDuration(adjustedSeconds),
    confidence: stats.rowCount > 0 ? 'medium' : 'high',
    factors,
  };
}

function estimateAlterTable(
  sql: string,
  upper: string,
  stats?: TableStats,
): DurationEstimate {
  const factors: string[] = [];

  // ADD COLUMN with no default — instant (PG 11+)
  if (upper.includes('ADD COLUMN') || (upper.includes('ADD') && !upper.includes('ADD CONSTRAINT'))) {
    const hasDefault = upper.includes('DEFAULT');
    const hasNotNull = upper.includes('NOT NULL');

    if (!hasDefault && !hasNotNull) {
      factors.push('ADD COLUMN without DEFAULT is metadata-only on PG 11+');
      return {
        statement: sql,
        operation: 'ALTER TABLE ADD COLUMN',
        estimatedDuration: '< 1s',
        confidence: 'high',
        factors,
      };
    }

    if (hasDefault && !hasNotNull) {
      factors.push('ADD COLUMN with DEFAULT is metadata-only on PG 11+');
      factors.push('On PG < 11, requires full table rewrite');
      if (stats) {
        factors.push(`Table has ${formatRowCount(stats.rowCount)} rows`);
        const millions = stats.rowCount / 1_000_000;
        const seconds = millions * 10; // ~10s per million on PG < 11
        return {
          statement: sql,
          operation: 'ALTER TABLE ADD COLUMN (with DEFAULT)',
          estimatedDuration: `< 1s (PG 11+) / ${formatDuration(seconds)} (PG < 11)`,
          confidence: 'medium',
          factors,
        };
      }
      return {
        statement: sql,
        operation: 'ALTER TABLE ADD COLUMN (with DEFAULT)',
        estimatedDuration: '< 1s (PG 11+) / varies (PG < 11)',
        confidence: 'low',
        factors,
      };
    }

    if (hasNotNull && hasDefault) {
      factors.push('ADD COLUMN with NOT NULL + DEFAULT requires ACCESS EXCLUSIVE lock');
      factors.push('Metadata-only on PG 11+, table rewrite on PG < 11');
      return {
        statement: sql,
        operation: 'ALTER TABLE ADD COLUMN (NOT NULL + DEFAULT)',
        estimatedDuration: '< 1s (PG 11+) / varies (PG < 11)',
        confidence: 'medium',
        factors,
      };
    }
  }

  // ALTER COLUMN TYPE — full table rewrite
  if (upper.includes('TYPE') && (upper.includes('ALTER COLUMN') || upper.includes('ALTER '))) {
    factors.push('Changing column type requires full table rewrite');
    if (stats) {
      factors.push(`Table has ${formatRowCount(stats.rowCount)} rows`);
      const millions = stats.rowCount / 1_000_000;
      const seconds = Math.max(1, millions * 10);
      return {
        statement: sql,
        operation: 'ALTER TABLE ALTER COLUMN TYPE',
        estimatedDuration: formatDuration(seconds),
        confidence: 'medium',
        factors,
      };
    }
    return {
      statement: sql,
      operation: 'ALTER TABLE ALTER COLUMN TYPE',
      estimatedDuration: '1s-1h+',
      confidence: 'low',
      factors,
    };
  }

  // SET NOT NULL — scan required on PG < 12
  if (upper.includes('SET NOT NULL')) {
    factors.push('SET NOT NULL requires full table scan to validate on PG < 12');
    factors.push('On PG 12+, can be done instantly with pre-existing CHECK constraint');
    if (stats) {
      factors.push(`Table has ${formatRowCount(stats.rowCount)} rows`);
      const millions = stats.rowCount / 1_000_000;
      const seconds = Math.max(0.5, millions * 5);
      return {
        statement: sql,
        operation: 'ALTER TABLE SET NOT NULL',
        estimatedDuration: formatDuration(seconds),
        confidence: 'medium',
        factors,
      };
    }
    return {
      statement: sql,
      operation: 'ALTER TABLE SET NOT NULL',
      estimatedDuration: '< 1s-5min',
      confidence: 'low',
      factors,
    };
  }

  // DROP COLUMN — instant metadata change
  if (upper.includes('DROP COLUMN') || upper.includes('DROP ')) {
    factors.push('DROP COLUMN is a metadata-only operation (column is hidden, not removed)');
    return {
      statement: sql,
      operation: 'ALTER TABLE DROP COLUMN',
      estimatedDuration: '< 1s',
      confidence: 'high',
      factors,
    };
  }

  // ADD CONSTRAINT
  if (upper.includes('ADD CONSTRAINT')) {
    if (upper.includes('NOT VALID')) {
      factors.push('NOT VALID skips validation — metadata-only');
      return {
        statement: sql,
        operation: 'ALTER TABLE ADD CONSTRAINT (NOT VALID)',
        estimatedDuration: '< 1s',
        confidence: 'high',
        factors,
      };
    }

    factors.push('Adding a validated constraint requires full table scan');
    if (stats) {
      factors.push(`Table has ${formatRowCount(stats.rowCount)} rows`);
      const millions = stats.rowCount / 1_000_000;
      const seconds = Math.max(0.5, millions * 3);
      return {
        statement: sql,
        operation: 'ALTER TABLE ADD CONSTRAINT',
        estimatedDuration: formatDuration(seconds),
        confidence: 'medium',
        factors,
      };
    }
    return {
      statement: sql,
      operation: 'ALTER TABLE ADD CONSTRAINT',
      estimatedDuration: '< 1s-5min',
      confidence: 'low',
      factors,
    };
  }

  // DROP CONSTRAINT — instant
  if (upper.includes('DROP CONSTRAINT')) {
    factors.push('Dropping a constraint is metadata-only');
    return {
      statement: sql,
      operation: 'ALTER TABLE DROP CONSTRAINT',
      estimatedDuration: '< 1s',
      confidence: 'high',
      factors,
    };
  }

  // Default ALTER TABLE
  return {
    statement: sql,
    operation: 'ALTER TABLE',
    estimatedDuration: '< 1s-varies',
    confidence: 'low',
    factors: ['Unrecognized ALTER TABLE variant — manual review recommended'],
  };
}

function estimateDropIndex(sql: string, upper: string): DurationEstimate {
  const concurrent = upper.includes('CONCURRENTLY');

  if (concurrent) {
    return {
      statement: sql,
      operation: 'DROP INDEX CONCURRENTLY',
      estimatedDuration: '1-5s',
      confidence: 'medium',
      factors: ['CONCURRENTLY avoids ACCESS EXCLUSIVE lock but takes longer'],
    };
  }

  return {
    statement: sql,
    operation: 'DROP INDEX',
    estimatedDuration: '< 1s',
    confidence: 'high',
    factors: ['Metadata-only operation under ACCESS EXCLUSIVE lock'],
  };
}

function estimateDropTable(sql: string): DurationEstimate {
  return {
    statement: sql,
    operation: 'DROP TABLE',
    estimatedDuration: '< 1s',
    confidence: 'high',
    factors: ['Metadata-only operation; storage is reclaimed asynchronously'],
  };
}

function estimateCreateTable(sql: string): DurationEstimate {
  return {
    statement: sql,
    operation: 'CREATE TABLE',
    estimatedDuration: '< 1s',
    confidence: 'high',
    factors: ['Creating an empty table is a metadata-only operation'],
  };
}

function estimateVacuum(
  sql: string,
  upper: string,
  stats?: TableStats,
): DurationEstimate {
  const isFull = upper.includes('FULL');
  const factors: string[] = [];

  if (isFull) {
    factors.push('VACUUM FULL rewrites the entire table and requires ACCESS EXCLUSIVE lock');
    if (stats) {
      factors.push(`Table has ${formatRowCount(stats.rowCount)} rows`);
      const millions = stats.rowCount / 1_000_000;
      const seconds = Math.max(1, millions * 30);
      return {
        statement: sql,
        operation: 'VACUUM FULL',
        estimatedDuration: formatDuration(seconds),
        confidence: 'medium',
        factors,
      };
    }
    return {
      statement: sql,
      operation: 'VACUUM FULL',
      estimatedDuration: '1s-1h+',
      confidence: 'low',
      factors,
    };
  }

  factors.push('Regular VACUUM does not hold exclusive locks');
  return {
    statement: sql,
    operation: 'VACUUM',
    estimatedDuration: '1-30s',
    confidence: 'low',
    factors,
  };
}

function estimateReindex(
  sql: string,
  upper: string,
  stats?: TableStats,
): DurationEstimate {
  const concurrent = upper.includes('CONCURRENTLY');
  const factors: string[] = [];

  if (concurrent) {
    factors.push('CONCURRENTLY avoids locking but takes ~2x longer');
  }

  if (stats) {
    factors.push(`Table has ${formatRowCount(stats.rowCount)} rows`);
    const millions = stats.rowCount / 1_000_000;
    const seconds = Math.max(0.5, millions * (concurrent ? 2 : 1));
    return {
      statement: sql,
      operation: `REINDEX${concurrent ? ' CONCURRENTLY' : ''}`,
      estimatedDuration: formatDuration(seconds),
      confidence: 'medium',
      factors,
    };
  }

  return {
    statement: sql,
    operation: `REINDEX${concurrent ? ' CONCURRENTLY' : ''}`,
    estimatedDuration: concurrent ? '1s-5min' : '< 1s-2min',
    confidence: 'low',
    factors: [...factors, 'No table stats — estimate is approximate'],
  };
}

function estimateTruncate(sql: string): DurationEstimate {
  return {
    statement: sql,
    operation: 'TRUNCATE',
    estimatedDuration: '< 1s',
    confidence: 'high',
    factors: ['TRUNCATE is near-instant but requires ACCESS EXCLUSIVE lock'],
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
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

/**
 * Format seconds into a human-readable duration range.
 */
function formatDuration(seconds: number): string {
  if (seconds < 1) return '< 1s';
  if (seconds < 5) return '1-5s';
  if (seconds < 30) return '5-30s';
  if (seconds < 120) return '30s-2min';
  if (seconds < 900) return '2-15min';
  if (seconds < 3600) return '15min-1h';
  return '1h+';
}

function formatRowCount(count: number): string {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
