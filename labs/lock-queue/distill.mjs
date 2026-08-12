#!/usr/bin/env node
// Turns the raw lab artifacts into the replay file the site component animates.
//
//   node distill.mjs --run run1 [--bucket-ms 100] [--out ../../site/src/data/lock-trace.json]
//
// Input, per run and per path (unsafe/safe):
//   locks.jsonl   one JSON object per lock sample, server clock
//   tx.log        pgbench per-transaction log
//   events.raw    EVENT|type|label|epoch lines emitted by the DDL session
//   meta.txt      what produced the run
//
// Output: {meta, unsafe:{events,samples}, safe:{events,samples}} with every
// timestamp normalised to milliseconds since that run's workload start, so the
// two paths sit on comparable timelines.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LAB = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const runId = opt('run', 'run1');
const bucketMs = Number(opt('bucket-ms', 100));
const tracesDir = resolve(LAB, opt('traces', 'traces'));
const outPath = resolve(LAB, opt('out', '../../site/src/data/lock-trace.json'));
const runDir = join(tracesDir, runId);

// Raw artifacts are committed gzipped to keep the repo sane; read either form.
function readText(base) {
  if (existsSync(base)) return readFileSync(base, 'utf8');
  if (existsSync(`${base}.gz`)) return gunzipSync(readFileSync(`${base}.gz`)).toString('utf8');
  throw new Error(`missing artifact: ${base}(.gz)`);
}

