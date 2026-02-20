/**
 * Trigger cascade analysis.
 *
 * Analyzes SQL for trigger cascade effects. Given a table DDL operation,
 * identifies triggers that might fire and cascading effects across tables.
 *
 * When a database URL is provided, queries pg_trigger for real trigger
 * definitions. Otherwise, performs static analysis by parsing CREATE TRIGGER
 * statements from the SQL to infer cascade chains.
 *
 * SAFETY: Only reads from pg_catalog. Never modifies data.
 */

import pg from 'pg';
import { parse as pgParse } from 'libpg-query';

const { Pool } = pg;

/** Maximum cascade depth to prevent infinite recursion. */
const MAX_DEPTH = 10;

export interface TriggerInfo {
  /** Trigger name. */
  name: string;
  /** Trigger event (INSERT, UPDATE, DELETE, TRUNCATE). */
  event: string;
  /** Trigger timing (BEFORE, AFTER, INSTEAD OF). */
  timing: string;
  /** Table the trigger acts upon or references. */
  targetTable: string;
}

export interface CascadeResult {
  /** The table being modified by the DDL operation. */
  table: string;
  /** Triggers that may fire on this table. */
  triggers: TriggerInfo[];
  /** Tables that may be affected through cascading trigger chains. */
  cascadingTables: string[];
  /** Depth of the deepest cascade chain discovered. */
  depth: number;
  /** Human-readable warning about cascade impact. */
  warning: string;
}

/**
 * Analyze SQL for trigger cascade effects.
 *
 * If `dbUrl` is provided, connects to the database to discover real triggers
 * via pg_trigger. Otherwise, falls back to static analysis of CREATE TRIGGER
 * statements found in the SQL.
 */
export async function analyzeCascade(sql: string, dbUrl?: string): Promise<CascadeResult[]> {
  const affectedTables = await extractAffectedTables(sql);

  if (affectedTables.length === 0) {
    return [];
  }

  if (dbUrl) {
    return analyzeCascadeFromDb(affectedTables, dbUrl);
  }

  return analyzeCascadeFromSql(sql, affectedTables);
}

// ---------------------------------------------------------------------------
// Database-backed analysis
// ---------------------------------------------------------------------------

async function analyzeCascadeFromDb(
  tables: string[],
  dbUrl: string,
): Promise<CascadeResult[]> {
  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
    statement_timeout: 10000,
  });

  try {
    const allTriggers = await fetchTriggers(pool);
    const results: CascadeResult[] = [];

    for (const table of tables) {
      const visited = new Set<string>();
      const cascading: string[] = [];
      const directTriggers = allTriggers.filter(t => t.targetTable === table);

      walkCascade(table, allTriggers, visited, cascading, 0);

      const depth = cascading.length > 0 ? Math.min(visited.size, MAX_DEPTH) : 0;
      const warning = buildWarning(table, directTriggers, cascading, depth);

      results.push({
        table,
        triggers: directTriggers,
        cascadingTables: cascading,
        depth,
        warning,
      });
    }

    return results;
  } finally {
    await pool.end();
  }
}

async function fetchTriggers(pool: pg.Pool): Promise<TriggerInfo[]> {
  const result = await pool.query<{
    tgname: string;
    event: string;
    timing: string;
    table_name: string;
  }>(`
    SELECT
      t.tgname,
      CASE
        WHEN t.tgtype & 4 > 0 THEN 'INSERT'
        WHEN t.tgtype & 8 > 0 THEN 'DELETE'
        WHEN t.tgtype & 16 > 0 THEN 'UPDATE'
        WHEN t.tgtype & 32 > 0 THEN 'TRUNCATE'
        ELSE 'UNKNOWN'
      END AS event,
      CASE
        WHEN t.tgtype & 2 > 0 THEN 'BEFORE'
        WHEN t.tgtype & 66 > 0 THEN 'INSTEAD OF'
        ELSE 'AFTER'
      END AS timing,
      c.relname AS table_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal
  `);

  return result.rows.map(r => ({
    name: r.tgname,
    event: r.event,
    timing: r.timing,
    targetTable: r.table_name,
  }));
}

