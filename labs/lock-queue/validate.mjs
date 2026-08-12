#!/usr/bin/env node
// Checks site/src/data/lock-trace.json against the schema the site component
// expects, plus the sanity properties that make the trace worth publishing.
//
//   node validate.mjs [path/to/lock-trace.json]
//
// Exits non-zero on the first failing group, so it can gate a build.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LAB = dirname(fileURLToPath(import.meta.url));
const path = resolve(LAB, process.argv[2] ?? '../../site/src/data/lock-trace.json');

const failures = [];
const check = (ok, label, detail = '') => {
  if (!ok) failures.push(detail ? `${label} -- ${detail}` : label);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail && !ok ? `  (${detail})` : ''}`);
};

const trace = JSON.parse(readFileSync(path, 'utf8'));

// --- schema ------------------------------------------------------------------

check(
  JSON.stringify(Object.keys(trace).sort()) === '["meta","safe","unsafe"]',
  'top level is exactly {meta, unsafe, safe}',
  Object.keys(trace).join(','),
);

const m = trace.meta ?? {};
const metaKeys = ['pgVersion', 'rows', 'connections', 'machine', 'commitSha', 'workload', 'capturedAt'];
check(
  metaKeys.every((k) => k in m),
  'meta has every required key',
  metaKeys.filter((k) => !(k in m)).join(',') || 'none missing',
);
check(typeof m.pgVersion === 'string' && /\d+\.\d+/.test(m.pgVersion), 'meta.pgVersion looks like a version', String(m.pgVersion));
check(Number.isInteger(m.rows) && m.rows > 0, 'meta.rows is a positive integer', String(m.rows));
check(Number.isInteger(m.connections) && m.connections > 0, 'meta.connections is a positive integer', String(m.connections));
check(typeof m.machine === 'string' && m.machine.length > 10, 'meta.machine describes the hardware');
check(/^[0-9a-f]{40}$/.test(m.commitSha ?? ''), 'meta.commitSha is a full git sha', String(m.commitSha));
check(typeof m.workload === 'string' && m.workload.length > 10, 'meta.workload describes the workload');
check(
  typeof m.capturedAt === 'string' && !Number.isNaN(Date.parse(m.capturedAt)),
  'meta.capturedAt parses as a date',
  String(m.capturedAt),
);

const EVENT_TYPES = new Set(['access-exclusive', 'share-update-exclusive', 'end']);

for (const name of ['unsafe', 'safe']) {
  const p = trace[name] ?? {};
  check(Array.isArray(p.events) && p.events.length > 0, `${name}.events is a non-empty array`);
  check(Array.isArray(p.samples) && p.samples.length > 0, `${name}.samples is a non-empty array`);

  const badEvent = (p.events ?? []).find(
    (e) => !Number.isFinite(e.tMs) || e.tMs < 0 || !EVENT_TYPES.has(e.type) || typeof e.label !== 'string' || !e.label,
  );
  check(!badEvent, `${name}.events all have {tMs, type, label}`, badEvent ? JSON.stringify(badEvent) : '');

  const badSample = (p.samples ?? []).find(
    (s) => !['tMs', 'waiting', 'running', 'latencyP50Ms', 'latencyMaxMs'].every((k) => Number.isFinite(s[k]))
      || s.waiting < 0 || s.running < 0 || s.latencyP50Ms < 0 || s.latencyMaxMs < s.latencyP50Ms,
  );
  check(!badSample, `${name}.samples all have five finite, coherent numbers`, badSample ? JSON.stringify(badSample) : '');

  const samples = p.samples ?? [];
  const stride = samples.length > 1 ? samples[1].tMs - samples[0].tMs : 0;
  const evenly = samples.every((s, i) => s.tMs === samples[0].tMs + i * stride);
  check(evenly && stride > 0, `${name}.samples are evenly spaced`, `stride=${stride}ms`);

  // Every phase that began also ended: a trace of a migration that hung or
  // failed halfway would be a different (and much less useful) artifact.
  const begins = (p.events ?? []).filter((e) => e.type !== 'end').length;
  const ends = (p.events ?? []).filter((e) => e.type === 'end').length;
  check(begins > 0 && begins === ends, `${name} every DDL phase that began also completed`, `${begins} begins / ${ends} ends`);

  const span = samples.length ? samples[samples.length - 1].tMs : 0;
  const late = (p.events ?? []).find((e) => e.tMs > span);
  check(!late, `${name} events fall inside the sampled timeline`, late ? late.label : '');
}

// --- sanity: the trace has to show what it claims to show --------------------

const peak = (name) => Math.max(...trace[name].samples.map((s) => s.waiting));
const maxLat = (name) => Math.max(...trace[name].samples.map((s) => s.latencyMaxMs));
const queued = (name) => trace[name].samples.filter((s) => s.waiting > 0).length;

check(peak('unsafe') > peak('safe'), 'unsafe peak queue depth exceeds safe', `unsafe=${peak('unsafe')} safe=${peak('safe')}`);
check(maxLat('unsafe') > maxLat('safe'), 'unsafe worst latency exceeds safe', `unsafe=${maxLat('unsafe')}ms safe=${maxLat('safe')}ms`);
check(queued('unsafe') > queued('safe'), 'unsafe spends more time with a queue', `unsafe=${queued('unsafe')} safe=${queued('safe')} buckets`);
check(
  trace.unsafe.events.some((e) => e.type === 'access-exclusive'),
  'unsafe path is marked ACCESS EXCLUSIVE',
);
check(
  trace.safe.events.some((e) => e.type === 'share-update-exclusive'),
  'safe path validates under SHARE UPDATE EXCLUSIVE',
);

const spanU = trace.unsafe.samples.at(-1).tMs;
const spanS = trace.safe.samples.at(-1).tMs;
check(
  Math.abs(spanU - spanS) / Math.max(spanU, spanS) < 0.2,
  'both runs sit on comparable timelines',
  `unsafe=${spanU}ms safe=${spanS}ms`,
);

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`lock-trace.json is valid (${trace.unsafe.samples.length} + ${trace.safe.samples.length} buckets)`);
