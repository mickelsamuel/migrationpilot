'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'motion/react';
import { ArrowCounterClockwise, Pause, Play } from '@phosphor-icons/react/ssr';
import { Sql } from '@/components/sql';
import traceData from '@/data/lock-trace.json';

/*
 * A replay of a measured lock trace.
 *
 * Every mark comes from site/src/data/lock-trace.json: pg_locks and
 * pg_stat_activity sampled every 50ms, plus per-transaction client latency from
 * pgbench, captured in labs/lock-queue against a throwaway PostgreSQL 18.4.
 * Nothing here is modelled, smoothed or invented.
 *
 * The safe path is drawn flat because it measured flat: peak queue depth 0, and
 * three of its four statements finished inside 3ms combined. Drawing a spike
 * there to make the comparison livelier would be inventing data.
 */

interface Sample {
  tMs: number;
  waiting: number;
  running: number;
  latencyP50Ms: number;
  latencyMaxMs: number;
}

interface TraceEvent {
  tMs: number;
  type: string;
  label: string;
}

interface Path {
  events: TraceEvent[];
  samples: Sample[];
}

interface Trace {
  meta: {
    placeholder?: boolean;
    pgVersion: string;
    rows: number;
    connections: number;
    machine: string;
    commitSha: string;
    workload: string;
    capturedAt: string;
  };
  unsafe: Path;
  safe: Path;
}

const trace = traceData as Trace;
const PLACEHOLDER = trace.meta.placeholder === true;

const REPO = 'https://github.com/mickelsamuel/migrationpilot';
const LAB = `${REPO}/tree/main/labs/lock-queue`;
const LAB_READER = `${REPO}/blob/main/labs/lock-queue/README.md#add-one-slow-reader-and-the-safe-path-blocks-too`;

/** Exactly what labs/lock-queue/sql/unsafe.sql ran. */
const UNSAFE_SQL = `ALTER TABLE users ALTER COLUMN email SET NOT NULL;`;

/** Exactly what labs/lock-queue/sql/safe.sql ran, minus the event markers. */
const SAFE_SQL = `ALTER TABLE users
  ADD CONSTRAINT users_email_nn CHECK (email IS NOT NULL) NOT VALID;

ALTER TABLE users VALIDATE CONSTRAINT users_email_nn;

ALTER TABLE users ALTER COLUMN email SET NOT NULL;

ALTER TABLE users DROP CONSTRAINT users_email_nn;`;

/**
 * Statement durations from the run's own event log (labs/lock-queue README,
 * run 1). The trace JSON rounds its timestamps to the millisecond, so these
 * carry the precision the log recorded.
 */
const UNSAFE_STEPS = [
  { atMs: 3955, lock: 'ACCESS EXCLUSIVE', ms: '2,190.9 ms', what: 'SET NOT NULL (scans 50M rows)' },
];

const SAFE_STEPS = [
  { atMs: 3922, lock: 'ACCESS EXCLUSIVE', ms: '2.04 ms', what: 'ADD CONSTRAINT ... NOT VALID' },
  { atMs: 5927, lock: 'SHARE UPDATE EXCLUSIVE', ms: '1,748.9 ms', what: 'VALIDATE CONSTRAINT' },
  { atMs: 9677, lock: 'ACCESS EXCLUSIVE', ms: '0.50 ms', what: 'SET NOT NULL' },
  { atMs: 11680, lock: 'ACCESS EXCLUSIVE', ms: '0.66 ms', what: 'DROP CONSTRAINT' },
];

const PLAY_MS = 11_000;

const endMs = Math.max(
  ...trace.unsafe.samples.map((s) => s.tMs),
  ...trace.safe.samples.map((s) => s.tMs),
);
const maxLatency = Math.max(
  ...trace.unsafe.samples.map((s) => s.latencyMaxMs),
  ...trace.safe.samples.map((s) => s.latencyMaxMs),
  1,
);
const maxClients = trace.meta.connections;

