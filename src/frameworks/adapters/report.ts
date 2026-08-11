/**
 * Human-readable reporting for adapter results.
 *
 * Every line here exists to answer one of two questions the user should never
 * have to guess at: "what did it just analyze?" and "what did it not analyze,
 * and why?".
 */

import chalk from 'chalk';
import type { AdapterResult } from './types.js';

/** One line: what was detected, how much of it is being analyzed, and from where. */
export function formatAdapterBanner(result: AdapterResult): string {
  const where = result.sources.map(withSlash).join(', ') || result.root;
  const count = result.migrations.length;

  if (result.support === 'recipe' || count === 0) {
    const found = result.skipped.length;
    return chalk.bold(`Detected ${result.name}`) +
      ` — ${found > 0 ? `${found} migration${found === 1 ? '' : 's'} found in ${where}, none analyzable` : `nothing analyzable in ${where}`}`;
  }

  const total = count + result.skipped.length;
  const scope = result.support === 'extracted' && result.skipped.length > 0
    ? `extracted SQL from ${count} of ${total} migrations in ${where}`
    : `analyzing ${count} migration${count === 1 ? '' : 's'} from ${where}`;

  return chalk.bold(`Detected ${result.name}`) + ` — ${scope}`;
}

/** Ordering rule, adapter notes, per-file notes, and the honest skip list. */
export function formatAdapterDetails(result: AdapterResult): string {
  const lines: string[] = [];
  lines.push(chalk.dim(`  Ordering: ${result.ordering}`));

  for (const note of result.notes) {
    lines.push(chalk.dim(`  Note: ${note}`));
  }

  const withNotes = result.migrations.filter(m => m.notes.length > 0);
  for (const migration of withNotes) {
    for (const note of migration.notes) {
      lines.push(chalk.yellow(`  ${migration.label}: ${note}`));
    }
  }

  if (result.skipped.length > 0) {
    lines.push(chalk.yellow(`  Not analyzed (${result.skipped.length}):`));
    for (const skip of result.skipped) {
      lines.push(chalk.yellow(`    ${skip.label} — ${skip.reason}`));
    }
  }

  return lines.join('\n');
}

/** The "here is how to produce the SQL" block for Tier-2 frameworks. */
export function formatRecipe(result: AdapterResult): string {
  if (!result.recipe) return '';
  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.bold(`How to check ${result.name} migrations:`));
  lines.push(`  ${result.recipe.summary}`);
  lines.push('');
  for (const step of result.recipe.steps) {
    lines.push(`  ${step}`);
  }
  if (result.recipe.fromCommand) {
    lines.push('');
    lines.push(chalk.cyan(`  ${result.recipe.fromCommand}`));
  }
  return lines.join('\n');
}

function withSlash(source: string): string {
  return source.endsWith('/') ? source : `${source}/`;
}
