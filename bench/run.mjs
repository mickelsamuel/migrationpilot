#!/usr/bin/env node
// bench/run.mjs — the agent-migration safety benchmark runner.
//
// Zero dependencies. Node 22+.
//
//   node bench/run.mjs                 run everything, regenerate RESULTS.md
//   node bench/run.mjs --dump-rules    list every rule id each tool emitted
//   node bench/run.mjs --tools=mp      restrict to a subset (mp,squawk,pgfence)
//   node bench/run.mjs --latest        use @latest instead of the pinned versions
//   node bench/run.mjs --no-timing     skip the throughput phase
//
// Everything this script decides is written down: the corpus ground truth lives
// in the YAML header of each .sql file, and the rule classification lives in
// bench/rule-map.json. Neither is inferred at runtime.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const BENCH_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = dirname(BENCH_DIR);
const CORPUS_DIR = join(BENCH_DIR, 'corpus');
const STRIPPED_DIR = join(BENCH_DIR, '.stripped');
const MP_CLI = join(REPO_DIR, 'dist', 'cli.cjs');

// Pinned so a re-run reproduces the published numbers. --latest overrides.
const PINNED = {
  squawk: 'squawk-cli@2.62.0',
  pgfence: '@flvmnt/pgfence@0.6.1',
};

// Every tool is told to target the same PostgreSQL major unless a corpus file
// declares its own in the header (only the PG18 NOT NULL entry does).
const DEFAULT_PG = '17';

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const flagValue = (f) => {
  const hit = argv.find((a) => a.startsWith(`${f}=`));
  return hit ? hit.slice(f.length + 1) : null;
};

const OPTS = {
  dumpRules: hasFlag('--dump-rules'),
  latest: hasFlag('--latest'),
  timing: !hasFlag('--no-timing'),
  tools: (flagValue('--tools') || 'mp,squawk,pgfence').split(',').map((t) => t.trim()),
};

const IS_WIN = process.platform === 'win32';

// ---------------------------------------------------------------------------
// Corpus loading
// ---------------------------------------------------------------------------

/** Walk a directory tree and return every .sql path, sorted for determinism. */
function walkSql(dir) {
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkSql(full));
    else if (entry.endsWith('.sql')) out.push(full);
  }
  return out;
}

/**
 * Parse the `/* --- ... --- *\/` header at the top of a corpus file.
 * Deliberately handles only the subset the corpus uses: `key: scalar` and
 * `key: [a, b]`. Anything richer would need a YAML dependency, and the point of
 * this runner is that it has none.
 */
function parseHeader(text, file) {
  const match = text.match(/^\s*\/\*\s*---\r?\n([\s\S]*?)\r?\n---\s*\*\//);
  if (!match) throw new Error(`${file}: missing YAML header block`);
  const meta = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      meta[key] = inner ? inner.split(',').map((s) => s.trim()).filter(Boolean) : [];
    } else {
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      meta[key] = value;
    }
  }
  return meta;
}

const HEADER_RE = /^\s*\/\*\s*---\r?\n[\s\S]*?\r?\n---\s*\*\/\r?\n?/;

/**
 * Write a copy of every corpus file with the benchmark's own YAML header
 * removed, leaving the migration exactly as an agent would have emitted it.
 *
 * This matters more than it looks. The header is a block comment, and a leading
 * comment is enough to change what some linters report — see the header
 * sensitivity section of RESULTS.md. Scoring the stripped copies measures hazard
 * detection; scoring the originals measures hazard detection plus comment
 * handling. We do both and publish the difference.
 */