/** Spans where a lock was held, paired from the events by their `end` markers. */
function lockSpans(path: Path) {
  const spans: Array<{ from: number; to: number; type: string }> = [];
  let open: TraceEvent | null = null;
  for (const e of path.events) {
    if (e.type === 'end') {
      if (open) spans.push({ from: open.tMs, to: e.tMs, type: open.type });
      open = null;
    } else {
      open = e;
    }
  }
  if (open) spans.push({ from: open.tMs, to: endMs, type: open.type });
  return spans;
}

const UNSAFE_SPANS = lockSpans(trace.unsafe);
const SAFE_SPANS = lockSpans(trace.safe);

/** The last sample at or before `t` that actually recorded a transaction. */
function sampleAt(samples: Sample[], t: number): Sample {
  let current = samples[0];
  for (const s of samples) {
    if (s.tMs > t) break;
    if (s.latencyMaxMs > 0 || s.waiting > 0 || s.running > 0) current = s;
  }
  return current;
}

function formatMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 10) return `${Math.round(ms)} ms`;
  return `${ms.toFixed(2)} ms`;
}

/* --------------------------------------------------------------- geometry */

const VB_W = 400;
const X0 = 2;
const X1 = 398;
const LOCK_H = 14;
const QUEUE_H = 44;
const LAT_H = 52;

const x = (t: number) => X0 + (Math.max(0, Math.min(endMs, t)) / endMs) * (X1 - X0);

/** Client latency spans four orders of magnitude here, so the axis is log. */
const logY = (ms: number, height: number) => {
  const clamped = Math.max(0.1, Math.min(maxLatency, ms));
  const frac = (Math.log10(clamped) + 1) / (Math.log10(maxLatency) + 1);
  return height - 4 - frac * (height - 10);
};

function latencyPath(samples: Sample[], t: number, height: number) {
  const pts: string[] = [];
  let prev: number | null = null;
  for (const s of samples) {
    if (s.tMs > t) break;
    // A bucket with no transactions is a gap in the measurement, not a zero.
    if (s.latencyMaxMs <= 0) continue;
    const y = logY(s.latencyMaxMs, height);
    if (prev !== null) pts.push(`L${x(s.tMs).toFixed(1)},${prev.toFixed(1)}`);
    pts.push(`${pts.length === 0 ? 'M' : 'L'}${x(s.tMs).toFixed(1)},${y.toFixed(1)}`);
    prev = y;
  }
  return pts.join(' ');
}

function LockBand({ spans, t, safe }: { spans: ReturnType<typeof lockSpans>; t: number; safe: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${LOCK_H}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: LOCK_H }}
      role="presentation"
      aria-hidden
    >
      <rect x={X0} y={4} width={X1 - X0} height={6} fill="var(--color-line)" opacity={0.4} />
      {spans.map((span) => {
        if (t < span.from) return null;
        const to = Math.min(t, span.to);
        const blocking = span.type === 'access-exclusive';
        // A 2ms statement is a hairline at this scale. It gets a minimum width
        // so it is visible, and its real duration is printed beside the panel.
        const width = Math.max(blocking && safe ? 2 : 1, x(to) - x(span.from));
        return (
          <rect
            key={`${span.type}-${span.from}`}
            x={x(span.from)}
            y={blocking ? 1 : 4}
            width={width}
            height={blocking ? 12 : 6}
            fill={blocking ? 'var(--color-danger)' : 'var(--color-ok)'}
            opacity={blocking ? 1 : 0.5}
          />
        );
      })}
    </svg>
  );
}

