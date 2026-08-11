/**
 * Static raw-SQL extraction from JavaScript/TypeScript migrations
 * (TypeORM, Sequelize, Knex).
 *
 * These migrations are code, not SQL. Where the SQL is a plain string literal
 * — `queryRunner.query('CREATE INDEX ...')`, `knex.raw(\`ALTER TABLE ...\`)` —
 * it can be read off the page with certainty. Where it is built at runtime
 * (interpolation, variables, string concatenation, schema-builder calls), it
 * cannot, and this module says so instead of guessing.
 *
 * Only the `up` half is extracted: the down migration does not run against
 * production on the way forward.
 *
 * Extracted SQL is written back at the line where its literal started, so
 * violations point at the real line of the real .ts file.
 */

const SQL_METHODS = new Set(['query', 'raw']);

/** A SQL string literal that was read verbatim out of the source. */
export interface ExtractedStatement {
  sql: string;
  /** 1-based line of the source file where the literal starts */
  line: number;
  /** The call it came from, e.g. "queryRunner.query" */
  call: string;
}

/** A raw-SQL call whose argument could not be read statically. */
export interface DynamicCall {
  line: number;
  call: string;
  reason: string;
}

export interface JsExtraction {
  /** SQL laid out on the source file's line numbers ('' when nothing was extracted) */
  sql: string;
  statements: ExtractedStatement[];
  dynamic: DynamicCall[];
  /** True when an up() function/property was located */
  foundUp: boolean;
  /** True when the up section calls a schema-builder API instead of raw SQL */
  usesSchemaBuilder: boolean;
}

interface LiteralRead {
  value: string;
  /** Offset of the opening quote */
  start: number;
  /** Offset just past the closing quote */
  end: number;
  interpolated: boolean;
}

interface CallSite {
  index: number;
  call: string;
  literal: LiteralRead | null;
  reason: string;
}

