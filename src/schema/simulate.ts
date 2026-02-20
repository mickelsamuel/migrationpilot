/**
 * Schema state simulation.
 *
 * Simulates what the schema will look like after applying a sequence of
 * migration SQL statements, without actually running them against a database.
 *
 * Parses SQL using regex-based extraction and processes CREATE TABLE,
 * ALTER TABLE, CREATE INDEX, DROP TABLE, CREATE SEQUENCE, and other DDL
 * statements to build up a complete in-memory schema state.
 */

export interface ColumnState {
  /** Column name. */
  name: string;
  /** Column data type (e.g. "integer", "text", "varchar(255)"). */
  type: string;
  /** Whether the column allows NULL values. */
  nullable: boolean;
  /** Whether the column has a DEFAULT expression. */
  hasDefault: boolean;
}

export interface TableState {
  /** Table name. */
  name: string;
  /** Column definitions. */
  columns: ColumnState[];
  /** Schema name (e.g. "public"). */
  schema?: string;
}

export interface IndexState {
  /** Index name. */
  name: string;
  /** Table the index belongs to. */
  table: string;
  /** Columns included in the index. */
  columns: string[];
  /** Whether this is a unique index. */
  unique: boolean;
  /** Whether the index was created with CONCURRENTLY. */
  concurrent: boolean;
}

export interface ConstraintState {
  /** Constraint name. */
  name: string;
  /** Table the constraint belongs to. */
  table: string;
  /** Constraint type (PRIMARY KEY, UNIQUE, CHECK, FOREIGN KEY, EXCLUDE). */
  type: string;
  /** Columns involved in the constraint. */
  columns: string[];
}

export interface SequenceState {
  /** Sequence name. */
  name: string;
  /** Sequence data type (smallint, integer, bigint). */
  dataType: string;
  /** Table.column that owns this sequence, if any. */
  ownedBy?: string;
}

export interface SchemaState {
  /** All tables keyed by qualified name. */
  tables: Map<string, TableState>;
  /** All indexes keyed by name. */
  indexes: Map<string, IndexState>;
  /** All constraints keyed by name. */
  constraints: Map<string, ConstraintState>;
  /** All sequences keyed by name. */
  sequences: Map<string, SequenceState>;
}

/**
 * Simulate the schema state that results from applying a series of SQL
 * statements in order. Each statement is parsed and its effects are applied
 * to the in-memory schema.
 *
 * @param sqlStatements - Array of SQL strings to process in order.
 * @returns The resulting schema state.
 */
export function simulateSchema(sqlStatements: string[]): SchemaState {
  const state: SchemaState = {
    tables: new Map(),
    indexes: new Map(),
    constraints: new Map(),
    sequences: new Map(),
  };

  for (const sql of sqlStatements) {
    applyStatements(state, sql);
  }

  return state;
}

// ---------------------------------------------------------------------------
// Internal: apply parsed statements to state
// ---------------------------------------------------------------------------

function applyStatements(state: SchemaState, sql: string): void {
  let result: { stmts: Array<{ stmt: Record<string, unknown> }> };
  try {
    // pgParse returns a Promise, but we need synchronous behavior here.
    // We parse eagerly and store the result. Since this module is designed
    // for static analysis tooling where async is acceptable at the call site,
    // we fall back to regex-based parsing for synchronous usage.
    result = parseSqlSync(sql);
  } catch {
    // If parsing fails, silently skip the statement.
    return;
  }

  for (const s of result.stmts) {
    const stmt = s.stmt;
    applyStatement(state, stmt);
  }
}

/**
 * Synchronous SQL parse using regex-based extraction.
 * This avoids the async requirement of libpg-query while still providing
 * useful schema simulation for common DDL patterns.
 */
function parseSqlSync(sql: string): { stmts: Array<{ stmt: Record<string, unknown> }> } {
  const stmts: Array<{ stmt: Record<string, unknown> }> = [];

  // Split on semicolons, respecting basic quoting
  const statements = splitStatements(sql);

  for (const raw of statements) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const stmt = classifyStatement(trimmed);
    if (stmt) {
      stmts.push({ stmt });
    }
  }

  return { stmts };
}

