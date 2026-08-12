import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { allRules, staticRules } from '../src/rules/index.js';

const run = promisify(execFile);
const CLI = resolve(__dirname, '../dist/cli.cjs');
const SRC = resolve(__dirname, '../src');

/**
 * MigrationPilot used to withhold three rules from anyone without a licence key
 * and meter production analyses at three per month. Both are gone. These tests
 * pin the end state: no key, nothing withheld, nothing metered, and no output
 * anywhere that tries to sell an upgrade.
 */

/** Wording that only makes sense if some paid tier exists. */
const UPSELL = [
  /upgrade to pro/i,
  /try pro free/i,
  /migrationpilot\.dev\/pricing/i,
  /migrationpilot\.dev\/billing/i,
  /free (?:production )?analys/i,
  /\bpro tier\b/i,
  /\bpaid tier\b/i,
  /\bfree tier\b/i,
];

function findUpsell(text: string): string[] {
  return UPSELL.filter(re => re.test(text)).map(re => String(re));
}

/** Run the built CLI with a deliberately empty environment — no licence key. */
async function cli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const env = { ...process.env };
  delete env.MIGRATIONPILOT_LICENSE_KEY;
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], { env, maxBuffer: 20 * 1024 * 1024 });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 };
  }
}

describe('no licence key required', () => {
  it('list-rules exposes every rule, with no tier field and no upsell', async () => {
    const { stdout, stderr, code } = await cli(['list-rules', '--json']);
    expect(code).toBe(0);

    const rules = JSON.parse(stdout) as Array<Record<string, unknown>>;
    expect(rules.length).toBe(allRules.length);
    expect(rules.some(r => 'tier' in r)).toBe(false);

    // The three once-withheld rules are present like any other.
    for (const id of ['MP013', 'MP014', 'MP019']) {
      expect(rules.map(r => r.id)).toContain(id);
    }

    expect(findUpsell(stdout + stderr)).toEqual([]);
  }, 60_000);

  it('the human-readable rule list carries no tier language', async () => {
    const { stdout, stderr, code } = await cli(['list-rules']);
    expect(code).toBe(0);
    expect(stdout).toContain(`${allRules.length} safety rules`);
    expect(stdout).not.toMatch(/\[PRO\]|\[FREE\]/);
    expect(findUpsell(stdout + stderr)).toEqual([]);
  }, 60_000);

  it('repeated production-context runs are never metered or blocked', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mp-nolicence-'));
    try {
      const file = join(dir, 'm.sql');
      await writeFile(file, 'CREATE INDEX idx_users_email ON users (email);\n');

      // The old build allowed three of these a month, then exited 1 with an
      // upgrade prompt. An unreachable database is fine: what matters is that
      // the fourth and fifth runs behave exactly like the first.
      const outputs: string[] = [];
      for (let i = 0; i < 5; i++) {
        const { stdout, stderr } = await cli([
          'analyze', file,
          '--database-url', 'postgresql://nobody@127.0.0.1:1/none',
        ]);
        const combined = stdout + stderr;
        outputs.push(combined);
        expect(findUpsell(combined), `run ${i + 1}`).toEqual([]);
        expect(combined, `run ${i + 1}`).not.toMatch(/used all|this month/i);
        // MP001 fires from the file alone, so every run must still report it.
        expect(combined, `run ${i + 1}`).toContain('MP001');
      }

      // Run 5 says the same thing as run 1 — no quota crept in.
      expect(outputs[4]!.includes('MP001')).toBe(outputs[0]!.includes('MP001'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);

  it('doctor reports the full rule set and sells nothing', async () => {
    const { stdout, stderr } = await cli(['doctor']);
    const combined = stdout + stderr;
    expect(combined).toContain(`all ${allRules.length} rules run`);
    expect(findUpsell(combined)).toEqual([]);
  }, 60_000);

  it('no source file outside the billing and licence modules sells an upgrade', async () => {
    // Those two modules legitimately talk about plans; nothing else should.
    const allowed = [join('src', 'billing'), join('src', 'license')];
    const offenders: string[] = [];

    async function walk(dir: string): Promise<void> {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { await walk(full); continue; }
        if (!entry.name.endsWith('.ts')) continue;
        if (allowed.some(a => full.includes(a))) continue;
        const hits = findUpsell(await readFile(full, 'utf-8'));
        if (hits.length > 0) offenders.push(`${full}: ${hits.join(', ')}`);
      }
    }
    await walk(SRC);

    expect(offenders).toEqual([]);
  });

  it('the rule set is not split by licence anywhere', () => {
    // staticRules is the no-database subset, never a paid/free boundary.
    const needsDatabase = allRules.filter(r => r.requiresDatabaseUrl);
    expect(staticRules.length).toBe(allRules.length - needsDatabase.length);
    expect(allRules.length).toBeGreaterThan(staticRules.length);
  });
});
