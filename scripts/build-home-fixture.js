#!/usr/bin/env node
/**
 * Generates and verifies the homepage hero's first-paint report.
 *
 * The hero widget renders a real analysis before any JavaScript loads. That
 * report has to be baked into the page, which means it can go stale the moment
 * a rule or the scoring changes. This script closes that gap:
 *
 *   check mode (default, runs inside `pnpm --dir site build`)
 *     Re-analyses the fixture with the engine being shipped and FAILS the build
 *     if the committed file disagrees by so much as a byte.
 *
 *   --write
 *     Rewrites the committed file. Run this after any rule, message or scoring
 *     change, and commit the result.
 *
 * The report is produced by bundling `src/browser.ts`, the exact entry point
 * that becomes site/public/playground/engine.js, so the numbers on the page
 * come from the same code the visitor's browser runs. Only the parser backend
 * differs (native libpg-query here, the same library as WebAssembly there), and
 * the fixture records the hash of the shipped bundle so a mismatched pair
 * cannot survive a build.
 *
 * The analysis runs in a child process (`--emit-report`). The parser's
 * Emscripten glue trips a libuv assertion during teardown on Windows, which
 * would otherwise destroy this script's own exit code, and the exit code is the
 * whole point of the check.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const SQL_PATH = resolve(root, 'site/src/app/_home/hero-migration.sql');
const OUT_PATH = resolve(root, 'site/src/app/_home/precomputed.ts');
const BUNDLE_PATH = resolve(root, 'site/public/playground/engine.js');
const PG_VERSION = 17;
const MARKER = '@@FIXTURE@@';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);
const readSql = () => readFileSync(SQL_PATH, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');

/* ------------------------------------------------------------------ child */

if (process.argv.includes('--emit-report')) {
  const dir = mkdtempSync(join(tmpdir(), 'mp-fixture-'));
  const outfile = join(dir, 'engine.cjs');

  // CommonJS on purpose: the Emscripten glue `require`s node:fs at runtime from
  // its Node branch, which an ESM bundle cannot satisfy.
  await build({
    absWorkingDir: root,
    entryPoints: ['src/browser.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    logLevel: 'warning',
  });

  const req = createRequire(import.meta.url);
  // The glue's Node branch resolves the parser relative to the bundle.
  copyFileSync(req.resolve('libpg-query/wasm/libpg-query.wasm'), join(dir, 'libpg-query.wasm'));
  const mod = req(outfile);

  await mod.warmup();
  const report = await mod.analyzeMigration(readSql(), PG_VERSION);

  process.stdout.write(
    MARKER +
      JSON.stringify({
        report,
        ruleCount: mod.ruleCount,
        databaseRuleCount: mod.productionRules.length,
      }),
  );
  rmSync(dir, { recursive: true, force: true });
  process.exit(0);
}

/* ----------------------------------------------------------------- parent */

const write = process.argv.includes('--write');
const sql = readSql();

let bundleHash;
try {
  bundleHash = sha256(readFileSync(BUNDLE_PATH));
} catch {
  console.error(
    `build-home-fixture: ${BUNDLE_PATH} is missing. Run scripts/build-playground.js first.`,
  );
  process.exit(1);
}

let childOutput;
try {
  childOutput = execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--emit-report'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
} catch (err) {
  // A crash during the parser's teardown is survivable as long as the report
  // made it to stdout first.
  childOutput = err.stdout ?? '';
}

const marked = childOutput.indexOf(MARKER);
if (marked === -1) {
  console.error('build-home-fixture: the engine produced no report.');
  process.exit(1);
}

const { report, ruleCount, databaseRuleCount } = JSON.parse(
  childOutput.slice(marked + MARKER.length),
);

if (report.parseError) {
  console.error(`build-home-fixture: the fixture does not parse: ${report.parseError}`);
  process.exit(1);
}

// The widget renders these fields and nothing else. Keeping the payload to what
// is displayed keeps the page weight honest.
const trimmed = {
  version: report.version,
  file: 'migrations/20260812_orders_constraints.sql',
  riskLevel: report.riskLevel,
  riskScore: report.riskScore,
  riskFactors: report.riskFactors ?? [],
  statements: (report.statements ?? []).map((s) => ({
    sql: s.sql,
    lockType: s.lockType,
    blocksReads: s.blocksReads,
    blocksWrites: s.blocksWrites,
    riskLevel: s.riskLevel,
    riskScore: s.riskScore,
  })),
  violations: (report.violations ?? []).map((v) => ({
    ruleId: v.ruleId,
    ruleName: v.ruleName,
    severity: v.severity,
    message: v.message,
    line: v.line,
    safeAlternative: v.safeAlternative,
  })),
  summary: report.summary,
};

const manifest = {
  ruleCount,
  databaseRuleCount,
  offlineRuleCount: ruleCount - databaseRuleCount,
  pgVersion: PG_VERSION,
  engineBundleSha: bundleHash,
  fixtureSha: sha256(sql),
};

const file = `/*
 * GENERATED FILE. Do not edit by hand.
 *
 * The report below is what the shipped analysis engine actually returns for
 * hero-migration.sql, captured so the hero renders a true result before any
 * JavaScript loads. \`pnpm --dir site build\` re-derives it and fails if this
 * file has drifted.
 *
 * Regenerate:  node scripts/build-home-fixture.js --write
 *
 * Any long dash inside a message or safe alternative is the engine talking,
 * quoted exactly. Fix the rule, not this file.
 */

import type { Report } from '../playground/engine';

/** Identifies the engine this report came from. Checked at build time. */
export const ENGINE_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const;

export const DEFAULT_SQL = ${JSON.stringify(sql)};

export const PRECOMPUTED_REPORT: Report = ${JSON.stringify(trimmed, null, 2)};
`;

const summary =
  `${trimmed.riskLevel} ${trimmed.riskScore}/100, ` +
  `${trimmed.summary.criticalCount} critical, ${trimmed.summary.warningCount} warning, ` +
  `${manifest.offlineRuleCount} of ${manifest.ruleCount} rules offline`;

if (write) {
  writeFileSync(OUT_PATH, file);
  console.log(`Home fixture written: ${summary} (engine ${bundleHash}).`);
} else {
  let committed = '';
  try {
    committed = readFileSync(OUT_PATH, 'utf8');
  } catch {
    /* a missing file counts as drifted */
  }
  if (committed.replace(/\r\n/g, '\n') !== file) {
    console.error(
      [
        '',
        'build-home-fixture: the homepage hero result no longer matches the engine.',
        '',
        `  engine says: ${summary}`,
        `  engine bundle: ${bundleHash}`,
        '',
        '  Fix it with:  node scripts/build-home-fixture.js --write',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
  console.log(`Home fixture: verified against the shipped engine (${bundleHash}).`);
}
