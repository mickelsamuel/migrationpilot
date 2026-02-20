/**
 * Sequence overflow monitoring.
 *
 * Detects PostgreSQL sequences at risk of overflow by querying pg_sequences
 * for current values and comparing against maximum capacity. Also provides
 * static analysis of CREATE SEQUENCE statements to flag non-bigint types.
 *
 * SAFETY: Only reads from pg_sequences. Never modifies data.
 */

import pg from 'pg';

const { Pool } = pg;

export interface SequenceInfo {
  /** Sequence name. */
  name: string;
  /** Sequence data type. */
  dataType: 'smallint' | 'integer' | 'bigint';
  /** Current value of the sequence. */
  currentValue: bigint;
  /** Maximum value the sequence can reach. */
  maxValue: bigint;
  /** Percentage of the sequence capacity used (0-100). */
  percentUsed: number;
  /** Estimated days until overflow, or null if insufficient data. */
  estimatedDaysLeft: number | null;
}

/**
 * Check all sequences in a PostgreSQL database for overflow risk.
 *
 * Queries pg_sequences for current values, calculates percentage used,
 * and estimates days until overflow based on recent increment patterns
 * observed from pg_stat_user_tables.
 *
 * @param dbUrl - PostgreSQL connection string.
 * @returns Array of sequence info sorted by percent used (highest first).
 */
export async function checkSequences(dbUrl: string): Promise<SequenceInfo[]> {
  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
    statement_timeout: 10000,
  });

  try {
    // Fetch all sequences with their current state
    const seqResult = await pool.query<{
      sequencename: string;
      data_type: string;
      last_value: string | null;
      max_value: string;
      increment_by: string;
    }>(`
      SELECT
        sequencename,
        data_type,
        last_value::text,
        max_value::text,
        increment_by::text
      FROM pg_sequences
      WHERE schemaname = 'public'
    `);

    // Fetch table row insertion rates for estimation
    const statsResult = await pool.query<{
      relname: string;
      n_tup_ins: string;
      stats_reset: string | null;
    }>(`
      SELECT
        relname,
        n_tup_ins::text,
        stats_reset::text
      FROM pg_stat_user_tables
      WHERE schemaname = 'public' AND n_tup_ins > 0
    `);

    // Build a map of table -> daily insert rate
    const insertRates = new Map<string, number>();
    for (const row of statsResult.rows) {
      if (row.stats_reset) {
        const resetDate = new Date(row.stats_reset);
        const now = new Date();
        const daysSinceReset = Math.max(1, (now.getTime() - resetDate.getTime()) / (1000 * 60 * 60 * 24));
        const dailyRate = Number(row.n_tup_ins) / daysSinceReset;
        insertRates.set(row.relname, dailyRate);
      }
    }

    const sequences: SequenceInfo[] = [];

    for (const row of seqResult.rows) {
      const dataType = normalizeDataType(row.data_type);
      const currentValue = row.last_value ? BigInt(row.last_value) : 0n;
      const maxValue = BigInt(row.max_value);
      const incrementBy = BigInt(row.increment_by);

      const percentUsed = maxValue > 0n
        ? Number((currentValue * 10000n / maxValue)) / 100
        : 0;

      // Estimate days left based on associated table insert rates
      let estimatedDaysLeft: number | null = null;

      // Try to find an associated table by naming convention (table_column_seq)
      const seqName = row.sequencename;
      const tableName = guessTableFromSequence(seqName);
      const dailyRate = tableName ? insertRates.get(tableName) : undefined;

      if (dailyRate && dailyRate > 0 && incrementBy > 0n) {
        const remaining = Number(maxValue - currentValue);
        const dailyIncrement = dailyRate * Number(incrementBy);
        estimatedDaysLeft = Math.round(remaining / dailyIncrement);
      }

      sequences.push({
        name: seqName,
        dataType,
        currentValue,
        maxValue,
        percentUsed: Math.round(percentUsed * 100) / 100,
        estimatedDaysLeft,
      });
    }

    // Sort by percent used, highest first
    sequences.sort((a, b) => b.percentUsed - a.percentUsed);

    return sequences;
  } finally {
    await pool.end();
  }
}

/**
 * Statically analyze CREATE SEQUENCE statements for overflow risk.
 *
 * Flags sequences declared as `integer` or `smallint` (instead of `bigint`)
 * as higher risk, since they have significantly lower maximum values.
 *
 * @param sql - SQL containing CREATE SEQUENCE statements.
 * @returns Array of sequence risk assessments.
 */
export function analyzeSequenceFromSql(
  sql: string,
): Array<{ name: string; dataType: string; risk: 'high' | 'medium' | 'low' }> {
  const results: Array<{ name: string; dataType: string; risk: 'high' | 'medium' | 'low' }> = [];

  const seqRegex =
    /CREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)([^;]*)/gi;

  let match: RegExpExecArray | null;
  while ((match = seqRegex.exec(sql)) !== null) {
    const name = match[2] ?? match[1] ?? '';
    const body = match[3] ?? '';
    const upper = body.toUpperCase();

    let dataType = 'bigint'; // default
    if (upper.includes('AS SMALLINT')) {
      dataType = 'smallint';
    } else if (upper.includes('AS INTEGER') || upper.includes('AS INT ') || upper.includes('AS INT;')) {
      dataType = 'integer';
    }

    // Also check for SERIAL-style implicit sequences
    let risk: 'high' | 'medium' | 'low';
    if (dataType === 'smallint') {
      risk = 'high';
    } else if (dataType === 'integer') {
      risk = 'medium';
    } else {
      risk = 'low';
    }

    if (name) {
      results.push({ name, dataType, risk });
    }
  }

  // Also detect implicit sequences from SERIAL/BIGSERIAL columns
  const serialRegex =
    /(\w+)\s+(SERIAL|SMALLSERIAL|BIGSERIAL)\b/gi;

  while ((match = serialRegex.exec(sql)) !== null) {
    const colName = match[1] ?? '';
    const serialType = (match[2] ?? '').toUpperCase();

    let dataType: string;
    let risk: 'high' | 'medium' | 'low';

    if (serialType === 'SMALLSERIAL') {
      dataType = 'smallint';
      risk = 'high';
    } else if (serialType === 'SERIAL') {
      dataType = 'integer';
      risk = 'medium';
    } else {
      dataType = 'bigint';
      risk = 'low';
    }

    results.push({
      name: `${colName}_seq (implicit)`,
      dataType,
      risk,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeDataType(dt: string): 'smallint' | 'integer' | 'bigint' {
  const lower = dt.toLowerCase();
  if (lower.includes('smallint') || lower === 'int2') return 'smallint';
  if (lower.includes('integer') || lower === 'int4' || lower === 'int') return 'integer';
  return 'bigint';
}

/**
 * Guess the table name from a sequence name using common PostgreSQL
 * naming conventions (e.g., "users_id_seq" -> "users").
 */
function guessTableFromSequence(seqName: string): string | null {
  // Common patterns:
  // - table_column_seq
  // - table_id_seq
  const match = seqName.match(/^(.+?)_(?:id_)?seq$/);
  if (match?.[1]) return match[1];

  // Try removing just _seq suffix
  if (seqName.endsWith('_seq')) {
    const base = seqName.slice(0, -4);
    const lastUnderscore = base.lastIndexOf('_');
    if (lastUnderscore > 0) {
      return base.slice(0, lastUnderscore);
    }
    return base;
  }

  return null;
}
