/**
 * Sqitch adapter — Tier 1 (full support).
 *
 * Sqitch deploy scripts are plain SQL, but their order lives in `sqitch.plan`,
 * not in the filenames — so the plan is parsed and used as the ordering source.
 * Deploy scripts that the plan does not mention are reported as skipped, since
 * Sqitch would never deploy them.
 *
 * Plan format (from the Sqitch tutorial):
 *   %syntax-version=1.0.0
 *   %project=flipr
 *   users [appschema] 2013-12-30T23:49:00Z Marge <marge@example.com> # note
 *   @v1.0.0-dev1 2013-12-31T00:01:22Z Marge <marge@example.com> # tag
 */

import { join } from 'node:path';
import type { Adapter, AdapterResult, ResolvedMigration, SkippedFile } from './types.js';
import { exists, labelFor, readText, toPosix, walkFiles } from './util.js';

interface SqitchConfig {
  topDir: string;
  deployDir: string;
  extension: string;
  planFile: string;
}

export const sqitchAdapter: Adapter = {
  id: 'sqitch',
  name: 'Sqitch',
  support: 'full',
  async resolve(root: string): Promise<AdapterResult | null> {
    const config = await readConfig(root);
    const planPath = await findPlan(root, config);
    if (!planPath) return null;

    const plan = await readText(planPath);
    if (plan === null) return null;

    const notes: string[] = [];
    const skipped: SkippedFile[] = [];
    const migrations: ResolvedMigration[] = [];

    const changes = parsePlan(plan);
    const reworked = changes.filter((c, i) => changes.indexOf(c) !== i);
    const ordered = [...new Set(changes)];
    const deployDir = join(root, config.topDir, config.deployDir);
    const claimed = new Set<string>();

    for (const [index, change] of ordered.entries()) {
      const path = join(deployDir, `${change}.${config.extension}`);
      const sql = await readText(path);
      if (sql === null) {
        skipped.push({
          path,
          label: labelFor(root, path),
          reason: `listed in ${toPosix(labelFor(root, planPath))} but the deploy script is missing`,
        });
        continue;
      }
      claimed.add(path);
      migrations.push({
        path,
        label: labelFor(root, path),
        sql,
        version: String(index).padStart(4, '0'),
        origin: 'sql-file',
        notes: [],
      });
    }

    for (const file of await walkFiles(deployDir)) {
      if (!file.endsWith(`.${config.extension}`) || claimed.has(file)) continue;
      skipped.push({
        path: file,
        label: labelFor(root, file),
        reason: `not listed in ${toPosix(labelFor(root, planPath))} — Sqitch will not deploy it`,
      });
    }

    if (reworked.length > 0) {
      notes.push(`Reworked change(s) appear more than once in the plan (${[...new Set(reworked)].join(', ')}); the current deploy script was analyzed once.`);
    }

    return {
      id: 'sqitch',
      name: 'Sqitch',
      support: 'full',
      root,
      sources: [toPosix(labelFor(root, deployDir))],
      ordering: `change order in ${toPosix(labelFor(root, planPath))}`,
      migrations,
      skipped,
      notes,
    };
  },
};

/** Change names from a plan, in plan order. Pragmas, tags, and comments are skipped. */
export function parsePlan(plan: string): string[] {
  const changes: string[] = [];
  for (const raw of plan.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith('%') || line.startsWith('@')) continue;
    const name = line.split(/[\s[]/)[0];
    if (name) changes.push(name);
  }
  return changes;
}

async function findPlan(root: string, config: SqitchConfig): Promise<string | null> {
  const candidates = [
    join(root, config.topDir, config.planFile),
    join(root, config.planFile),
    join(root, 'sqitch.plan'),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

/** Read the handful of sqitch.conf settings that move files around. */
async function readConfig(root: string): Promise<SqitchConfig> {
  const config: SqitchConfig = { topDir: '.', deployDir: 'deploy', extension: 'sql', planFile: 'sqitch.plan' };
  const conf = await readText(join(root, 'sqitch.conf'));
  if (conf === null) return config;

  const value = (key: string): string | undefined => {
    const match = conf.match(new RegExp(`^[\\t ]*${key}\\s*=\\s*(.+)$`, 'mi'));
    return match?.[1]?.trim();
  };

  config.topDir = value('top_dir') ?? config.topDir;
  config.deployDir = value('deploy_dir') ?? config.deployDir;
  config.extension = value('extension') ?? config.extension;
  config.planFile = value('plan_file') ?? config.planFile;
  return config;
}