function splitStatements(sql: string): string[] {
  const results: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inDollarQuote = false;
  let dollarTag = '';

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    const next = sql[i + 1];

    if (inDollarQuote) {
      current += ch;
      if (ch === '$' && sql.slice(i).startsWith(dollarTag)) {
        current += sql.slice(i + 1, i + dollarTag.length);
        i += dollarTag.length - 1;
        inDollarQuote = false;
      }
      continue;
    }

    if (ch === '$' && !inSingleQuote && !inDoubleQuote) {
      const tagMatch = sql.slice(i).match(/^(\$[^$]*\$)/);
      if (tagMatch?.[1]) {
        dollarTag = tagMatch[1];
        inDollarQuote = true;
        current += ch;
        continue;
      }
    }

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }

    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
      continue;
    }

    if (ch === '-' && next === '-' && !inSingleQuote && !inDoubleQuote) {
      const eol = sql.indexOf('\n', i);
      if (eol === -1) break;
      i = eol;
      continue;
    }

    if (ch === ';' && !inSingleQuote && !inDoubleQuote) {
      results.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) {
    results.push(current);
  }

  return results;
}

function classifyStatement(sql: string): Record<string, unknown> | null {
  const upper = sql.toUpperCase().replace(/\s+/g, ' ').trim();

  if (upper.startsWith('CREATE TABLE')) {
    return { _syntheticCreateTable: sql };
  }
  if (upper.startsWith('ALTER TABLE')) {
    return { _syntheticAlterTable: sql };
  }
  if (upper.startsWith('CREATE INDEX') || upper.startsWith('CREATE UNIQUE INDEX')) {
    return { _syntheticCreateIndex: sql };
  }
  if (upper.startsWith('DROP TABLE')) {
    return { _syntheticDropTable: sql };
  }
  if (upper.startsWith('DROP INDEX')) {
    return { _syntheticDropIndex: sql };
  }
  if (upper.startsWith('CREATE SEQUENCE')) {
    return { _syntheticCreateSequence: sql };
  }
  if (upper.startsWith('DROP SEQUENCE')) {
    return { _syntheticDropSequence: sql };
  }

  return null;
}

function applyStatement(state: SchemaState, stmt: Record<string, unknown>): void {
  if ('_syntheticCreateTable' in stmt) {
    applyCreateTable(state, stmt._syntheticCreateTable as string);
  } else if ('_syntheticAlterTable' in stmt) {
    applyAlterTable(state, stmt._syntheticAlterTable as string);
  } else if ('_syntheticCreateIndex' in stmt) {
    applyCreateIndex(state, stmt._syntheticCreateIndex as string);
  } else if ('_syntheticDropTable' in stmt) {
    applyDropTable(state, stmt._syntheticDropTable as string);
  } else if ('_syntheticDropIndex' in stmt) {
    applyDropIndex(state, stmt._syntheticDropIndex as string);
  } else if ('_syntheticCreateSequence' in stmt) {
    applyCreateSequence(state, stmt._syntheticCreateSequence as string);
  } else if ('_syntheticDropSequence' in stmt) {
    applyDropSequence(state, stmt._syntheticDropSequence as string);
  }
}

// ---------------------------------------------------------------------------
// CREATE TABLE
// ---------------------------------------------------------------------------

function applyCreateTable(state: SchemaState, sql: string): void {
  const nameMatch = sql.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)\s*\(/i,
  );
  if (!nameMatch) return;

  const schema = nameMatch[1];
  const tableName = nameMatch[2]!;
  const key = schema ? `${schema}.${tableName}` : tableName;

  // Extract column definitions from parenthesized block
  const parenStart = sql.indexOf('(');
  const parenEnd = findMatchingParen(sql, parenStart);
  if (parenStart === -1 || parenEnd === -1) return;

  const body = sql.slice(parenStart + 1, parenEnd);
  const columns = parseColumnDefinitions(body);
  const constraints = parseTableConstraints(body, tableName);

  state.tables.set(key, { name: tableName, columns, schema });

  for (const constraint of constraints) {
    state.constraints.set(constraint.name, constraint);
  }
}