function walkCascade(
  table: string,
  triggers: TriggerInfo[],
  visited: Set<string>,
  cascading: string[],
  depth: number,
): void {
  if (depth >= MAX_DEPTH) return;
  if (visited.has(table)) return;
  visited.add(table);

  const tableTriggers = triggers.filter(t => t.targetTable === table);

  for (const trigger of tableTriggers) {
    // A trigger on table X that references table Y creates a cascade edge.
    // In DB mode we check if the trigger function body references other tables.
    // Since we can't reliably parse plpgsql here, we record the trigger's own
    // target if it differs from the current walk table (for triggers that were
    // defined with a different relname context).
    const referenced = triggers
      .filter(t => t.name === trigger.name && t.targetTable !== table)
      .map(t => t.targetTable);

    for (const ref of referenced) {
      if (!visited.has(ref)) {
        cascading.push(ref);
        walkCascade(ref, triggers, visited, cascading, depth + 1);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Static SQL analysis (no DB connection)
// ---------------------------------------------------------------------------

async function analyzeCascadeFromSql(
  sql: string,
  affectedTables: string[],
): Promise<CascadeResult[]> {
  const triggers = extractTriggersFromSql(sql);
  const results: CascadeResult[] = [];

  for (const table of affectedTables) {
    const directTriggers = triggers.filter(t => t.targetTable === table);
    const cascading: string[] = [];
    const visited = new Set<string>();

    walkStaticCascade(table, triggers, visited, cascading, 0);

    const depth = cascading.length > 0 ? Math.min(visited.size, MAX_DEPTH) : 0;
    const warning = buildWarning(table, directTriggers, cascading, depth);

    results.push({
      table,
      triggers: directTriggers,
      cascadingTables: cascading,
      depth,
      warning,
    });
  }

  return results;
}

function walkStaticCascade(
  table: string,
  triggers: TriggerInfo[],
  visited: Set<string>,
  cascading: string[],
  depth: number,
): void {
  if (depth >= MAX_DEPTH) return;
  if (visited.has(table)) return;
  visited.add(table);

  const tableTriggers = triggers.filter(t => t.targetTable === table);

  if (tableTriggers.length === 0) return;

  // In static mode, look for other triggers implying cross-table cascade chains.
  const related = triggers.filter(
    t => t.targetTable !== table && !visited.has(t.targetTable),
  );

  for (const rel of related) {
    cascading.push(rel.targetTable);
    walkStaticCascade(rel.targetTable, triggers, visited, cascading, depth + 1);
  }
}

/**
 * Parse CREATE TRIGGER statements from raw SQL to extract trigger metadata.
 */
function extractTriggersFromSql(sql: string): TriggerInfo[] {
  const triggers: TriggerInfo[] = [];
  const triggerRegex =
    /CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+(\w+)\s+(BEFORE|AFTER|INSTEAD\s+OF)\s+(INSERT|UPDATE|DELETE|TRUNCATE)(?:\s+OR\s+(?:INSERT|UPDATE|DELETE|TRUNCATE))*\s+ON\s+(?:(\w+)\.)?(\w+)/gi;

  let match: RegExpExecArray | null;
  while ((match = triggerRegex.exec(sql)) !== null) {
    const name = match[1] ?? '';
    const timing = (match[2] ?? '').replace(/\s+/g, ' ').toUpperCase();
    const event = (match[3] ?? '').toUpperCase();
    const targetTable = match[5] ?? match[4] ?? '';

    if (name && targetTable) {
      triggers.push({ name, event, timing, targetTable });
    }
  }

  return triggers;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Extract table names affected by DDL operations in the SQL.
 */
async function extractAffectedTables(sql: string): Promise<string[]> {
  const tables = new Set<string>();

  try {
    const result = await pgParse(sql);
    for (const s of result.stmts) {
      const stmt = s.stmt as Record<string, unknown>;
      const tableName = extractTableFromStmt(stmt);
      if (tableName) tables.add(tableName);
    }
  } catch {
    // Fall back to regex extraction if parsing fails
    const tableRegex =
      /(?:ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE)\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:(\w+)\.)?(\w+)/gi;

    let match: RegExpExecArray | null;
    while ((match = tableRegex.exec(sql)) !== null) {
      const name = match[2] ?? match[1];
      if (name) tables.add(name);
    }
  }

  return [...tables];
}

function extractTableFromStmt(stmt: Record<string, unknown>): string | null {
  for (const key of ['AlterTableStmt', 'CreateStmt', 'DropStmt']) {
    if (key in stmt && stmt[key] != null) {
      const node = stmt[key] as { relation?: { relname?: string } };
      if (node.relation?.relname) return node.relation.relname;
    }
  }

  if ('TruncateStmt' in stmt && stmt.TruncateStmt != null) {
    const trunc = stmt.TruncateStmt as {
      relations?: Array<{ RangeVar?: { relname?: string } }>;
    };
    const first = trunc.relations?.[0];
    if (first?.RangeVar?.relname) return first.RangeVar.relname;
  }

  return null;
}

function buildWarning(
  table: string,
  triggers: TriggerInfo[],
  cascading: string[],
  depth: number,
): string {
  if (triggers.length === 0) {
    return `No triggers found on table "${table}".`;
  }

  const parts: string[] = [];
  parts.push(
    `Table "${table}" has ${triggers.length} trigger(s): ${triggers.map(t => t.name).join(', ')}.`,
  );

  if (cascading.length > 0) {
    parts.push(
      `Cascade chain reaches ${cascading.length} additional table(s): ${cascading.join(', ')} (depth: ${depth}).`,
    );
    parts.push(
      'DDL operations on this table may have side effects on cascading tables.',
    );
  }

  if (depth >= MAX_DEPTH) {
    parts.push(
      `WARNING: Cascade depth reached maximum limit (${MAX_DEPTH}). There may be deeper chains.`,
    );
  }

  return parts.join(' ');
}
