/**
 * Section extraction for annotated SQL migrations (goose, dbmate).
 *
 * These frameworks keep the up and down migration in one file, separated by
 * comment directives. Only the "up" half describes what will happen to
 * production, so that is all MigrationPilot analyzes.
 *
 * Everything outside the up section is blanked out rather than deleted, so the
 * line numbers in violations still point at the real line in the real file.
 */

export interface SectionExtraction {
  /** SQL with non-up lines blanked, so line numbers match the source file */
  sql: string;
  /** False when the file has no up marker at all */
  foundUp: boolean;
  /** Directives seen inside the up section, e.g. "NO TRANSACTION" */
  directives: string[];
}

const GOOSE_UP = /^\s*--\s*\+goose\s+Up\b/i;
const GOOSE_DOWN = /^\s*--\s*\+goose\s+Down\b/i;
const GOOSE_DIRECTIVE = /^\s*--\s*\+goose\s+(NO TRANSACTION|StatementBegin|StatementEnd|ENVSUB\s+\w+)/i;

const DBMATE_UP = /^\s*--\s*migrate:up\b(.*)$/i;
const DBMATE_DOWN = /^\s*--\s*migrate:down\b/i;

/**
 * Extract the `-- +goose Up` half of a goose migration.
 *
 * StatementBegin/StatementEnd markers are left in place: they are SQL comments,
 * so the parser ignores them and the line numbers stay honest.
 */
export function extractGooseUp(sql: string): SectionExtraction {
  const lines = sql.split(/\r?\n/);
  const out: string[] = [];
  const directives: string[] = [];
  let inUp = false;
  let foundUp = false;

  for (const line of lines) {
    if (GOOSE_UP.test(line)) {
      inUp = true;
      foundUp = true;
      out.push(line);
      continue;
    }
    if (GOOSE_DOWN.test(line)) {
      inUp = false;
      out.push('');
      continue;
    }
    if (inUp) {
      const directive = line.match(GOOSE_DIRECTIVE);
      if (directive?.[1]) {
        const name = directive[1].toUpperCase();
        if (name === 'NO TRANSACTION' && !directives.includes('NO TRANSACTION')) {
          directives.push('NO TRANSACTION');
        }
      }
      out.push(line);
    } else {
      // Preserve leading comments (they may carry a NO TRANSACTION directive) but
      // never leak down-migration SQL into the analysis.
      const directive = line.match(GOOSE_DIRECTIVE);
      if (directive?.[1] && directive[1].toUpperCase() === 'NO TRANSACTION' && !foundUp) {
        directives.push('NO TRANSACTION');
      }
      out.push(line.trim().startsWith('--') && !foundUp ? line : '');
    }
  }

  return { sql: out.join('\n'), foundUp, directives };
}

/**
 * Extract the `-- migrate:up` half of a dbmate migration.
 * dbmate allows several up/down pairs in one file, so this handles repeats.
 */
export function extractDbmateUp(sql: string): SectionExtraction {
  const lines = sql.split(/\r?\n/);
  const out: string[] = [];
  const directives: string[] = [];
  let inUp = false;
  let foundUp = false;

  for (const line of lines) {
    const up = line.match(DBMATE_UP);
    if (up) {
      inUp = true;
      foundUp = true;
      const opts = (up[1] ?? '').trim();
      if (opts && !directives.includes(opts)) directives.push(opts);
      out.push(line);
      continue;
    }
    if (DBMATE_DOWN.test(line)) {
      inUp = false;
      out.push('');
      continue;
    }
    out.push(inUp ? line : '');
  }

  return { sql: out.join('\n'), foundUp, directives };
}

/** True when a file looks like a Liquibase formatted-SQL changelog. */
export function isLiquibaseFormattedSql(sql: string): boolean {
  // The header must be the first non-empty line. Liquibase itself is strict here.
  for (const line of sql.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    return /^\s*--\s*liquibase\s+formatted\s+sql/i.test(line);
  }
  return false;
}

/** Changeset ids declared in a Liquibase formatted-SQL file, in file order. */
export function liquibaseChangesets(sql: string): string[] {
  const ids: string[] = [];
  for (const line of sql.split(/\r?\n/)) {
    const match = line.match(/^\s*--\s*changeset\s+(\S+)/i);
    if (match?.[1]) ids.push(match[1]);
  }
  return ids;
}