function findMatchingParen(sql: string, start: number): number {
  if (start === -1) return -1;
  let depth = 0;
  let inQuote = false;
  let quoteChar = '';

  for (let i = start; i < sql.length; i++) {
    const ch = sql[i]!;

    if (inQuote) {
      if (ch === quoteChar) inQuote = false;
      continue;
    }

    if (ch === "'" || ch === '"') {
      inQuote = true;
      quoteChar = ch;
      continue;
    }

    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function parseColumnDefinitions(body: string): ColumnState[] {
  const columns: ColumnState[] = [];
  const parts = splitColumnDefs(body);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Skip table-level constraints
    const upperTrimmed = trimmed.toUpperCase();
    if (
      upperTrimmed.startsWith('PRIMARY KEY') ||
      upperTrimmed.startsWith('UNIQUE') ||
      upperTrimmed.startsWith('CHECK') ||
      upperTrimmed.startsWith('FOREIGN KEY') ||
      upperTrimmed.startsWith('EXCLUDE') ||
      upperTrimmed.startsWith('CONSTRAINT')
    ) {
      continue;
    }

    const colMatch = trimmed.match(/^"?(\w+)"?\s+(.+)/i);
    if (!colMatch) continue;

    const name = colMatch[1]!;
    const rest = colMatch[2]!;

    // Extract type (first word or words before constraints)
    const typeMatch = rest.match(
      /^((?:character\s+varying|double\s+precision|time(?:stamp)?\s+(?:with|without)\s+time\s+zone|\w+)(?:\s*\([^)]*\))?)/i,
    );
    const type = typeMatch ? typeMatch[1]!.trim() : rest.split(/\s/)[0] ?? 'unknown';

    const upperRest = rest.toUpperCase();
    const nullable = !upperRest.includes('NOT NULL');
    const hasDefault = upperRest.includes('DEFAULT');

    columns.push({ name, type, nullable, hasDefault });
  }

  return columns;
}

function splitColumnDefs(body: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  if (current.trim()) parts.push(current);
  return parts;
}

function parseTableConstraints(body: string, tableName: string): ConstraintState[] {
  const constraints: ConstraintState[] = [];
  const parts = splitColumnDefs(body);

  for (const part of parts) {
    const trimmed = part.trim();
    const upper = trimmed.toUpperCase();

    let constraintName = '';
    let workingStr = trimmed;

    // Extract explicit CONSTRAINT name
    const nameMatch = trimmed.match(/^CONSTRAINT\s+"?(\w+)"?\s+(.+)/i);
    if (nameMatch) {
      constraintName = nameMatch[1]!;
      workingStr = nameMatch[2]!;
    }

    const upperWork = workingStr.toUpperCase();

    if (upperWork.startsWith('PRIMARY KEY')) {
      const cols = extractParenColumns(workingStr);
      if (!constraintName) constraintName = `${tableName}_pkey`;
      constraints.push({ name: constraintName, table: tableName, type: 'PRIMARY KEY', columns: cols });
    } else if (upperWork.startsWith('UNIQUE')) {
      const cols = extractParenColumns(workingStr);
      if (!constraintName) constraintName = `${tableName}_${cols.join('_')}_key`;
      constraints.push({ name: constraintName, table: tableName, type: 'UNIQUE', columns: cols });
    } else if (upperWork.startsWith('FOREIGN KEY')) {
      const cols = extractParenColumns(workingStr);
      if (!constraintName) constraintName = `${tableName}_${cols.join('_')}_fkey`;
      constraints.push({ name: constraintName, table: tableName, type: 'FOREIGN KEY', columns: cols });
    } else if (upperWork.startsWith('CHECK')) {
      if (!constraintName) constraintName = `${tableName}_check`;
      constraints.push({ name: constraintName, table: tableName, type: 'CHECK', columns: [] });
    }

    // Inline PRIMARY KEY / UNIQUE on column definitions
    if (!upper.startsWith('PRIMARY KEY') && !upper.startsWith('UNIQUE') && !upper.startsWith('CONSTRAINT')) {
      const colMatch = trimmed.match(/^"?(\w+)"?\s+/i);
      if (colMatch) {
        const colName = colMatch[1]!;
        if (upper.includes('PRIMARY KEY')) {
          const pkName = `${tableName}_pkey`;
          constraints.push({ name: pkName, table: tableName, type: 'PRIMARY KEY', columns: [colName] });
        }
        if (upper.includes(' UNIQUE') || upper.startsWith('UNIQUE')) {
          const uqName = `${tableName}_${colName}_key`;
          constraints.push({ name: uqName, table: tableName, type: 'UNIQUE', columns: [colName] });
        }
      }
    }
  }

  return constraints;
}

