/**
 * Framework adapter contracts.
 *
 * Detection (src/frameworks/detect.ts) answers "which framework is this?".
 * Adapters answer the harder question: "where is the SQL, and in what order
 * does it run?" — so `migrationpilot check` works with no arguments in a real
 * framework repo.
 *
 * Three honest support levels:
 * - `full`      migrations are SQL on disk; MigrationPilot reads and orders them itself
 * - `extracted` migrations are code; raw SQL string literals are pulled out statically,
 *               and anything dynamic is reported as skipped rather than guessed at
 * - `recipe`    SQL only exists once the framework generates it; MigrationPilot explains
 *               the exact command to produce it and can analyze that command's stdout
 */

import type { FrameworkId } from '../detect.js';

export type SupportLevel = 'full' | 'extracted' | 'recipe';

/** How a piece of SQL was obtained. */
export type MigrationOrigin =
  /** Read verbatim from a .sql file */
  | 'sql-file'
  /** A section of a .sql file (goose `+goose Up`, dbmate `migrate:up`) */
  | 'sql-section'
  /** String literals pulled out of a JS/TS migration */
  | 'static-extract'
  /** stdout of a user-supplied command (`--from-command`) */
  | 'command';

export interface ResolvedMigration {
  /** Absolute path of the file the SQL came from (synthetic label for command output) */
  path: string;
  /** Display label — relative to the project root where possible */
  label: string;
  /** The SQL to analyze */
  sql: string;
  /** Sort key produced by the framework's ordering rule (for reporting/debugging) */
  version: string;
  origin: MigrationOrigin;
  /** Honest per-file caveats (e.g. "2 dynamic query() calls skipped") */
  notes: string[];
}

export interface SkippedFile {
  /** Absolute path */
  path: string;
  /** Display label — relative to the project root where possible */
  label: string;
  /** Why nothing was analyzed. Always specific, never "unsupported". */
  reason: string;
}

/** Instructions for producing SQL a framework does not keep on disk. */
export interface FrameworkRecipe {
  /** One line: why SQL has to be generated for this framework */
  summary: string;
  /** Copy-pasteable steps */
  steps: string[];
  /** A ready-to-run `migrationpilot check --from-command "..."` invocation */
  fromCommand?: string;
}

export interface AdapterResult {
  id: FrameworkId;
  /** Display name, e.g. "Prisma" */
  name: string;
  support: SupportLevel;
  /** Project root the adapter resolved against (absolute) */
  root: string;
  /** Directories/files the migrations came from, relative to root */
  sources: string[];
  /** Plain-English description of the ordering rule that was applied */
  ordering: string;
  /** Migrations in execution order */
  migrations: ResolvedMigration[];
  /** Files found but deliberately not analyzed, each with a specific reason */
  skipped: SkippedFile[];
  /** Adapter-level caveats worth printing */
  notes: string[];
  /** Set when SQL must be generated (`support: 'recipe'`, or as an escape hatch) */
  recipe?: FrameworkRecipe;
}

export interface Adapter {
  id: FrameworkId;
  name: string;
  support: SupportLevel;
  /**
   * Locate this framework's migrations under `root`.
   * Returns null when the framework is not present — never throws for a missing project.
   */
  resolve(root: string): Promise<AdapterResult | null>;
}