function materializeStripped(cases) {
  rmSync(STRIPPED_DIR, { recursive: true, force: true });
  for (const c of cases) {
    const target = join(STRIPPED_DIR, c.rel.replace(/^bench\/corpus\//, ''));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(c.abs, 'utf8').replace(HEADER_RE, ''));
    c.stripped = target;
  }
}

function loadCorpus() {
  const files = walkSql(CORPUS_DIR);
  const cases = files.map((abs) => {
    const text = readFileSync(abs, 'utf8');
    const meta = parseHeader(text, abs);
    const rel = relative(REPO_DIR, abs).split(sep).join('/');
    const hazards = Array.isArray(meta.hazards) ? meta.hazards : [];
    return {
      id: meta.id,
      abs,
      rel,
      name: rel.split('/').pop(),
      category: meta.category,
      verdict: meta.verdict,
      hazards,
      primary: hazards[0] || null,
      handbook: meta.handbook || 'n/a',
      pg: meta.pg_version || DEFAULT_PG,
      safeAt: meta.safe_at || null,
      description: meta.description || '',
    };
  });

  const seen = new Set();
  for (const c of cases) {
    if (!c.id) throw new Error(`${c.rel}: header has no id`);
    if (seen.has(c.id)) throw new Error(`duplicate corpus id: ${c.id}`);
    seen.add(c.id);
    if (!['unsafe', 'safe', 'context', 'agent-flavored'].includes(c.category)) {
      throw new Error(`${c.rel}: unknown category "${c.category}"`);
    }
    if (!['dangerous', 'safe', 'context-dependent'].includes(c.verdict)) {
      throw new Error(`${c.rel}: unknown verdict "${c.verdict}"`);
    }
    if (c.verdict === 'dangerous' && c.hazards.length === 0) {
      throw new Error(`${c.rel}: verdict is dangerous but no hazards listed`);
    }
    if (c.verdict === 'safe' && c.hazards.length > 0) {
      throw new Error(`${c.rel}: verdict is safe but hazards are listed`);
    }
  }
  return cases;
}

// ---------------------------------------------------------------------------
// Rule classification
// ---------------------------------------------------------------------------

const ruleMap = JSON.parse(readFileSync(join(BENCH_DIR, 'rule-map.json'), 'utf8'));

/**
 * Classify one emitted rule id.
 *
 * bucket `hazard`   — names a structural production risk. The only bucket that
 *                     counts toward detection or false positives.
 * bucket `hygiene`  — session settings and re-runnability (lock_timeout,
 *                     statement_timeout, IF NOT EXISTS, ...).
 * bucket `advisory` — soft preferences (prefer-text-field, add an FK index,
 *                     column ordering). Real advice, not a production hazard.
 * bucket `info`     — the tool describing a statement it considers safe
 *                     ("brief ACCESS EXCLUSIVE metadata operation"). Counting
 *                     these as findings would manufacture false positives out
 *                     of a tool being informative.
 *
 * An unmapped rule is treated as a hazard, which is the conservative reading:
 * the tool said something substantive and we do not get to quietly discount it.
 */
function classify(tool, ruleId) {
  const entry = ruleMap.tools[tool]?.rules?.[ruleId];
  if (!entry) return { bucket: 'hazard', hazards: [], unmapped: true };
  return {
    bucket: entry.bucket,
    hazards: entry.hazards || [],
    unmapped: false,
  };
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

// Spawning npx portably is fiddlier than it should be. On Windows `npx` is a .cmd
// shim and Node 20+ refuses to spawn one without a shell (EINVAL); going through a
// shell then splits on spaces, which breaks any path containing one. Running npm's
// own npx-cli.js under this Node avoids both problems and the shell entirely.
const NPX_CLI = [
  join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  join(dirname(process.execPath), 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
].find((p) => existsSync(p));

function quoteArg(a) {
  return /[\s"]/.test(a) ? `"${String(a).replace(/"/g, '\\"')}"` : a;
}

function run(cmd, args, opts = {}) {
  let realCmd = cmd;
  let realArgs = args;
  let useShell = false;

  if (cmd === 'npx') {
    if (NPX_CLI) {
      realCmd = process.execPath;
      realArgs = [NPX_CLI, ...args];
    } else {
      // Fallback: let the shell find npx, quoting anything with whitespace.
      useShell = true;
      realArgs = args.map(quoteArg);
    }
  }

  const started = process.hrtime.bigint();
  const res = spawnSync(realCmd, realArgs, {
    cwd: REPO_DIR,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    shell: useShell,
    windowsHide: true,
    ...opts,
  });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { ...res, ms };
}

function npxSpec(tool) {
  if (OPTS.latest) {
    return tool === 'squawk' ? 'squawk-cli@latest' : '@flvmnt/pgfence@latest';
  }
  return PINNED[tool];
}

/** Wrap a JSON.parse so a tool printing prose instead of JSON is recorded, not fatal. */
function tryJson(stdout) {
  const text = (stdout || '').trim();
  if (!text) return { ok: false, reason: 'empty output' };
  const start = text.search(/[[{]/);
  if (start === -1) return { ok: false, reason: 'no JSON in output' };
  try {
    return { ok: true, value: JSON.parse(text.slice(start)) };
  } catch (err) {
    return { ok: false, reason: `unparseable JSON: ${err.message}` };
  }
}

// --- MigrationPilot ---------------------------------------------------------

function runMigrationPilot(cases, pathOf) {
  const out = new Map();
  for (const c of cases) {
    const res = run(process.execPath, [
      MP_CLI, 'analyze', pathOf(c),
      '--format', 'json',
      '--offline',
      '--pg-version', c.pg,
    ]);
    const parsed = tryJson(res.stdout);
    if (!parsed.ok) {
      out.set(c.rel, {
        status: 'unanalyzable',
        reason: parsed.reason,
        raw: (res.stdout || res.stderr || '').trim().split(/\r?\n/).slice(0, 3).join(' '),
        findings: [],
      });
      continue;
    }
    const report = parsed.value;
    const findings = (report.violations || []).map((v) => ({
      rule: v.ruleId,
      name: v.ruleName,
      severity: v.severity,
      message: v.message,
    }));
    out.set(c.rel, {
      status: 'ok',
      riskLevel: report.riskLevel,
      riskScore: report.riskScore,
      findings,
    });
  }
  return out;
}

// --- Squawk -----------------------------------------------------------------

function runSquawk(cases, pathOf) {
  const out = new Map();
  for (const c of cases) out.set(c.rel, { status: 'ok', findings: [] });

  // Squawk takes many paths at once and stamps each finding with its file, so
  // one invocation per PostgreSQL-version group is enough.
  for (const [pg, group] of groupByPg(cases)) {
    const res = run('npx', [
      '--yes', npxSpec('squawk'),
      '--reporter', 'json',
      '--pg-version', `${pg}.0`,
      ...group.map(pathOf),
    ]);
    const parsed = tryJson(res.stdout);
    if (!parsed.ok) {
      for (const c of group) {
        out.set(c.rel, {
          status: 'unanalyzable',
          reason: parsed.reason,
          raw: (res.stderr || '').trim().split(/\r?\n/).slice(0, 3).join(' '),
          findings: [],
        });
      }
      continue;
    }
    const byAbs = new Map(group.map((c) => [normalize(pathOf(c)), c.rel]));
    for (const f of parsed.value) {
      const rel = byAbs.get(normalize(f.file));
      if (!rel) continue;
      out.get(rel).findings.push({
        rule: f.rule_name,
        name: f.rule_name,
        severity: f.level,
        message: f.message,
      });
    }
    // Squawk reports a parse failure as a `syntax-error` finding rather than
    // by refusing the file, so surface that as unanalyzable for fairness.
    for (const c of group) {
      const rec = out.get(c.rel);
      if (rec.findings.some((f) => f.rule === 'syntax-error')) {
        rec.status = 'unanalyzable';
        rec.reason = 'syntax-error rule fired';
      }
    }
  }
  return out;
}

// --- pgfence ----------------------------------------------------------------

function runPgfence(cases, pathOf) {
  const out = new Map();
  for (const c of cases) out.set(c.rel, { status: 'ok', findings: [] });

  for (const [pg, group] of groupByPg(cases)) {
    const res = run('npx', [
      '--yes', npxSpec('pgfence'),
      'analyze',
      '--output', 'json',
      '--format', 'sql',
      '--min-pg-version', pg,
      ...group.map(pathOf),
    ]);
    const parsed = tryJson(res.stdout);
    if (!parsed.ok) {
      for (const c of group) {
        out.set(c.rel, {
          status: 'unanalyzable',
          reason: parsed.reason,
          raw: (res.stderr || '').trim().split(/\r?\n/).slice(0, 3).join(' '),
          findings: [],
        });
      }
      continue;
    }
    const byAbs = new Map(group.map((c) => [normalize(pathOf(c)), c.rel]));
    for (const r of parsed.value.results || []) {
      const rel = byAbs.get(normalize(r.filePath));
      if (!rel) continue;
      const rec = out.get(rel);
      for (const chk of r.checks || []) {
        rec.findings.push({
          rule: chk.ruleId || `risk:${chk.risk}`,
          name: chk.ruleId || '',
          severity: chk.risk,
          message: chk.message,
        });
      }
      for (const pv of r.policyViolations || []) {
        rec.findings.push({
          rule: pv.ruleId,
          name: pv.ruleId,
          severity: pv.severity,
          message: pv.message,
        });
      }
      if ((r.extractionWarnings || []).some((w) => w.unanalyzable)) {
        rec.status = 'unanalyzable';
        rec.reason = r.extractionWarnings.find((w) => w.unanalyzable).message;
      }
      rec.maxRisk = r.maxRisk;
    }
  }
  return out;
}

function normalize(p) {
  return String(p || '').replace(/\\/g, '/').toLowerCase();
}

function groupByPg(cases) {
  const groups = new Map();
  for (const c of cases) {
    if (!groups.has(c.pg)) groups.set(c.pg, []);
    groups.get(c.pg).push(c);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

function resolveVersions() {
  const versions = {};
  if (OPTS.tools.includes('mp')) {
    // `--version` prints a banner; the version itself is the first line.
    const res = run(process.execPath, [MP_CLI, '--version']);
    versions.migrationpilot = (res.stdout || '').trim().split(/\r?\n/)[0] || 'unknown';
  }
  if (OPTS.tools.includes('squawk')) {
    const res = run('npx', ['--yes', npxSpec('squawk'), '--version']);
    versions.squawk = (res.stdout || '').trim().replace(/^squawk\s+/, '') || 'unknown';
  }
  if (OPTS.tools.includes('pgfence')) {
    const res = run('npx', ['--yes', npxSpec('pgfence'), '--version']);
    versions.pgfence = (res.stdout || '').trim() || 'unknown';
  }
  return versions;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function score(cases, results, tool) {
  const per = new Map();

  for (const c of cases) {
    const rec = results.get(c.rel) || { status: 'missing', findings: [] };
    const classified = rec.findings.map((f) => ({ ...f, ...classify(tool, f.rule) }));
    const hazardFindings = classified.filter((f) => f.bucket === 'hazard');
    // Strict matching looks at every finding's hazard slugs regardless of bucket:
    // a hygiene rule that names the missing-lock-timeout hazard has still told the
    // user about it. Loose detection and false positives use the hazard bucket
    // only, so hygiene noise cannot inflate either.
    const detected = new Set(classified.flatMap((f) => f.hazards));

    per.set(c.id, {
      id: c.id,
      file: c.rel,
      category: c.category,
      verdict: c.verdict,
      status: rec.status,
      reason: rec.reason || null,
      expected: c.hazards,
      primary: c.primary,
      // strict: the file's primary hazard was named
      strict: c.primary ? detected.has(c.primary) : null,
      // matched: which of the expected hazards were named
      matched: c.hazards.filter((h) => detected.has(h)),
      // loose: the tool said *something* structural about this file
      loose: hazardFindings.length > 0,
      hazardRules: [...new Set(hazardFindings.map((f) => f.rule))].sort(),
      hygieneRules: [...new Set(classified.filter((f) => f.bucket === 'hygiene').map((f) => f.rule))].sort(),
      advisoryRules: [...new Set(classified.filter((f) => f.bucket === 'advisory').map((f) => f.rule))].sort(),
      infoRules: [...new Set(classified.filter((f) => f.bucket === 'info').map((f) => f.rule))].sort(),
      unmappedRules: [...new Set(classified.filter((f) => f.unmapped).map((f) => f.rule))].sort(),
      counts: {
        hazard: hazardFindings.length,
        hygiene: classified.filter((f) => f.bucket === 'hygiene').length,
        advisory: classified.filter((f) => f.bucket === 'advisory').length,
        info: classified.filter((f) => f.bucket === 'info').length,
        total: classified.length,
      },
    });
  }

  const dangerous = cases.filter((c) => c.verdict === 'dangerous');
  const safe = cases.filter((c) => c.verdict === 'safe');

  const strictHits = dangerous.filter((c) => per.get(c.id).strict).length;
  const looseHits = dangerous.filter((c) => per.get(c.id).loose).length;
  const fps = safe.filter((c) => per.get(c.id).loose);

  // Per-hazard recall over every (file, hazard) pair the corpus asserts.
  const hazardPairs = new Map();
  for (const c of dangerous) {
    for (const h of c.hazards) {
      if (!hazardPairs.has(h)) hazardPairs.set(h, { total: 0, hit: 0, misses: [] });
      const bucket = hazardPairs.get(h);
      bucket.total += 1;
      if (per.get(c.id).matched.includes(h)) bucket.hit += 1;
      else bucket.misses.push(c.id);
    }
  }

  const unanalyzable = cases.filter((c) => per.get(c.id).status === 'unanalyzable');

  return {
    tool,
    per,
    totals: {
      dangerous: dangerous.length,
      safe: safe.length,
      strictHits,
      looseHits,
      strictRate: dangerous.length ? strictHits / dangerous.length : 0,
      looseRate: dangerous.length ? looseHits / dangerous.length : 0,
      falsePositives: fps.length,
      fpRate: safe.length ? fps.length / safe.length : 0,
      fpFiles: fps.map((c) => c.id),
      unanalyzable: unanalyzable.length,
      unanalyzableFiles: unanalyzable.map((c) => c.id),
    },
    hazardRecall: hazardPairs,
  };
}

// ---------------------------------------------------------------------------
// Throughput
// ---------------------------------------------------------------------------

function measureThroughput(cases) {
  const paths = cases.map((c) => c.stripped);
  const n = paths.length;
  const timings = {};
  const RUNS = 3;

  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  if (OPTS.tools.includes('mp')) {
    // `analyze` takes exactly one file, so a directory sweep is N processes.
    // That is the honest cost of running MigrationPilot file-by-file.
    const perFile = [];
    for (let i = 0; i < RUNS; i++) {
      const started = process.hrtime.bigint();
      for (const c of cases) {
        run(process.execPath, [MP_CLI, 'analyze', c.stripped, '--format', 'json', '--offline', '--pg-version', c.pg]);
      }
      perFile.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
    timings.migrationpilot = { mode: 'per-file (analyze)', ms: median(perFile), per100: (median(perFile) / n) * 100 };

    // `check <dir>` is the batch entry point.
    const batch = [];
    for (let i = 0; i < RUNS; i++) {
      const res = run(process.execPath, [MP_CLI, 'check', STRIPPED_DIR, '--pattern', '**/*.sql', '--format', 'json', '--offline']);
      batch.push(res.ms);
    }
    const probe = run(process.execPath, [MP_CLI, 'check', STRIPPED_DIR, '--pattern', '**/*.sql', '--format', 'json', '--offline']);
    timings.migrationpilot_batch = {
      mode: 'batch (check <dir>)',
      ms: median(batch),
      per100: (median(batch) / n) * 100,
      ok: tryJson(probe.stdout).ok,
    };
  }

  for (const [tool, args] of [
    ['squawk', ['--yes', npxSpec('squawk'), '--reporter', 'json', '--pg-version', `${DEFAULT_PG}.0`]],
    ['pgfence', ['--yes', npxSpec('pgfence'), 'analyze', '--output', 'json', '--format', 'sql', '--min-pg-version', DEFAULT_PG]],
  ]) {
    if (!OPTS.tools.includes(tool)) continue;
    run('npx', [...args, ...paths]); // warm npx + filesystem cache; not timed
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(run('npx', [...args, ...paths]).ms);
    timings[tool] = { mode: 'batch (one invocation)', ms: median(runs), per100: (median(runs) / n) * 100 };
  }

  return { fileCount: n, runs: RUNS, timings, note: 'median of 3 warm runs; npx resolution excluded by a prior warm-up call' };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const TOOL_LABEL = { mp: 'MigrationPilot', squawk: 'Squawk', pgfence: 'pgfence' };

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function fraction(hit, total) {
  return total ? `${hit}/${total} (${pct(hit / total)})` : 'n/a';
}

function renderResults({ cases, scores, versions, throughput, headerSensitivity, atlas, generatedAt }) {
  const tools = OPTS.tools.filter((t) => scores[t]);
  const L = [];
  const p = (s = '') => L.push(s);

  const byCategory = (cat) => cases.filter((c) => c.category === cat);
  const dangerous = cases.filter((c) => c.verdict === 'dangerous');
  const safe = cases.filter((c) => c.verdict === 'safe');
  const context = cases.filter((c) => c.verdict === 'context-dependent');

  p('# The agent-migration safety benchmark');
  p();
  p('<!-- Generated by bench/run.mjs. Do not edit by hand; your changes will be overwritten. -->');
  p();
  p(`Generated **${generatedAt}** from ${cases.length} labelled migration files.`);
  p();
  p('Reproduce it with one command:');
  p();
  p('```bash');
  p('node bench/run.mjs');
  p('```');
  p();
  p('---');
  p();

  // ---- Methodology --------------------------------------------------------
  p('## What this measures');
  p();
  p('Coding agents write migrations now, and they write them the way they write');
  p('everything else: confidently, verbosely, and without having watched a table lock');
  p('up at 3am. This benchmark asks a narrow question — when a migration contains a');
  p('known PostgreSQL hazard, does the linter say so, and does it stay quiet when the');
  p('migration is fine?');
  p();
  p('It is built and published by the authors of MigrationPilot. That is a conflict of');
  p('interest, so everything that could be used to rig the result is written down:');
  p();
  p('- **The corpus is derived from [the handbook](../docs/handbook/README.md), not from our rule list.** Each');
  p('  file cites the handbook entry (`MPH-0xx`) whose hazard it exhibits. Hazards we do');
  p('  not catch stay in the corpus and are reported as our misses, below.');
  p('- **Ground truth lives in the files.** Every `.sql` file opens with a YAML header');
  p('  naming its category, its verdict, and the hazards it contains. Change a label and');
  p('  the diff shows it.');
  p('- **Rule classification lives in [`rule-map.json`](rule-map.json).** Every rule id any tool emitted is');
  p('  classified there, with the reasoning, before it is scored.');
  p('- **Nothing is excluded silently.** Files a tool could not parse are counted and');
  p('  named. Rules that fired but are not in the map are counted and named.');
  p();

  p('### The three buckets');
  p();
  p('All three tools emit findings that are not about a hazard at all. Counting');
  p('"missing `statement_timeout`" as a hazard detection would let every tool score 100%');
  p('on every file, and counting it as a false positive on a safe file would push every');
  p('tool to a 100% false-positive rate. Both numbers would be theatre. So each emitted');
  p('rule is placed in one of three buckets:');
  p();
  p('| Bucket | Contains | Scored? |');
  p('|---|---|---|');
  p('| `hazard` | Rules naming a structural production risk — non-concurrent index, table rewrite, blocking scan, blast radius | **Yes** |');
  p('| `hygiene` | Session settings and re-runnability — `lock_timeout`, `statement_timeout`, `IF NOT EXISTS`, `application_name` | No, reported only |');
  p('| `advisory` | Soft preferences — `prefer-bigint-over-int`, "add an index on the referencing column", column ordering | No, reported only |');
  p('| `info` | The tool describing a statement it considers *safe* — "brief ACCESS EXCLUSIVE metadata operation". pgfence emits these by design | No, reported only |');
  p();
  p('The `info` bucket matters for fairness. pgfence reports on every statement it');
  p('understands, including the safe ones, so treating each of its outputs as a finding');
  p('would invent false positives out of a tool being thorough. A LOW-risk pgfence entry');
  p('whose message says the operation is brief or non-blocking is not the tool objecting.');
  p();
  p('Safe-category files set `lock_timeout` and `statement_timeout` explicitly, exactly as');
  p('the handbook\'s safe SQL does, so hygiene rules mostly have nothing to say about them');
  p('anyway. An unmapped rule is scored **as a hazard**, which is the conservative choice:');
  p('a tool does not get quietly discounted for saying something we failed to categorise.');
  p();

  p('### The three metrics');
  p();
  p('- **Strict detection** — on a dangerous file, did the tool name *the specific hazard*');
  p('  the file was written to contain? This is the demanding number and the headline one.');
  p('- **Loose detection** — did the tool emit any `hazard`-bucket finding on that file at');
  p('  all, even for a different reason? A tool that flags the file for the wrong reason');
  p('  still stops the merge, so this is worth knowing. It needs almost no rule mapping,');
  p('  which makes it the hardest number to rig.');
  p('- **False-positive rate** — on a file whose verdict is `safe`, did the tool emit any');
  p('  `hazard`-bucket finding? These files are the handbook\'s own recommended patterns.');
  p('  A flag here is a tool telling you not to do the correct thing.');
  p();
  p('Context-dependent files are **not scored in either direction**. They contain a real');
  p('hazard that is harmless at the stated scale, and no static analyser can tell the');
  p('difference without table statistics. Their results are reported as a separate table');
  p('so you can see how each tool leans.');
  p();

  // ---- Setup --------------------------------------------------------------
  p('## Versions and setup');
  p();
  p('| Tool | Version | Invocation |');
  p('|---|---|---|');
  if (versions.migrationpilot) {
    p(`| MigrationPilot | \`${versions.migrationpilot}\` | \`node dist/cli.cjs analyze <file> --format json --offline --pg-version <v>\` |`);
  }
  if (versions.squawk) {
    p(`| Squawk | \`${versions.squawk}\` | \`npx ${PINNED.squawk} --reporter json --pg-version <v>.0 <files...>\` |`);
  }
  if (versions.pgfence) {
    p(`| pgfence | \`${versions.pgfence}\` | \`npx ${PINNED.pgfence} analyze --output json --format sql --min-pg-version <v> <files...>\` |`);
  }
  p();
  p(`Every tool targets PostgreSQL **${DEFAULT_PG}** except on the one corpus file that`);
  p('declares `pg_version: "18"` in its header, where all three are told 18. All three run');
  p('with their **default rule sets** — no rules enabled, disabled, or configured. That is');
  p('what a team gets on the day they install the tool, and it is the only configuration');
  p('that is comparable across three products with different opinions about defaults.');
  p();
  p(`Platform: \`${process.platform}\`, Node \`${process.version}\`.`);
  p();

  // ---- Atlas --------------------------------------------------------------
  p('### Why Atlas is not in the table');
  p();
  p(atlas.body);
  p();

  // ---- Corpus -------------------------------------------------------------
  p('## The corpus');
  p();
  p('| Category | Files | Verdict | What it tests |');
  p('|---|---:|---|---|');
  p(`| \`unsafe/\` | ${byCategory('unsafe').length} | dangerous | One primary named hazard per file, drawn from handbook entries MPH-001 to MPH-020 |`);
  p(`| \`safe/\` | ${byCategory('safe').length} | safe | The handbook's own safe SQL — expand/contract, \`NOT VALID\`, \`CONCURRENTLY\`. False-positive bait |`);
  p(`| \`context/\` | ${byCategory('context').length} | context-dependent | Real hazards that are harmless at the stated scale. Unscored |`);
  p(`| \`agent-flavored/\` | ${byCategory('agent-flavored').length} | ${byCategory('agent-flavored').filter((c) => c.verdict === 'dangerous').length} dangerous, ${byCategory('agent-flavored').filter((c) => c.verdict === 'safe').length} safe | Multi-statement migrations in the register coding agents actually emit |`);
  p(`| **Total** | **${cases.length}** | ${dangerous.length} dangerous, ${safe.length} safe, ${context.length} context | |`);
  p();
  p(`The ${dangerous.length} dangerous files assert ${dangerous.reduce((n, c) => n + c.hazards.length, 0)} (file, hazard) pairs across ${new Set(dangerous.flatMap((c) => c.hazards)).size} distinct hazard classes.`);
  p();

  // ---- Headline -----------------------------------------------------------
  p('## Results');
  p();
  p('### Headline');
  p();
  p('| Tool | Strict detection | Loose detection | False positives | Coverage gaps |');
  p('|---|---|---|---|---|');
  for (const t of tools) {
    const s = scores[t].totals;
    p(`| ${TOOL_LABEL[t]} | ${fraction(s.strictHits, s.dangerous)} | ${fraction(s.looseHits, s.dangerous)} | ${fraction(s.falsePositives, s.safe)} | ${s.unanalyzable}/${cases.length} |`);
  }
  p();
  p('Strict and loose detection are over the dangerous files (`unsafe/` plus the dangerous');
  p('`agent-flavored/` ones). False positives are over the safe files. Coverage gaps are');
  p('files the tool could not fully parse. Lower is better in the last two columns.');
  p();
  // Everything in the summary below is computed, so it cannot drift from the table.
  const ranked = [...tools].sort((a, b) => scores[b].totals.strictRate - scores[a].totals.strictRate);
  const best = ranked[0];
  const quietest = [...tools].sort((a, b) => scores[a].totals.fpRate - scores[b].totals.fpRate)[0];
  p(`The short version: **${TOOL_LABEL[best]}** finds the most (${pct(scores[best].totals.strictRate)} strict) and`);
  p(`**${TOOL_LABEL[quietest]}** is the quietest (${pct(scores[quietest].totals.fpRate)} false positives).`);
  if (best !== quietest) {
    p(`Those are not the same tool, and that is the whole trade-off: ${TOOL_LABEL[best]} raises`);
    p(`${scores[best].totals.falsePositives} flags on correct SQL to ${TOOL_LABEL[quietest]}'s ${scores[quietest].totals.falsePositives}.`);
    p('Whether the extra detection is worth the extra noise depends on whether your team keeps');
    p('reading the output after the fourth wrong flag.');
  }
  {
    // If one rule dominates a tool's false positives, that is a fixable bug rather
    // than a philosophy, and it is worth saying so out loud.
    const counts = new Map();
    for (const id of scores[best].totals.fpFiles) {
      for (const r of scores[best].per.get(id).hazardRules) counts.set(r, (counts.get(r) || 0) + 1);
    }
    const [topRule, topCount] = [...counts].sort((a, b) => b[1] - a[1])[0] || [];
    const totalFp = scores[best].totals.falsePositives;
    if (topCount && totalFp > 1 && topCount / totalFp >= 0.5) {
      p();
      p(`${topCount} of ${TOOL_LABEL[best]}'s ${totalFp} false positives come from one rule (\`${topRule}\`),`);
      p('which makes this a fixable problem rather than a philosophical one — see the defects');
      p('section.');
    }
  }
  p();

  // ---- Per-hazard ---------------------------------------------------------
  p('### Per-hazard breakdown');
  p();
  p('Each row is one hazard class and shows how many of the (file, hazard) pairs asserting');
  p('it each tool named. A blank cell means the hazard does not appear in that many files.');
  p();
  const allHazards = [...new Set(dangerous.flatMap((c) => c.hazards))].sort();
  p(`| Hazard | Handbook | Files | ${tools.map((t) => TOOL_LABEL[t]).join(' | ')} |`);
  p(`|---|---|---:|${tools.map(() => '---').join('|')}|`);
  for (const h of allHazards) {
    const files = dangerous.filter((c) => c.hazards.includes(h));
    // Cite the handbook entry from the single-hazard `unsafe/` file that owns this
    // hazard, not from every agent file that happens to include it as well.
    const owner = files.find((c) => c.category === 'unsafe' && c.primary === h)
      || files.find((c) => c.primary === h)
      || files[0];
    const idx = owner.hazards.indexOf(h);
    const refs = owner.handbook.split(',').map((s) => s.trim());
    const entries = refs[idx] || refs[0];
    const cells = tools.map((t) => {
      const r = scores[t].hazardRecall.get(h);
      if (!r) return '—';
      const mark = r.hit === r.total ? '✅' : r.hit === 0 ? '❌' : '⚠️';
      return `${mark} ${r.hit}/${r.total}`;
    });
    p(`| \`${h}\` | ${entries} | ${files.length} | ${cells.join(' | ')} |`);
  }
  p();
  p('✅ every file naming this hazard was caught · ⚠️ some · ❌ none.');
  p();

  // ---- Category -----------------------------------------------------------
  p('### By category');
  p();
  p(`| Category | Files | ${tools.map((t) => `${TOOL_LABEL[t]} strict`).join(' | ')} |`);
  p(`|---|---:|${tools.map(() => '---').join('|')}|`);
  for (const cat of ['unsafe', 'agent-flavored']) {
    const group = cases.filter((c) => c.category === cat && c.verdict === 'dangerous');
    const cells = tools.map((t) => {
      const hit = group.filter((c) => scores[t].per.get(c.id).strict).length;
      return fraction(hit, group.length);
    });
    p(`| \`${cat}/\` (dangerous) | ${group.length} | ${cells.join(' | ')} |`);
  }
  for (const cat of ['safe', 'agent-flavored']) {
    const group = cases.filter((c) => c.category === cat && c.verdict === 'safe');
    if (!group.length) continue;
    const cells = tools.map((t) => {
      const clean = group.filter((c) => !scores[t].per.get(c.id).loose).length;
      return fraction(clean, group.length);
    });
    p(`| \`${cat}/\` (safe — clean runs) | ${group.length} | ${cells.join(' | ')} |`);
  }
  p();

  // ---- False positives ----------------------------------------------------
  p('### False positives, named');
  p();
  p('Every flag raised on a file whose verdict is `safe`. These are the handbook\'s own');
  p('recommended patterns, so each of these is a tool arguing against correct SQL.');
  p();
  let anyFp = false;
  for (const t of tools) {
    const fpIds = scores[t].totals.fpFiles;
    if (!fpIds.length) {
      p(`**${TOOL_LABEL[t]}** — none.`);
      p();
      continue;
    }
    anyFp = true;
    p(`**${TOOL_LABEL[t]}**`);
    p();
    p('| File | Rules fired |');
    p('|---|---|');
    for (const id of fpIds) {
      const rec = scores[t].per.get(id);
      p(`| \`${rec.file.replace('bench/corpus/', '')}\` | ${rec.hazardRules.map((r) => `\`${r}\``).join(', ')} |`);
    }
    p();
  }
  if (!anyFp) p('_No tool raised a hazard finding on any safe file._\n');

  // ---- Context ------------------------------------------------------------
  p('### Context-dependent files (unscored)');
  p();
  p('These contain a genuine hazard that is harmless at the stated scale. Flagging them is');
  p('defensible; so is staying quiet. The table shows how each tool leans, and nothing here');
  p('counts for or against anyone.');
  p();
  p(`| File | Hazard | Safe when | ${tools.map((t) => TOOL_LABEL[t]).join(' | ')} |`);
  p(`|---|---|---|${tools.map(() => '---').join('|')}|`);
  const SAFE_AT_LABEL = {
    small: 'the table is small',
    empty: 'the table is empty or brand new',
    any: 'always — the statement shape only looks dangerous',
    unreferenced: 'nothing references the column',
  };
  for (const c of context) {
    const cells = tools.map((t) => (scores[t].per.get(c.id).loose ? 'flags' : 'quiet'));
    p(`| \`${c.name}\` | \`${c.hazards.join(', ')}\` | ${SAFE_AT_LABEL[c.safeAt] || c.safeAt || '—'} | ${cells.join(' | ')} |`);
  }
  p();

  // ---- Misses -------------------------------------------------------------
  p('## What MigrationPilot missed');
  p();
  p('The point of building this was to find our own gaps, so they go here rather than in a');
  p('footnote. A hazard we do not catch stays in the corpus.');
  p();
  if (scores.mp) {
    const misses = dangerous
      .map((c) => ({ c, rec: scores.mp.per.get(c.id) }))
      .filter(({ c, rec }) => c.hazards.some((h) => !rec.matched.includes(h)));
    if (!misses.length) {
      p('_MigrationPilot named every asserted hazard in this corpus._');
      p();
    } else {
      p('| File | Hazard missed | Handbook | Caught by |');
      p('|---|---|---|---|');
      for (const { c, rec } of misses) {
        for (const h of c.hazards) {
          if (rec.matched.includes(h)) continue;
          const others = tools
            .filter((t) => t !== 'mp' && scores[t].per.get(c.id).matched.includes(h))
            .map((t) => TOOL_LABEL[t]);
          p(`| \`${c.name}\` | \`${h}\` | ${c.handbook} | ${others.length ? others.join(', ') : '_nobody_'} |`);
        }
      }
      p();
    }

    const rivalWins = [];
    for (const t of tools) {
      if (t === 'mp') continue;
      for (const c of dangerous) {
        const mine = scores.mp.per.get(c.id);
        const theirs = scores[t].per.get(c.id);
        for (const h of theirs.matched) {
          if (!mine.matched.includes(h)) rivalWins.push({ tool: TOOL_LABEL[t], file: c.name, hazard: h });
        }
      }
    }
    if (rivalWins.length) {
      p('### Rule gaps a competitor closed and we did not');
      p();
      p('| Hazard | File | Named by |');
      p('|---|---|---|');
      for (const w of rivalWins) p(`| \`${w.hazard}\` | \`${w.file}\` | ${w.tool} |`);
      p();
    }
  }

  // ---- Hand-written findings ----------------------------------------------
  p('## Defects this benchmark surfaced');
  p();
  p('The tables above are generated. This section is not — it is written by hand from');
  p('the run, and every item has a command you can run to see it yourself. Most of it is');
  p('about MigrationPilot, because that is the tool we can actually fix.');
  p();
  for (const d of DEFECTS) {
    p(`### ${d.title}`);
    p();
    p(d.body);
    p();
    if (d.repro) {
      p('```console');
      p(d.repro);
      p('```');
      p();
    }
  }

  // ---- Parse failures -----------------------------------------------------
  const anyUnanalyzable = tools.some((t) => scores[t].totals.unanalyzable > 0);
  if (anyUnanalyzable) {
    p('## Coverage gaps');
    p();
    p('A file a linter cannot read is a file it cannot protect you from. How each tool');
    p('behaves when it hits one is part of the result — and the three of them behave');
    p('differently enough that it is worth its own table.');
    p();
    p('"Reported in-band" means the tool told you about the gap **inside its own output');
    p('format**, so a CI job parsing the JSON can see it. A tool that prints a prose error');
    p('to stdout and exits 0 has not reported anything a pipeline can act on.');
    p();
    p('| Tool | File | What happened | Reported in-band | Still produced findings |');
    p('|---|---|---|---|---|');
    for (const t of tools) {
      for (const id of scores[t].totals.unanalyzableFiles) {
        const rec = scores[t].per.get(id);
        const inBand = rec.reason && !/JSON|empty output|no JSON/i.test(rec.reason) ? 'yes' : '**no**';
        const partial = rec.counts.total > 0 ? `yes, ${rec.counts.total} partial` : 'no';
        p(`| ${TOOL_LABEL[t]} | \`${rec.file.replace('bench/corpus/', '')}\` | ${rec.reason || 'unknown'} | ${inBand} | ${partial} |`);
      }
    }
    p();
    p('Two distinct failures are visible here.');
    p();
    p('**The PostgreSQL 18 `NOT NULL NOT VALID` syntax** (`safe/s03`) is rejected by both');
    p('MigrationPilot and pgfence, which both parse with a PostgreSQL 17 grammar. Squawk');
    p('parses it. This is worse for MigrationPilot than for pgfence, because MigrationPilot');
    p('*emits* that syntax as its own suggested fix on PostgreSQL 18 — so it recommends SQL');
    p('it cannot then analyse.');
    p();
    p('**Dollar-quoted function bodies** (`safe/s09`, `safe/s10`) defeat pgfence, which');
    p('flags them as an unanalyzable dynamic SQL block and continues with reduced coverage.');
    p('It says so in the JSON and reports a coverage percentage, which is the right');
    p('behaviour even though the gap is real — the two expand/contract sync triggers in this');
    p('corpus are exactly where an ORM-oriented linter would want to look.');
    p();
  }

  // ---- Header sensitivity -------------------------------------------------
  p('## Leading-comment sensitivity');
  p();
  p('Every corpus file opens with a YAML header in a `/* ... */` block, which is how the');
  p('ground truth stays next to the SQL. That header is benchmark scaffolding, not part of');
  p('the migration, so the scored run uses copies with it stripped.');
  p();
  p('Running both versions turned out to be worth doing on its own. Real migrations open');
  p('with a comment far more often than not — a ticket reference, a description, a');
  p('framework banner — so a linter that changes its mind when one is present is a linter');
  p('that goes quiet on the files people actually write.');
  p();
  p('| Tool | Files whose findings changed | Strict detection without header | With header |');
  p('|---|---:|---|---|');
  for (const t of tools) {
    const h = headerSensitivity[t];
    p(`| ${TOOL_LABEL[t]} | ${h.changedFiles} | ${fraction(h.strictWithout, scores[t].totals.dangerous)} | ${fraction(h.strictWith, scores[t].totals.dangerous)} |`);
  }
  p();
  const sensitive = tools.filter((t) => headerSensitivity[t].changedFiles > 0);
  if (!sensitive.length) {
    p('No tool changed its findings because of a leading comment.');
    p();
  } else {
    for (const t of sensitive) {
      p(`**${TOOL_LABEL[t]}** — rules that stopped firing once a comment was added above the SQL:`);
      p();
      p('| File | Rules lost | Rules gained |');
      p('|---|---|---|');
      for (const d of headerSensitivity[t].diffs) {
        p(`| \`${d.file.replace('bench/corpus/', '')}\` | ${d.lost.map((r) => `\`${r}\``).join(', ') || '—'} | ${d.gained.map((r) => `\`${r}\``).join(', ') || '—'} |`);
      }
      p();
    }
  }

  // ---- Throughput ---------------------------------------------------------
  if (throughput) {
    p('## Throughput');
    p();
    p(`Median of ${throughput.runs} warm runs over ${throughput.fileCount} files, normalised to 100 files.`);
    p('The npx package-resolution cost is excluded by an untimed warm-up call, so this is');
    p('analysis time rather than download time.');
    p();
    p('| Tool | Mode | Wall clock | Per 100 files |');
    p('|---|---|---:|---:|');
    for (const [key, t] of Object.entries(throughput.timings)) {
      const label = key.startsWith('migrationpilot') ? 'MigrationPilot' : TOOL_LABEL[key] || key;
      // A run that bailed out early is fast for the wrong reason. Say so in the row
      // rather than only in a note underneath, where it is easy to skim past.
      const aborted = t.ok === false;
      const wall = aborted ? `${t.ms.toFixed(0)} ms ⚠️` : `${t.ms.toFixed(0)} ms`;
      const per100 = aborted ? '_aborted, not comparable_' : `${t.per100.toFixed(0)} ms`;
      p(`| ${label} | ${t.mode} | ${wall} | ${per100} |`);
    }
    p();
    p('`migrationpilot analyze` accepts exactly one file per invocation, so sweeping a');
    p('directory that way costs one Node process per file. `migrationpilot check <dir>` is');
    p('the batch entry point and is the fair comparison against Squawk and pgfence, both of');
    p('which take a list of paths.');
    if (throughput.timings.migrationpilot_batch && !throughput.timings.migrationpilot_batch.ok) {
      p();
      p('> **The batch figure is not a throughput result.** `migrationpilot check` stopped at');
      p('> the first file it could not parse and returned no JSON at all, so it never analysed');
      p('> most of the corpus. The elapsed time is real and the work behind it is not. Read the');
      const mine = throughput.timings.migrationpilot?.per100;
      const rival = throughput.timings.squawk?.per100 || throughput.timings.pgfence?.per100;
      const ratio = mine && rival ? ` — about ${(mine / rival).toFixed(1)}x the fastest competitor here` : '';
      p(`> per-file row as MigrationPilot's actual cost${ratio}. One Node process per migration`);
      p('> is the reason, and a batch mode that survives a bad file would fix both problems at once.');
    }
    p();
  }

  // ---- Rule map -----------------------------------------------------------
  p('## Rule classification');
  p();
  p('Counts of rules actually emitted during this run, by bucket. The full mapping is in');
  p('[`rule-map.json`](rule-map.json).');
  p();
  p('| Tool | Hazard rules fired | Hygiene | Advisory | Info | Unmapped |');
  p('|---|---:|---:|---:|---:|---:|');
  for (const t of tools) {
    const all = [...scores[t].per.values()];
    const uniq = (k) => new Set(all.flatMap((r) => r[k])).size;
    p(`| ${TOOL_LABEL[t]} | ${uniq('hazardRules')} | ${uniq('hygieneRules')} | ${uniq('advisoryRules')} | ${uniq('infoRules')} | ${uniq('unmappedRules')} |`);
  }
  p();
  const unmappedAll = tools.flatMap((t) =>
    [...new Set([...scores[t].per.values()].flatMap((r) => r.unmappedRules))].map((r) => `${TOOL_LABEL[t]}: \`${r}\``),
  );
  if (unmappedAll.length) {
    p('Rules that fired but are not in the map (scored as hazards):');
    p();
    for (const u of unmappedAll) p(`- ${u}`);
    p();
  } else {
    p('Every rule that fired in this run is classified in the map.');
    p();
  }

  // ---- Per-file appendix --------------------------------------------------
  p('## Appendix: every file, every tool');
  p();
  p(`| File | Verdict | Expected hazards | ${tools.map((t) => TOOL_LABEL[t]).join(' | ')} |`);
  p(`|---|---|---|${tools.map(() => '---').join('|')}|`);
  for (const c of cases) {
    const cells = tools.map((t) => {
      const rec = scores[t].per.get(c.id);
      if (rec.status === 'unanalyzable') return '🚫 unparsed';
      if (c.verdict === 'safe') {
        return rec.loose ? `⚠️ ${rec.counts.hazard} ${rec.counts.hazard === 1 ? 'flag' : 'flags'}` : '✅ clean';
      }
      if (c.verdict === 'context-dependent') return rec.loose ? 'flags' : 'quiet';
      if (rec.strict) return rec.matched.length === c.hazards.length ? '✅ all' : `⚠️ ${rec.matched.length}/${c.hazards.length}`;
      return rec.loose ? '⚠️ other' : '❌ miss';
    });
    p(`| \`${c.rel.replace('bench/corpus/', '')}\` | ${c.verdict} | ${c.hazards.map((h) => `\`${h}\``).join(', ') || '—'} | ${cells.join(' | ')} |`);
  }
  p();
  p('✅ hit · ⚠️ partial or flagged for another reason · ❌ missed · 🚫 file could not be parsed');
  p();
  p('---');
  p();
  p('Raw per-file findings, including every rule id and message, are in');
  p('[`results.json`](results.json), regenerated alongside this file.');
  p();

  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Atlas
// ---------------------------------------------------------------------------

// Hand-written findings from reading the run. Each one is reproducible with the
// command underneath it. These are not derived from the tables above; they are the
// things the tables made visible.
const DEFECTS = [
  {
    title: 'MigrationPilot: a leading comment switches off transaction analysis',
    body: [
      'Three rules — MP008 (multiple DDL in one transaction), MP012 and MP054 (enum value',
      'added and used in one transaction) and MP025 (CONCURRENTLY inside a transaction) —',
      'stop firing when any comment appears above the `BEGIN`. A `--` line comment does it',
      'just as well as a `/* */` block, so this is not about the comment style.',
      '',
      'This is the most consequential thing in the run. Migrations open with a comment far',
      'more often than not, and coding agents in particular narrate every file they write.',
      'Squawk and pgfence show no change at all on the same pair of corpora.',
    ].join('\n'),
    repro: [
      '$ printf \'BEGIN;\\nCREATE INDEX CONCURRENTLY i ON t (c);\\nCOMMIT;\\n\' > a.sql',
      '$ printf -- \'-- add an index\\nBEGIN;\\nCREATE INDEX CONCURRENTLY i ON t (c);\\nCOMMIT;\\n\' > b.sql',
      '$ migrationpilot analyze a.sql --quiet   # MP025 fires',
      '$ migrationpilot analyze b.sql --quiet   # MP025 does not',
    ].join('\n'),
  },
  {
    title: 'MigrationPilot: MP058 argues against the handbook',
    body: [
      'MP058 asks you to combine separate `ALTER TABLE` statements on one table into a',
      'single statement with multiple subcommands. On four of the five files where',
      'MigrationPilot raised a false positive, that advice is wrong and following it would',
      'break the migration:',
      '',
      '- `safe/s02` — combining step 4 (`SET NOT NULL`) with step 5 (`DROP CONSTRAINT`)',
      '  brings the full table scan back. Handbook MPH-003 says so explicitly, quoting the',
      '  manual: the `CHECK` must not be "dropped in the same command".',
      '- `safe/s05`, `safe/s11`, `agent-flavored/a08` — `ADD CONSTRAINT ... NOT VALID` and',
      '  `VALIDATE CONSTRAINT` *cannot* be combined. Splitting them is the entire point of',
      '  the pattern.',
      '',
      'MP058 should not fire when the statements it wants merged are a `NOT VALID` /',
      '`VALIDATE` pair, or a `SET NOT NULL` following a validated `CHECK`.',
    ].join('\n'),
    repro: '$ migrationpilot analyze bench/corpus/safe/s02-not-null-via-valid-check.sql --quiet',
  },
  {
    title: 'MigrationPilot: MP003 reports the opposite of the manual',
    body: [
      'On `ALTER TABLE orders ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid()`,',
      'MP003 fires — correctly — and then says:',
      '',
      '> ADD COLUMN with volatile default "random()" on "orders". On PG 17, this evaluates',
      '> per-row at read time (no rewrite), but may cause unexpected behavior for existing rows.',
      '',
      'Two things are wrong. The function is `gen_random_uuid()`, not `random()`. And the',
      'claim that there is no rewrite contradicts the ALTER TABLE manual, which handbook',
      'MPH-006 quotes: adding a column with a volatile `DEFAULT` "will cause the entire table',
      'and its indexes to be rewritten". The severity is `warning`, where a full rewrite under',
      '`ACCESS EXCLUSIVE` warrants `critical`.',
      '',
      'pgfence gets this one right: `add-column-non-constant-default`, HIGH, "causes table',
      'rewrite under ACCESS EXCLUSIVE lock".',
      '',
      'The rule is credited as a detection in the tables above, because it does fire on the',
      'right statement. The message is still wrong and a reader who believes it will ship the',
      'migration.',
    ].join('\n'),
    repro: '$ migrationpilot analyze bench/corpus/unsafe/u06-add-column-volatile-default.sql --quiet',
  },
  {
    title: 'MigrationPilot: the comment bug is not hypothetical — it eats a whole agent file',
    body: [
      '`unsafe/u11` and `agent-flavored/a02` contain the same hazard: an enum value added and',
      'then used inside one transaction. MP012 and MP054 both fire on u11. Neither fires on a02,',
      'and a02 is the file that looks like something an agent would actually commit.',
      '',
      'The difference is four lines of explanatory comment above the `BEGIN`. `ADD VALUE IF NOT',
      'EXISTS` was the first suspect and it is innocent — the rules fire fine with it. Adding',
      'a02\'s comment header to the otherwise-identical file is what silences them.',
      '',
      'This is the defect above, observed on a realistic file rather than a constructed one.',
      'It is here separately because it shows the size of the blast radius: the corpus file most',
      'representative of real agent output loses its entire primary finding.',
    ].join('\n'),
    repro: [
      '$ migrationpilot analyze bench/corpus/unsafe/u11-enum-add-value-in-transaction.sql --quiet',
      '  MP012, MP054 fire',
      '$ migrationpilot analyze bench/corpus/agent-flavored/a02-order-status-enum.sql --quiet',
      '  neither fires; the file opens with a comment',
    ].join('\n'),
  },
  {
    title: 'MigrationPilot: one unparseable file aborts the whole directory, and breaks --format json',
    body: [
      '`migrationpilot check <dir> --format json` prints a human-readable `Parse Error` block',
      'to stdout and stops at the first file it cannot parse, so a directory containing one',
      'unreadable migration yields no report for any of the others. `analyze` does the same',
      'for the single file. In both cases the exit code is 0 and the output is not JSON,',
      'which means a CI job consuming the report sees a parse failure rather than a finding.',
      '',
      'pgfence handles the identical file by returning valid JSON with an `extractionWarnings`',
      'entry marked `unanalyzable: true` and a coverage figure of 0%. That is the behaviour to',
      'copy: a linter that cannot read a file should say so *in its output format*.',
    ].join('\n'),
    repro: '$ migrationpilot check bench/corpus --pattern "**/*.sql" --format json',
  },
  {
    title: 'Everyone: nobody catches the invalid-index retry trap',
    body: [
      '`unsafe/u13` is `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email)`.',
      'Handbook MPH-012 is about exactly this: after a failed concurrent build leaves an invalid',
      'index behind, `IF NOT EXISTS` reports success over the broken index and the retry is a',
      'no-op. The safe form drops first.',
      '',
      'No tool flagged it. MigrationPilot has the right rule — MP070 fires on a concurrent build',
      'with no preceding `DROP INDEX IF EXISTS` — but it does not fire when `IF NOT EXISTS` is',
      'present, which is precisely the dangerous case.',
      '',
      'pgfence goes further and recommends the trap: `prefer-robust-create-index` asks you to',
      '"add IF NOT EXISTS for idempotency (a failed concurrent build leaves an invalid index)".',
      'The parenthetical is right and the advice that follows from it is backwards.',
    ].join('\n'),
    repro: '$ migrationpilot analyze bench/corpus/unsafe/u13-concurrently-if-not-exists-retry.sql --quiet',
  },
  {
    title: 'Everyone: DDL and a backfill sharing one transaction goes unnamed',
    body: [
      '`unsafe/u18` and `agent-flavored/a04` hold `ACCESS EXCLUSIVE` across a full-table `UPDATE`',
      'inside one transaction — handbook MPH-016, and the shape that turns a millisecond of DDL',
      'into an outage as long as the backfill.',
      '',
      'All three tools notice the unbatched `UPDATE`. None of them say that the table is locked',
      'for its entire duration because the `ALTER` above it has not committed. That is the part',
      'that matters, and it is a rule none of us has.',
    ].join('\n'),
    repro: '$ migrationpilot analyze bench/corpus/unsafe/u18-ddl-and-backfill-same-transaction.sql --quiet',
  },
  {
    title: 'MigrationPilot and Squawk: a table created in the same file is treated as if it were live',
    body: [
      '`safe/s14` creates a new table and then indexes it. Nothing can be blocked, because no',
      'other session knows the relation exists. MigrationPilot raises MP001 and Squawk raises',
      '`require-concurrent-index-creation`; both are telling you to use `CONCURRENTLY` on a table',
      'that has been visible for one statement.',
      '',
      'pgfence is quiet here, which is the correct answer and the one to match. Tracking',
      'relations created earlier in the same file is not expensive — `context/c02` and',
      '`context/c06` are the same idea applied to `SET NOT NULL` and a foreign key.',
    ].join('\n'),
    repro: '$ migrationpilot analyze bench/corpus/safe/s14-create-new-table.sql --quiet',
  },
  {
    title: 'pgfence: the valid-CHECK exemption for SET NOT NULL is not modelled',
    body: [
      'On `safe/s02`, pgfence reports `alter-column-set-not-null` — "scans entire table under',
      'ACCESS EXCLUSIVE lock" — for a `SET NOT NULL` that is preceded, in the same file, by a',
      '`CHECK (col IS NOT NULL)` constraint that has been validated. The manual is explicit that',
      'the scan is skipped in that case, which is the whole reason the pattern exists.',
      '',
      'MigrationPilot and Squawk both stay quiet on that statement. Noted here because the',
      'benchmark is only worth reading if it reports in both directions.',
    ].join('\n'),
    repro: '$ npx @flvmnt/pgfence analyze bench/corpus/safe/s02-not-null-via-valid-check.sql',
  },
];

const ATLAS_NOTE = {
  body: [
    'Atlas ships a migration linter with real lock analysis, and it belongs in a benchmark',
    'like this one. It is excluded because it will not run without a paid account.',
    '',
    'Verified on 2026-08-11 against `atlas version v1.3.1-d229159-canary`, installed from the',
    'official Windows binary at `release.ariga.io`, with a working Docker daemon available',
    'for the dev database:',
    '',
    '```console',
    '$ atlas migrate lint --dir "file://migrations" --dev-url "docker://postgres/17/dev" --latest 2',
    "Abort: Starting with v0.38, 'atlas migrate lint' is available only to Atlas Pro users.",
    '',
    'Get started for free by running the following command:',
    '',
    '\tatlas login',
    '',
    'Note, the command and existing code remain open source and available in the Community Edition.',
    'Learn more: https://atlasgo.io/blog-v038#change-in-v038-atlas-migrate-lint',
    '```',
    '',
    'The command aborts before analysing anything. Running it would mean creating an Atlas',
    'Cloud account and holding a token, which makes the benchmark unreproducible for anyone',
    'who does not have one. Rather than publish a number Atlas had no chance to earn, or a',
    'number produced under a licence that a reader cannot replicate, it is left out and the',
    'reason is printed here.',
    '',
    'A first attempt to build Atlas from source with `go install ariga.io/atlas/cmd/atlas@latest`',
    'failed to compile on this toolchain, which is why the prebuilt binary was used. Neither',
    'path changes the outcome above.',
  ].join('\n'),
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const started = Date.now();
  const cases = loadCorpus();
  materializeStripped(cases);
  console.log(`corpus: ${cases.length} files`);

  const runners = { mp: runMigrationPilot, squawk: runSquawk, pgfence: runPgfence };
  const strippedPath = (c) => c.stripped;
  const originalPath = (c) => c.abs;

  // Primary pass: the migration exactly as an agent would emit it, with the
  // benchmark's own YAML header removed.
  const raw = {};
  for (const tool of OPTS.tools) {
    if (!runners[tool]) throw new Error(`unknown tool: ${tool}`);
    process.stdout.write(`running ${TOOL_LABEL[tool]}... `);
    const t0 = Date.now();
    raw[tool] = runners[tool](cases, strippedPath);
    console.log(`${Date.now() - t0}ms`);
  }

  if (OPTS.dumpRules) {
    for (const tool of OPTS.tools) {
      const seen = new Map();
      for (const [rel, rec] of raw[tool]) {
        const id = cases.find((c) => c.rel === rel).id;
        for (const f of rec.findings) {
          if (!seen.has(f.rule)) seen.set(f.rule, { files: new Set(), severity: f.severity, message: f.message });
          seen.get(f.rule).files.add(id);
        }
      }
      console.log(`\n=== ${TOOL_LABEL[tool]} — ${seen.size} distinct rules ===`);
      for (const [rule, info] of [...seen].sort()) {
        console.log(`${rule} | ${info.severity} | files: ${[...info.files].sort().join(' ')}`);
        console.log(`    ${String(info.message).replace(/\s+/g, ' ')}`);
      }
    }
    return;
  }

  // Control pass: identical corpus, YAML header left in place. Any difference is
  // the tool reacting to a leading comment rather than to the SQL.
  const rawWithHeader = {};
  for (const tool of OPTS.tools) {
    process.stdout.write(`running ${TOOL_LABEL[tool]} (header control)... `);
    const t0 = Date.now();
    rawWithHeader[tool] = runners[tool](cases, originalPath);
    console.log(`${Date.now() - t0}ms`);
  }

  const versions = resolveVersions();
  console.log('versions:', JSON.stringify(versions));

  const scores = {};
  const scoresWithHeader = {};
  for (const tool of OPTS.tools) {
    scores[tool] = score(cases, raw[tool], tool);
    scoresWithHeader[tool] = score(cases, rawWithHeader[tool], tool);
  }

  const headerSensitivity = {};
  for (const tool of OPTS.tools) {
    const diffs = [];
    for (const c of cases) {
      const a = scores[tool].per.get(c.id);
      const b = scoresWithHeader[tool].per.get(c.id);
      const lost = a.hazardRules.filter((r) => !b.hazardRules.includes(r));
      const gained = b.hazardRules.filter((r) => !a.hazardRules.includes(r));
      if (lost.length || gained.length || a.status !== b.status) {
        diffs.push({ id: c.id, file: c.rel, lost, gained, statusFrom: a.status, statusTo: b.status });
      }
    }
    headerSensitivity[tool] = {
      changedFiles: diffs.length,
      strictWithout: scores[tool].totals.strictHits,
      strictWith: scoresWithHeader[tool].totals.strictHits,
      diffs,
    };
  }

  let throughput = null;
  if (OPTS.timing) {
    process.stdout.write('measuring throughput... ');
    throughput = measureThroughput(cases);
    console.log('done');
  }

  const generatedAt = new Date().toISOString().slice(0, 10);

  const results = {
    generatedAt,
    platform: process.platform,
    node: process.version,
    versions,
    pgVersionDefault: DEFAULT_PG,
    corpus: cases.map((c) => ({
      id: c.id, file: c.rel, category: c.category, verdict: c.verdict,
      hazards: c.hazards, handbook: c.handbook, pg: c.pg,
    })),
    tools: Object.fromEntries(
      OPTS.tools.map((t) => [
        t,
        {
          totals: scores[t].totals,
          hazardRecall: Object.fromEntries([...scores[t].hazardRecall].map(([k, v]) => [k, v])),
          files: Object.fromEntries([...scores[t].per].map(([id, rec]) => [id, rec])),
          rawFindings: Object.fromEntries([...raw[t]].map(([rel, rec]) => [rel, rec])),
        },
      ]),
    ),
    throughput,
    headerSensitivity,
    atlas: { excluded: true, reason: 'atlas migrate lint requires an Atlas Pro login as of v0.38' },
  };

  writeFileSync(join(BENCH_DIR, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(
    join(BENCH_DIR, 'RESULTS.md'),
    `${renderResults({ cases, scores, versions, throughput, headerSensitivity, atlas: ATLAS_NOTE, generatedAt })}\n`,
  );

  console.log(`\nwrote bench/RESULTS.md and bench/results.json in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  for (const t of OPTS.tools) {
    const s = scores[t].totals;
    console.log(
      `  ${TOOL_LABEL[t].padEnd(15)} strict ${fraction(s.strictHits, s.dangerous).padEnd(16)} ` +
      `loose ${fraction(s.looseHits, s.dangerous).padEnd(16)} fp ${fraction(s.falsePositives, s.safe)}`,
    );
  }
}

main();