function extractParenColumns(str: string): string[] {
  const match = str.match(/\(([^)]+)\)/);
  if (!match) return [];
  return match[1]!.split(',').map(c => c.trim().replace(/"/g, '')).filter(Boolean);
}

// ---------------------------------------------------------------------------
// ALTER TABLE
// ---------------------------------------------------------------------------

function applyAlterTable(state: SchemaState, sql: string): void {
  const nameMatch = sql.match(
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:(\w+)\.)?(\w+)/i,
  );
  if (!nameMatch) return;

  const schema = nameMatch[1];
  const tableName = nameMatch[2]!;
  const key = schema ? `${schema}.${tableName}` : tableName;

  const table = state.tables.get(key);
  if (!table) return;

  const upper = sql.toUpperCase();

  // ADD COLUMN
  const addColMatch = sql.match(
    /ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s+(\S+)/i,
  );
  if (addColMatch && upper.includes('ADD')) {
    const colName = addColMatch[1]!;
    const colType = addColMatch[2]!;
    const nullable = !upper.includes('NOT NULL');
    const hasDefault = upper.includes('DEFAULT');

    // Avoid duplicates
    if (!table.columns.find(c => c.name === colName)) {
      table.columns.push({ name: colName, type: colType, nullable, hasDefault });
    }
  }

  // DROP COLUMN
  const dropColMatch = sql.match(
    /DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?"?(\w+)"?/i,
  );
  if (dropColMatch && upper.includes('DROP') && !upper.includes('DROP TABLE')) {
    const colName = dropColMatch[1]!;
    table.columns = table.columns.filter(c => c.name !== colName);
  }

  // ALTER COLUMN ... SET NOT NULL
  const setNotNullMatch = sql.match(
    /ALTER\s+(?:COLUMN\s+)?"?(\w+)"?\s+SET\s+NOT\s+NULL/i,
  );
  if (setNotNullMatch) {
    const colName = setNotNullMatch[1]!;
    const col = table.columns.find(c => c.name === colName);
    if (col) col.nullable = false;
  }

  // ALTER COLUMN ... DROP NOT NULL
  const dropNotNullMatch = sql.match(
    /ALTER\s+(?:COLUMN\s+)?"?(\w+)"?\s+DROP\s+NOT\s+NULL/i,
  );
  if (dropNotNullMatch) {
    const colName = dropNotNullMatch[1]!;
    const col = table.columns.find(c => c.name === colName);
    if (col) col.nullable = true;
  }

  // ALTER COLUMN ... SET DEFAULT
  const setDefaultMatch = sql.match(
    /ALTER\s+(?:COLUMN\s+)?"?(\w+)"?\s+SET\s+DEFAULT/i,
  );
  if (setDefaultMatch) {
    const colName = setDefaultMatch[1]!;
    const col = table.columns.find(c => c.name === colName);
    if (col) col.hasDefault = true;
  }

  // ALTER COLUMN ... DROP DEFAULT
  const dropDefaultMatch = sql.match(
    /ALTER\s+(?:COLUMN\s+)?"?(\w+)"?\s+DROP\s+DEFAULT/i,
  );
  if (dropDefaultMatch) {
    const colName = dropDefaultMatch[1]!;
    const col = table.columns.find(c => c.name === colName);
    if (col) col.hasDefault = false;
  }

  // ALTER COLUMN ... TYPE
  const typeMatch = sql.match(
    /ALTER\s+(?:COLUMN\s+)?"?(\w+)"?\s+(?:SET\s+DATA\s+)?TYPE\s+(\S+)/i,
  );
  if (typeMatch) {
    const colName = typeMatch[1]!;
    const newType = typeMatch[2]!;
    const col = table.columns.find(c => c.name === colName);
    if (col) col.type = newType;
  }

  // ADD CONSTRAINT
  const addConstraintMatch = sql.match(
    /ADD\s+CONSTRAINT\s+"?(\w+)"?\s+(PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY|EXCLUDE)/i,
  );
  if (addConstraintMatch) {
    const cName = addConstraintMatch[1]!;
    const cType = addConstraintMatch[2]!.replace(/\s+/g, ' ').toUpperCase();
    const cols = extractParenColumns(sql.slice(sql.indexOf(addConstraintMatch[0])));
    state.constraints.set(cName, { name: cName, table: tableName, type: cType, columns: cols });
  }

  // DROP CONSTRAINT
  const dropConstraintMatch = sql.match(
    /DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?/i,
  );
  if (dropConstraintMatch) {
    const cName = dropConstraintMatch[1]!;
    state.constraints.delete(cName);
  }

  // RENAME TABLE
  const renameTableMatch = sql.match(/RENAME\s+TO\s+"?(\w+)"?/i);
  if (renameTableMatch && !upper.includes('RENAME COLUMN') && !upper.includes('RENAME CONSTRAINT')) {
    const newName = renameTableMatch[1]!;
    const newKey = schema ? `${schema}.${newName}` : newName;
    state.tables.delete(key);
    table.name = newName;
    state.tables.set(newKey, table);
  }

  // RENAME COLUMN
  const renameColMatch = sql.match(
    /RENAME\s+(?:COLUMN\s+)?"?(\w+)"?\s+TO\s+"?(\w+)"?/i,
  );
  if (renameColMatch && upper.includes('RENAME')) {
    const oldName = renameColMatch[1]!;
    const newName = renameColMatch[2]!;
    const col = table.columns.find(c => c.name === oldName);
    if (col) col.name = newName;
  }
}