function readMeta() {
  const out = {};
  for (const line of readText(join(runDir, 'meta.txt')).split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

// --- parsing -----------------------------------------------------------------

// pgbench --log, one line per transaction:
//   client_id transaction_no time script_no time_epoch time_us [schedule_lag]
// `time` is the elapsed transaction time in microseconds and time_epoch.time_us
// is when it *completed*, so the start is end - latency.
function parseTransactions(path) {
  const txs = [];
  for (const line of readText(path).split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const f = line.split(' ');
    if (f.length < 6) continue;
    const latencyUs = Number(f[2]);
    const script = Number(f[3]);
    const endSec = Number(f[4]) + Number(f[5]) / 1e6;
    if (!Number.isFinite(latencyUs) || !Number.isFinite(endSec)) continue;
    txs.push({ endSec, startSec: endSec - latencyUs / 1e6, latencyMs: latencyUs / 1000, script });
  }
  txs.sort((a, b) => a.startSec - b.startSec);
  return txs;
}

// One sample of the lock table. `waiting` is the queue: distinct backends with a
// lock request on users that has not been granted. `running` is distinct
// backends actively executing while holding only granted locks.
function parseLockSamples(path) {
  const out = [];
  for (const line of readText(path).split('\n')) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    let row;
    try { row = JSON.parse(s); } catch { continue; }
    const waiting = new Set();
    const granted = new Set();
    for (const b of row.backends ?? []) {
      if (b.granted === false) waiting.add(b.pid);
      else if (b.state === 'active') granted.add(b.pid);
    }
    for (const pid of waiting) granted.delete(pid);
    out.push({ ts: row.ts, waiting: waiting.size, running: granted.size });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

function parseEvents(path) {
  const out = [];
  for (const line of readText(path).split('\n')) {
    if (!line.startsWith('EVENT|')) continue;
    const [, type, label, ts] = line.split('|');
    out.push({ ts: Number(ts), type, label });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

const percentile = (sorted, p) =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

const round = (n, dp = 2) => Number(n.toFixed(dp));

// --- bucketing ---------------------------------------------------------------

// A transaction counts toward every bucket it was *in flight* during, at its
// full latency. Bucketing by completion time instead would draw a flat line
// through the outage and one spike after it, because nothing completes while
// the queue is stalled -- which understates what the clients actually saw.
function buildSamples(txs, locks, t0, endSec) {
  const nBuckets = Math.ceil((endSec - t0) * 1000 / bucketMs);
  const inFlight = Array.from({ length: nBuckets }, () => []);

  for (const tx of txs) {
    const first = Math.max(0, Math.floor((tx.startSec - t0) * 1000 / bucketMs));
    const last = Math.min(nBuckets - 1, Math.floor((tx.endSec - t0) * 1000 / bucketMs));
    for (let b = first; b <= last; b++) inFlight[b].push(tx.latencyMs);
  }

  const lockBuckets = Array.from({ length: nBuckets }, () => []);
  for (const s of locks) {
    const b = Math.floor((s.ts - t0) * 1000 / bucketMs);
    if (b >= 0 && b < nBuckets) lockBuckets[b].push(s);
  }

  const samples = [];
  let lastWaiting = 0;
  let lastRunning = 0;
  for (let b = 0; b < nBuckets; b++) {
    // Peak within the bucket: a queue that formed and drained inside 100 ms
    // still happened, and averaging it away would hide it.
    if (lockBuckets[b].length > 0) {
      lastWaiting = Math.max(...lockBuckets[b].map((s) => s.waiting));
      lastRunning = Math.max(...lockBuckets[b].map((s) => s.running));
    }
    const lat = inFlight[b].slice().sort((a, c) => a - c);
    samples.push({
      tMs: b * bucketMs,
      waiting: lastWaiting,
      running: lastRunning,
      latencyP50Ms: round(percentile(lat, 0.5)),
      latencyMaxMs: round(lat.length ? lat[lat.length - 1] : 0),
    });
  }
  return samples;
}

function buildPath(name) {
  const dir = join(runDir, name);
  const txs = parseTransactions(join(dir, 'tx.log'));
  const locks = parseLockSamples(join(dir, 'locks.jsonl'));
  const events = parseEvents(join(dir, 'events.raw'));
  if (txs.length === 0) throw new Error(`${name}: no transactions logged`);
  if (locks.length === 0) throw new Error(`${name}: no lock samples`);
  if (events.length === 0) throw new Error(`${name}: no DDL events`);

  // t0 is when the workload started: the earliest thing either instrument saw.
  const t0 = Math.min(txs[0].startSec, locks[0].ts);
  const endSec = Math.max(txs[txs.length - 1].endSec, locks[locks.length - 1].ts);

  return {
    t0,
    events: events.map((e) => ({
      tMs: Math.round((e.ts - t0) * 1000),
      type: e.type,
      label: e.label,
    })),
    samples: buildSamples(txs, locks, t0, endSec),
  };
}

const meta = readMeta();
const unsafe = buildPath('unsafe');
const safe = buildPath('safe');

const machine = opt(
  'machine',
  'Intel Core i9-14900KF (24C/32T), 32 GB DDR5-6400, Windows 11, Docker Desktop (WSL2); container saw 12 CPUs / 28 GB',
);

const trace = {
  meta: {
    // "postgres (PostgreSQL) 18.4 (Debian 18.4-1.pgdg13+1)" -> "18.4". The full
    // build string stays in the run's meta.txt.
    pgVersion: (meta.pgVersion || '').match(/(\d+\.\d+)/)?.[1] ?? 'unknown',
    rows: Number(meta.rows),
    connections: Number(meta.clients),
    machine,
    commitSha: meta.commitSha,
    workload: `${meta.clients} connections, 80% point SELECT / 20% point UPDATE by primary key, `
      + `rate-limited to ${Number(meta.rateTps).toLocaleString('en-US')} tx/s (pgbench, seed ${meta.pgbenchSeed})`,
    capturedAt: meta.capturedAt,
  },
  unsafe: { events: unsafe.events, samples: unsafe.samples },
  safe: { events: safe.events, samples: safe.samples },
};

writeFileSync(outPath, `${JSON.stringify(trace, null, 2)}\n`);

const stat = (p) => {
  const s = trace[p].samples;
  return {
    buckets: s.length,
    peakQueue: Math.max(...s.map((x) => x.waiting)),
    maxLatency: Math.max(...s.map((x) => x.latencyMaxMs)),
    blockedBuckets: s.filter((x) => x.waiting > 0).length,
  };
};
console.log(`wrote ${outPath}`);
console.log(`  bucket=${bucketMs}ms  rows=${trace.meta.rows}  pg=${trace.meta.pgVersion}`);
for (const p of ['unsafe', 'safe']) {
  const s = stat(p);
  console.log(
    `  ${p.padEnd(6)} buckets=${s.buckets} peakQueue=${s.peakQueue} `
    + `maxLatency=${s.maxLatency}ms bucketsWithQueue=${s.blockedBuckets}`,
  );
}
