/**
 * Framework adapter registry.
 *
 * `resolveFrameworkMigrations()` is the entry point behind zero-config
 * `migrationpilot check`: it asks every adapter whether it recognizes the
 * project, then picks the one that can actually deliver SQL.
 */

import type { FrameworkId } from '../detect.js';
import type { Adapter, AdapterResult, SupportLevel } from './types.js';
import { prismaAdapter } from './prisma.js';
import { drizzleAdapter } from './drizzle.js';
import { flywayAdapter } from './flyway.js';
import { liquibaseAdapter } from './liquibase.js';
import { gooseAdapter } from './goose.js';
import { dbmateAdapter } from './dbmate.js';
import { sqitchAdapter } from './sqitch.js';
import { typeormAdapter, sequelizeAdapter, knexAdapter } from './js-migrations.js';
import { djangoAdapter, alembicAdapter, railsAdapter } from './recipes.js';

/** Registry order doubles as the tie-break when two adapters match equally well. */
export const adapters: Adapter[] = [
  prismaAdapter,
  drizzleAdapter,
  flywayAdapter,
  liquibaseAdapter,
  gooseAdapter,
  dbmateAdapter,
  sqitchAdapter,
  typeormAdapter,
  sequelizeAdapter,
  knexAdapter,
  djangoAdapter,
  alembicAdapter,
  railsAdapter,
];

export const adapterIds: FrameworkId[] = adapters.map(a => a.id);

export function getAdapter(id: string): Adapter | undefined {
  return adapters.find(a => a.id === id.toLowerCase());
}

/** Every adapter that recognizes this project, best first. */
export async function resolveAllFrameworks(root: string): Promise<AdapterResult[]> {
  const settled = await Promise.all(
    adapters.map(async adapter => {
      try {
        return await adapter.resolve(root);
      } catch {
        // A broken project layout must never crash detection for the others.
        return null;
      }
    }),
  );

  return settled
    .filter((r): r is AdapterResult => r !== null)
    .sort((a, b) => rank(a) - rank(b));
}

/**
 * The single best adapter for this project, or null when none recognize it.
 * Pass `framework` to force one (and get null if that one does not match).
 */
export async function resolveFrameworkMigrations(
  root: string,
  framework?: string,
): Promise<AdapterResult | null> {
  if (framework) {
    const adapter = getAdapter(framework);
    if (!adapter) return null;
    try {
      return await adapter.resolve(root);
    } catch {
      return null;
    }
  }

  const all = await resolveAllFrameworks(root);
  return all[0] ?? null;
}

const SUPPORT_RANK: Record<SupportLevel, number> = { full: 0, extracted: 1000, recipe: 2000 };

/**
 * Prefer adapters that produce analyzable SQL, then those with more of it,
 * then registry order.
 */
function rank(result: AdapterResult): number {
  const base = SUPPORT_RANK[result.support];
  const found = result.migrations.length > 0 ? 0 : 500;
  const position = adapters.findIndex(a => a.id === result.id);
  return base + found + position;
}

export type { Adapter, AdapterResult, ResolvedMigration, SkippedFile, SupportLevel, FrameworkRecipe, MigrationOrigin } from './types.js';
export { runSqlCommand } from './from-command.js';
export type { CommandResult } from './from-command.js';
export { extractSqlFromJs } from './js-extract.js';
export type { JsExtraction, ExtractedStatement, DynamicCall } from './js-extract.js';
export { extractGooseUp, extractDbmateUp, isLiquibaseFormattedSql } from './sections.js';
export { formatAdapterBanner, formatAdapterDetails, formatRecipe } from './report.js';