// ---------------------------------------------------------------------------
// CREATE INDEX
// ---------------------------------------------------------------------------

function applyCreateIndex(state: SchemaState, sql: string): void {
  const indexMatch = sql.match(
    /CREATE\s+(UNIQUE\s+)?INDEX\s+(CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s+ON\s+(?:(\w+)\.)?(\w+)\s*(?:USING\s+\w+\s*)?\(([^)]+)\)/i,
  );
  if (!indexMatch) return;

  const unique = !!indexMatch[1];
  const concurrent = !!indexMatch[2];
  const indexName = indexMatch[3]!;
  const tableName = indexMatch[5] ?? indexMatch[4]!;
  const columns = indexMatch[6]!.split(',').map(c => c.trim().replace(/"/g, '').split(/\s/)[0] ?? '').filter(Boolean);

  state.indexes.set(indexName, {
    name: indexName,
    table: tableName,
    columns,
    unique,
    concurrent,
  });
}

// ---------------------------------------------------------------------------
// DROP TABLE
// ---------------------------------------------------------------------------

function applyDropTable(state: SchemaState, sql: string): void {
  const dropMatch = sql.match(
    /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)/i,
  );
  if (!dropMatch) return;

  const schema = dropMatch[1];
  const tableName = dropMatch[2]!;
  const key = schema ? `${schema}.${tableName}` : tableName;

  state.tables.delete(key);

  // Remove associated indexes and constraints
  for (const [name, idx] of state.indexes) {
    if (idx.table === tableName) state.indexes.delete(name);
  }
  for (const [name, con] of state.constraints) {
    if (con.table === tableName) state.constraints.delete(name);
  }
}

// ---------------------------------------------------------------------------
// DROP INDEX
// ---------------------------------------------------------------------------

function applyDropIndex(state: SchemaState, sql: string): void {
  const dropMatch = sql.match(
    /DROP\s+INDEX\s+(CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?"?(?:\w+\.)?"?(\w+)"?/i,
  );
  if (!dropMatch) return;

  const indexName = dropMatch[2]!;
  state.indexes.delete(indexName);
}

// ---------------------------------------------------------------------------
// CREATE SEQUENCE
// ---------------------------------------------------------------------------

function applyCreateSequence(state: SchemaState, sql: string): void {
  const seqMatch = sql.match(
    /CREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)/i,
  );
  if (!seqMatch) return;

  const seqName = seqMatch[2] ?? seqMatch[1]!;
  const upper = sql.toUpperCase();

  let dataType = 'bigint';
  if (upper.includes('AS SMALLINT')) dataType = 'smallint';
  else if (upper.includes('AS INTEGER')) dataType = 'integer';
  else if (upper.includes('AS BIGINT')) dataType = 'bigint';

  const ownedMatch = sql.match(/OWNED\s+BY\s+(\S+)/i);
  const ownedBy = ownedMatch?.[1]?.replace(/"/g, '');

  state.sequences.set(seqName, { name: seqName, dataType, ownedBy });
}

// ---------------------------------------------------------------------------
// DROP SEQUENCE
// ---------------------------------------------------------------------------

function applyDropSequence(state: SchemaState, sql: string): void {
  const dropMatch = sql.match(
    /DROP\s+SEQUENCE\s+(?:IF\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)/i,
  );
  if (!dropMatch) return;

  const seqName = dropMatch[2] ?? dropMatch[1]!;
  state.sequences.delete(seqName);
}

/**
 * Async variant that uses libpg-query for more accurate parsing.
 * Falls back to regex-based parsing on failure.
 */
export async function simulateSchemaAsync(sqlStatements: string[]): Promise<SchemaState> {
  // For now, delegate to the synchronous regex-based parser which handles
  // all common DDL patterns. The async variant is provided for future
  // enhancement with full AST-based parsing.
  return simulateSchema(sqlStatements);
}