const SCHEMA_BUILDER_HINTS = [
  /\.schema\s*\.\s*\w+\s*\(/,           // knex.schema.createTable(...)
  /queryRunner\s*\.\s*(create|drop|add|change|rename|alter)\w*\s*\(/i,
  /queryInterface\s*\.\s*(create|drop|add|change|rename|remove|alter)\w*\s*\(/i,
];

/**
 * Pull the raw SQL out of one JS/TS migration file.
 */
export function extractSqlFromJs(source: string): JsExtraction {
  const { calls, markers } = scan(source);
  const range = upRange(source, markers, calls);

  const inScope = calls.filter(c => c.index >= range.start && c.index < range.end);
  const statements: ExtractedStatement[] = [];
  const dynamic: DynamicCall[] = [];

  for (const call of inScope) {
    const line = lineOf(source, call.index);
    if (call.literal && !call.literal.interpolated && call.literal.value.trim() !== '') {
      statements.push({ sql: call.literal.value, line: lineOf(source, call.literal.start), call: call.call });
    } else if (call.literal?.interpolated) {
      dynamic.push({ line, call: call.call, reason: 'template literal interpolates a value at runtime' });
    } else if (call.literal && call.literal.value.trim() === '') {
      dynamic.push({ line, call: call.call, reason: 'empty SQL literal' });
    } else {
      dynamic.push({ line, call: call.call, reason: call.reason });
    }
  }

  const scopeSource = source.slice(range.start, range.end);
  const usesSchemaBuilder = SCHEMA_BUILDER_HINTS.some(re => re.test(scopeSource));

  return {
    sql: layout(source, statements),
    statements,
    dynamic,
    foundUp: range.foundUp,
    usesSchemaBuilder,
  };
}

/**
 * Place each extracted statement on the line where its literal began, so
 * reported line numbers match the source file. Statements are terminated with
 * a semicolon when the literal did not carry one.
 */
function layout(source: string, statements: ExtractedStatement[]): string {
  if (statements.length === 0) return '';
  const total = source.split(/\r?\n/).length;
  const lines: string[] = new Array(Math.max(total, 1)).fill('');

  for (const stmt of statements) {
    const body = stmt.sql.trim().replace(/;\s*$/, '') + ';';
    const bodyLines = body.split(/\r?\n/);
    const start = Math.max(0, stmt.line - 1);
    for (let i = 0; i < bodyLines.length; i++) {
      const target = start + i;
      const text = bodyLines[i] ?? '';
      while (lines.length <= target) lines.push('');
      const existing = lines[target] ?? '';
      lines[target] = existing === '' ? text : `${existing} ${text}`;
    }
  }

  return lines.join('\n');
}

/** 1-based line number of a source offset. */
function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

interface Marker {
  name: 'up' | 'down';
  index: number;
}

/**
 * Single pass over the source, skipping comments and string bodies, collecting
 * raw-SQL call sites and up()/down() markers.
 */
function scan(source: string): { calls: CallSite[]; markers: Marker[] } {
  const calls: CallSite[] = [];
  const markers: Marker[] = [];
  let i = 0;

  while (i < source.length) {
    const c = source[i]!;

    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i = readLiteral(source, i).end;
      continue;
    }
    if (isIdentStart(c)) {
      const start = i;
      while (i < source.length && isIdentPart(source[i]!)) i++;
      const word = source.slice(start, i);

      if (SQL_METHODS.has(word)) {
        const dotted = precededByDot(source, start);
        const parenAt = nextNonSpace(source, i);
        if (dotted && parenAt >= 0 && source[parenAt] === '(') {
          calls.push(readCall(source, start, word, parenAt + 1));
          continue;
        }
      } else if (word === 'up' || word === 'down') {
        if (isMigrationMarker(source, start, i)) {
          markers.push({ name: word, index: start });
        }
      }
      continue;
    }
    i++;
  }

  return { calls, markers };
}

/** Read the first argument of a raw-SQL call. */
function readCall(source: string, nameStart: number, method: string, argStart: number): CallSite {
  const call = `${qualifier(source, nameStart)}${method}`;
  const at = nextNonSpace(source, argStart);
  if (at < 0) return { index: nameStart, call, literal: null, reason: 'call has no arguments' };

  const ch = source[at];
  if (ch === "'" || ch === '"' || ch === '`') {
    const literal = readLiteral(source, at);
    // A literal immediately followed by `+` is a concatenation — not statically whole.
    const after = nextNonSpace(source, literal.end);
    if (after >= 0 && source[after] === '+') {
      return { index: nameStart, call, literal: null, reason: 'SQL is assembled with string concatenation' };
    }
    return { index: nameStart, call, literal, reason: '' };
  }

  return { index: nameStart, call, literal: null, reason: 'SQL comes from a variable or expression, not a literal' };
}

/** The receiver of a method call, e.g. "queryRunner." in queryRunner.query(...). */
function qualifier(source: string, nameStart: number): string {
  let i = nameStart - 1;
  while (i >= 0 && /\s/.test(source[i]!)) i--;
  if (i < 0 || source[i] !== '.') return '';
  i--;
  while (i >= 0 && /\s/.test(source[i]!)) i--;
  const end = i + 1;
  while (i >= 0 && (isIdentPart(source[i]!) || source[i] === '.')) i--;
  const receiver = source.slice(i + 1, end);
  return receiver ? `${receiver}.` : '';
}

function precededByDot(source: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && /\s/.test(source[i]!)) i--;
  return i >= 0 && source[i] === '.';
}

function nextNonSpace(source: string, from: number): number {
  let i = from;
  while (i < source.length) {
    const c = source[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    return i;
  }
  return -1;
}

/**
 * True when this `up`/`down` identifier looks like a migration entry point:
 * `async up(`, `up: async (`, `exports.up = `, `export function up(`.
 */
function isMigrationMarker(source: string, start: number, end: number): boolean {
  const at = nextNonSpace(source, end);
  if (at < 0) return false;
  const next = source[at];
  if (next !== '(' && next !== ':' && next !== '=') return false;
  if (next === '=' && source[at + 1] === '=') return false;

  // Reject property access like `foo.up` unless it is an exports assignment.
  let i = start - 1;
  while (i >= 0 && /\s/.test(source[i]!)) i--;
  if (i >= 0 && source[i] === '.') {
    const before = source.slice(Math.max(0, i - 20), i);
    return /(^|\W)(exports|module\.exports)$/.test(before);
  }
  return true;
}

/**
 * The slice of source covering the up migration.
 * Falls back to the whole file when no up() entry point is recognizable.
 */
function upRange(
  source: string,
  markers: Marker[],
  calls: CallSite[],
): { start: number; end: number; foundUp: boolean } {
  const up = markers.find(m => m.name === 'up');
  if (!up) return { start: 0, end: source.length, foundUp: false };

  const down = markers.find(m => m.name === 'down' && m.index > up.index);
  const end = down ? down.index : source.length;

  // If the recognized range holds no SQL calls but the file does, the marker was
  // probably a false positive — analyze the whole file rather than nothing.
  const inRange = calls.some(c => c.index >= up.index && c.index < end);
  if (!inRange && calls.length > 0) return { start: 0, end: source.length, foundUp: false };

  return { start: up.index, end, foundUp: true };
}

/**
 * Read a string or template literal starting at `start` (which must be a quote).
 * Template interpolations are skipped over with brace matching.
 */
function readLiteral(source: string, start: number): LiteralRead {
  const quote = source[start]!;
  let i = start + 1;
  let value = '';
  let interpolated = false;

  while (i < source.length) {
    const c = source[i]!;
    if (c === '\\') {
      value += unescape(source[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (c === quote) {
      i++;
      break;
    }
    if (quote === '`' && c === '$' && source[i + 1] === '{') {
      interpolated = true;
      i = skipInterpolation(source, i + 2);
      continue;
    }
    if (quote !== '`' && c === '\n') {
      // Unterminated single/double quoted string — bail out at the line break.
      break;
    }
    value += c;
    i++;
  }

  return { value, start, end: i, interpolated };
}

/** Skip a `${ ... }` interpolation, honoring nested braces and strings. */
function skipInterpolation(source: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < source.length && depth > 0) {
    const c = source[i]!;
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') { depth--; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { i = readLiteral(source, i).end; continue; }
    i++;
  }
  return i;
}

function unescape(c: string): string {
  switch (c) {
    case 'n': return '\n';
    case 't': return '\t';
    case 'r': return '\r';
    case '0': return '\0';
    case '\n': return '';
    default: return c;
  }
}

function isIdentStart(c: string): boolean {
  return /[A-Za-z_$]/.test(c);
}

function isIdentPart(c: string): boolean {
  return /[A-Za-z0-9_$]/.test(c);
}