function QueueBand({ path, t }: { path: Path; t: number }) {
  const bars = path.samples.filter((s) => s.tMs <= t);
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${QUEUE_H}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: QUEUE_H }}
      role="presentation"
      aria-hidden
    >
      <line x1={X0} y1={QUEUE_H - 1} x2={X1} y2={QUEUE_H - 1} stroke="var(--color-line-soft)" strokeWidth={1} />
      {bars.map((s, i) => {
        const next = path.samples[i + 1];
        const until = Math.min(next ? next.tMs : endMs, t);
        const w = Math.max(0.8, x(until) - x(s.tMs));
        const waitH = (s.waiting / maxClients) * (QUEUE_H - 3);
        const runH = (s.running / maxClients) * (QUEUE_H - 3);
        return (
          <g key={s.tMs}>
            {runH > 0 && (
              <rect x={x(s.tMs)} y={QUEUE_H - 1 - runH} width={w} height={runH} fill="var(--color-muted)" opacity={0.35} />
            )}
            {waitH > 0 && (
              <rect x={x(s.tMs)} y={QUEUE_H - 1 - runH - waitH} width={w} height={waitH} fill="var(--color-danger)" opacity={0.9} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function LatencyBand({ path, t, safe }: { path: Path; t: number; safe: boolean }) {
  return (
    <svg viewBox={`0 0 ${VB_W} ${LAT_H}`} className="w-full" style={{ height: LAT_H }} role="presentation" aria-hidden>
      <line x1={X0} y1={LAT_H - 4} x2={X1} y2={LAT_H - 4} stroke="var(--color-line-soft)" strokeWidth={1} />
      <path
        d={latencyPath(path.samples, t, LAT_H)}
        fill="none"
        stroke={safe ? 'var(--color-ok)' : 'var(--color-danger)'}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Panel({
  path,
  spans,
  t,
  safe,
  title,
  sql,
  verdict,
  lockSummary,
  steps,
}: {
  path: Path;
  spans: ReturnType<typeof lockSpans>;
  t: number;
  safe: boolean;
  title: string;
  sql: string;
  verdict: string;
  lockSummary: string;
  steps: { atMs: number; lock: string; ms: string; what: string }[];
}) {
  const now = sampleAt(path.samples, t);
  const seen = path.samples.filter((s) => s.tMs <= t);
  const peakWait = Math.max(...seen.map((s) => s.waiting), 0);
  const peakLatency = Math.max(...seen.map((s) => s.latencyMaxMs), 0);
  const measuring = sampleAt(path.samples, t).latencyMaxMs > 0;
  const lastEvent = [...path.events].filter((e) => e.tMs <= t).pop();

  const tone = safe ? 'text-ok' : 'text-danger';
  const chip = safe ? 'border-ok/40 bg-ok-soft text-ok' : 'border-danger/40 bg-danger-soft text-danger';

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
        <h3 className="text-sm font-medium text-fg">{title}</h3>
        <span className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[11px] ${chip}`}>{verdict}</span>
      </div>

      <pre className="mp-scroll overflow-auto whitespace-pre-wrap break-words border-b border-line-soft px-4 py-3 font-mono text-xs leading-[1.75] lg:h-[220px]">
        <Sql code={sql} />
      </pre>

      <ul className="border-b border-line-soft px-4 py-3 lg:h-[104px]">
        {steps.map((step) => (
          <li
            key={step.what}
            className={`flex items-baseline gap-2 py-0.5 font-mono text-[11px] ${
              t >= step.atMs ? 'text-muted' : 'text-faint opacity-40'
            }`}
          >
            <span className="w-[72px] shrink-0 text-right tabular-nums text-fg">{step.ms}</span>
            <span
              className={`w-[34px] shrink-0 ${
                step.lock === 'ACCESS EXCLUSIVE' ? 'text-danger' : 'text-ok'
              }`}
            >
              {step.lock === 'ACCESS EXCLUSIVE' ? 'AE' : 'SUE'}
            </span>
            <span className="min-w-0 truncate">{step.what}</span>
          </li>
        ))}
      </ul>

      <div className="min-h-[46px] border-b border-line-soft px-4 py-2.5">
        <p className="font-mono text-[11px] leading-snug text-muted">
          {lastEvent ? lastEvent.label : 'workload running, no DDL yet'}
        </p>
      </div>

      <div className="space-y-5 px-4 py-5">
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-xs uppercase tracking-[0.08em] text-faint">Lock held on users</span>
            <span className={`font-mono text-xs ${tone}`}>{lockSummary}</span>
          </div>
          <LockBand spans={spans} t={t} safe={safe} />
        </div>
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-xs uppercase tracking-[0.08em] text-faint">Connections queued</span>
            <span className={`font-mono text-xs ${now.waiting > 0 ? tone : 'text-muted'}`}>
              now {now.waiting} of {maxClients}
            </span>
          </div>
          <QueueBand path={path} t={t} />
        </div>
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-xs uppercase tracking-[0.08em] text-faint">Slowest query, log scale</span>
            <span className={`font-mono text-xs ${measuring ? tone : 'text-faint'}`}>
              {measuring ? `now ${formatMs(now.latencyMaxMs)}` : 'workload ended'}
            </span>
          </div>
          <LatencyBand path={path} t={t} safe={safe} />
        </div>
      </div>

      <dl className="mt-auto grid grid-cols-2 gap-px border-t border-line-soft bg-line-soft">
        <div className="bg-surface px-4 py-3">
          <dt className="text-[11px] leading-tight text-faint">Peak queue depth</dt>
          <dd className={`mt-1 font-mono text-sm ${tone}`}>
            {peakWait} of {maxClients}
          </dd>
        </div>
        <div className="bg-surface px-4 py-3">
          <dt className="text-[11px] leading-tight text-faint">Worst single query</dt>
          <dd className={`mt-1 font-mono text-sm ${tone}`}>{formatMs(peakLatency)}</dd>
        </div>
      </dl>
    </div>
  );
}

const STEPS = [...trace.unsafe.events, ...trace.safe.events]
  .sort((a, b) => a.tMs - b.tMs)
  .filter((e) => e.type !== 'end');

export function LockTraceReplay() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.2 });
  const reduceMotion = useReducedMotion();

  const [t, setT] = useState(endMs);
  const [playing, setPlaying] = useState(false);
  const [mounted, setMounted] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => setMounted(true), []);

  // Only the client knows the motion preference, so the transport is absent
  // from the server render and from the first client render alike.
  const showTransport = mounted && !reduceMotion;

  useEffect(() => {
    if (reduceMotion || startedRef.current || !inView) return;
    startedRef.current = true;
    setT(0);
    setPlaying(true);
  }, [inView, reduceMotion]);

  useEffect(() => {
    if (!playing || reduceMotion) return;
    let frame = 0;
    const startedAt = performance.now() - (t / endMs) * PLAY_MS;

    const tick = (now: number) => {
      const next = ((now - startedAt) / PLAY_MS) * endMs;
      if (next >= endMs) {
        setT(endMs);
        setPlaying(false);
        return;
      }
      setT(next);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Reading `t` only sets the resume point; depending on it would restart the
    // clock every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, reduceMotion]);

  const shown = reduceMotion ? endMs : t;
  const activeStep = useMemo(() => {
    let idx = -1;
    STEPS.forEach((s, i) => {
      if (s.tMs <= shown) idx = i;
    });
    return idx;
  }, [shown]);

  return (
    <div ref={ref}>
      {PLACEHOLDER && (
        <p className="mb-4 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-[13px] leading-relaxed text-warn">
          Trace pending. This is a placeholder in the schema of the real capture, kept visible so
          the section is never mistaken for measured data.
        </p>
      )}

      {showTransport && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (shown >= endMs) setT(0);
              setPlaying(!playing);
            }}
            className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-line px-3 text-xs text-muted transition-colors hover:text-fg"
          >
            {playing ? <Pause size={12} weight="fill" /> : <Play size={12} weight="fill" />}
            {playing ? 'Pause' : shown >= endMs ? 'Replay' : 'Play'}
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setT(endMs);
            }}
            className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-line px-3 text-xs text-muted transition-colors hover:text-fg"
          >
            <ArrowCounterClockwise size={12} weight="bold" />
            Whole run
          </button>
          <span className="ml-auto font-mono text-xs tabular-nums text-faint">
            {(shown / 1000).toFixed(1)}s of {(endMs / 1000).toFixed(1)}s
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          path={trace.unsafe}
          spans={UNSAFE_SPANS}
          t={shown}
          safe={false}
          title="The one-liner"
          sql={UNSAFE_SQL}
          verdict="1 critical"
          lockSummary="ACCESS EXCLUSIVE, 2,190.9 ms"
          steps={UNSAFE_STEPS}
        />
        <Panel
          path={trace.safe}
          spans={SAFE_SPANS}
          t={shown}
          safe
          title="The choreography MP002 asks for"
          sql={SAFE_SQL}
          verdict="0 critical"
          lockSummary="ACCESS EXCLUSIVE, 3.2 ms total"
          steps={SAFE_STEPS}
        />
      </div>

      <ol className="mt-5 space-y-1">
        {STEPS.map((step, i) => (
          <li key={`${step.tMs}-${step.label}`}>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setT(step.tMs);
              }}
              className={`flex min-h-[32px] w-full items-baseline gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface ${
                i === activeStep ? 'text-fg' : 'text-muted'
              }`}
            >
              <span className="w-14 shrink-0 font-mono text-[11px] tabular-nums text-faint">
                {(step.tMs / 1000).toFixed(1)}s
              </span>
              <span className="text-[13px] leading-snug">{step.label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-6 max-w-3xl space-y-3 text-[13px] leading-relaxed text-muted">
        <p>
          Same schema change, same workload, same machine. p99 client latency went{' '}
          <span className="font-mono text-fg">0.57 ms</span> to{' '}
          <span className="font-mono text-danger">2,028 ms</span>, and peak queue depth went 0 to 20
          of 20 connections. Fourteen of the queries stuck in that queue were plain{' '}
          <code className="font-mono text-[13px] text-fg">SELECT</code>s holding only{' '}
          <code className="font-mono text-[13px] text-fg">AccessShareLock</code>, which conflicts
          with nothing except the <code className="font-mono text-[13px] text-fg">ACCESS EXCLUSIVE</code>{' '}
          request sitting in front of them. That is the lock queue: they were not blocked by the
          migration, they were blocked by waiting for it.
        </p>
        <p>
          The choreography makes the <em>scan</em> free, not the schema change. A third run with one
          slow reader present found the safe path&apos;s brief metadata locks stuck behind that
          reader for seconds, queueing everything behind them in turn. Brief locks still have to be
          acquired, which is why{' '}
          <a href="/rules/mp004" className="text-accent hover:text-accent-hover">MP004</a> wants{' '}
          <code className="font-mono text-[13px] text-fg">SET lock_timeout</code> on every one of
          them, and why this lab deliberately sets none.{' '}
          <a href={LAB_READER} className="text-accent hover:text-accent-hover">
            That run is written up in full
          </a>
          .
        </p>
        <p className="text-faint">
          One measured run. PostgreSQL {trace.meta.pgVersion},{' '}
          {(trace.meta.rows / 1_000_000).toFixed(0)}M rows, {trace.meta.connections} clients,{' '}
          {trace.meta.workload.split(',').slice(1).join(',').trim()}. Storage was tmpfs, so these
          are a floor: real disks are worse. The unsafe scan varies about 13% between runs.{' '}
          <a href={`${REPO}/commit/${trace.meta.commitSha}`} className="text-accent hover:text-accent-hover">
            {trace.meta.commitSha.slice(0, 9)}
          </a>
          .{' '}
          <a href={LAB} className="text-accent hover:text-accent-hover">
            Raw traces and the reproduce script
          </a>
          .
        </p>
      </div>
    </div>
  );
}
