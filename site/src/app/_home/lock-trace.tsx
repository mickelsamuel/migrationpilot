'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'motion/react';
import { ArrowCounterClockwise, Pause, Play } from '@phosphor-icons/react/ssr';
import { Sql } from '@/components/sql';
import traceData from '@/data/lock-trace.json';

/*
 * A replay of a measured lock trace, not a simulation.
 *
 * Everything drawn here comes from site/src/data/lock-trace.json: pg_locks and
 * pg_stat_activity samples plus client-side latency, captured from a Docker
 * PostgreSQL lab running the same workload against both migrations. Nothing on
 * this component invents a number. While meta.placeholder is set the page says
 * so in plain sight, because a chart that looks measured and is not would be
 * worse than no chart.
 *
 * The safe path is deliberately not a flat line. NOT VALID still takes a brief
 * ACCESS EXCLUSIVE lock to write the catalogue entry, and the trace shows that
 * blip. See docs/handbook/04-check-then-not-null.md.
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
    note?: string;
  };
  unsafe: Path;
  safe: Path;
}

const trace = traceData as Trace;
const PLACEHOLDER = trace.meta.placeholder === true;

const UNSAFE_SQL = `ALTER TABLE orders
  ADD CONSTRAINT orders_amount_positive CHECK (amount > 0);`;

const SAFE_SQL = `SET lock_timeout = '2s';
ALTER TABLE orders
  ADD CONSTRAINT orders_amount_positive CHECK (amount > 0) NOT VALID;

ALTER TABLE orders VALIDATE CONSTRAINT orders_amount_positive;`;

const REPO = 'https://github.com/mickelsamuel/migrationpilot';
const TRACE_LINK = `${REPO}/tree/main/bench/lock-trace`;

const PLAY_MS = 12_000;

const endMs = Math.max(
  ...trace.unsafe.samples.map((s) => s.tMs),
  ...trace.safe.samples.map((s) => s.tMs),
);
const maxLatency = Math.max(...trace.unsafe.samples.map((s) => s.latencyMaxMs), 1);
const maxClients = Math.max(
  ...trace.unsafe.samples.map((s) => s.waiting + s.running),
  ...trace.safe.samples.map((s) => s.waiting + s.running),
  1,
);

/** The sample in effect at time t. Traces are step functions, not curves. */
function sampleAt(samples: Sample[], t: number): Sample {
  let current = samples[0];
  for (const s of samples) {
    if (s.tMs <= t) current = s;
    else break;
  }
  return current;
}

function formatMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s`;
  return `${Math.round(ms)} ms`;
}

/* --------------------------------------------------------------- geometry */

const VB_W = 400;
const X0 = 2;
const X1 = 398;
const QUEUE_H = 46;
const LAT_H = 52;

const x = (t: number) => X0 + (Math.max(0, Math.min(endMs, t)) / endMs) * (X1 - X0);

/** Latency spans four orders of magnitude, so the axis is logarithmic. */
const logY = (ms: number, height: number) => {
  const clamped = Math.max(1, Math.min(maxLatency, ms));
  const frac = Math.log10(clamped) / Math.log10(maxLatency);
  return height - 4 - frac * (height - 10);
};

function stepPath(samples: Sample[], t: number, value: (s: Sample) => number, height: number) {
  const pts: string[] = [];
  let prev: number | null = null;
  for (const s of samples) {
    if (s.tMs > t) break;
    const y = logY(value(s), height);
    if (prev !== null) pts.push(`L${x(s.tMs).toFixed(1)},${prev.toFixed(1)}`);
    pts.push(`${pts.length === 0 ? 'M' : 'L'}${x(s.tMs).toFixed(1)},${y.toFixed(1)}`);
    prev = y;
  }
  if (prev !== null) pts.push(`L${x(t).toFixed(1)},${prev.toFixed(1)}`);
  return pts.join(' ');
}

function QueueBand({ path, t, safe }: { path: Path; t: number; safe: boolean }) {
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
        const w = Math.max(1, x(until) - x(s.tMs));
        const waitH = (s.waiting / maxClients) * (QUEUE_H - 4);
        const runH = (s.running / maxClients) * (QUEUE_H - 4);
        return (
          <g key={s.tMs}>
            <rect
              x={x(s.tMs)}
              y={QUEUE_H - 1 - runH}
              width={w}
              height={runH}
              fill={safe ? 'var(--color-ok)' : 'var(--color-muted)'}
              opacity={0.45}
            />
            {s.waiting > 0 && (
              <rect
                x={x(s.tMs)}
                y={QUEUE_H - 1 - runH - waitH}
                width={w}
                height={waitH}
                fill="var(--color-danger)"
                opacity={0.85}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function LatencyBand({ path, t, safe }: { path: Path; t: number; safe: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${LAT_H}`}
      className="w-full"
      style={{ height: LAT_H }}
      role="presentation"
      aria-hidden
    >
      <line x1={X0} y1={LAT_H - 4} x2={X1} y2={LAT_H - 4} stroke="var(--color-line-soft)" strokeWidth={1} />
      <path
        d={stepPath(path.samples, t, (s) => s.latencyMaxMs, LAT_H)}
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
  t,
  safe,
  title,
  sql,
  verdict,
}: {
  path: Path;
  t: number;
  safe: boolean;
  title: string;
  sql: string;
  verdict: string;
}) {
  const now = sampleAt(path.samples, t);
  const peakWait = Math.max(...path.samples.filter((s) => s.tMs <= t).map((s) => s.waiting), 0);
  const peakLatency = Math.max(
    ...path.samples.filter((s) => s.tMs <= t).map((s) => s.latencyMaxMs),
    0,
  );
  const lastEvent = [...path.events].filter((e) => e.tMs <= t).pop();

  const tone = safe ? 'text-ok' : 'text-danger';
  const chip = safe
    ? 'border-ok/40 bg-ok-soft text-ok'
    : 'border-danger/40 bg-danger-soft text-danger';

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
        <h3 className="text-sm font-medium text-fg">{title}</h3>
        <span className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[11px] ${chip}`}>
          {verdict}
        </span>
      </div>

      <pre className="whitespace-pre-wrap break-words border-b border-line-soft px-4 py-3 font-mono text-xs leading-[1.75] lg:h-[150px]">
        <Sql code={sql} />
      </pre>

      <div className="min-h-[44px] border-b border-line-soft px-4 py-2.5">
        <p className="font-mono text-[11px] leading-snug text-muted">
          {lastEvent ? lastEvent.label : 'waiting for the workload to start'}
        </p>
      </div>

      <div className="space-y-5 px-4 py-5">
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-xs uppercase tracking-[0.08em] text-faint">Client sessions</span>
            <span className={`font-mono text-xs ${now.waiting > 0 ? tone : 'text-muted'}`}>
              now {now.waiting} waiting / {now.running} running
            </span>
          </div>
          <QueueBand path={path} t={t} safe={safe} />
        </div>
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-xs uppercase tracking-[0.08em] text-faint">
              Slowest client query
            </span>
            <span className={`font-mono text-xs ${tone}`}>now {formatMs(now.latencyMaxMs)}</span>
          </div>
          <LatencyBand path={path} t={t} safe={safe} />
        </div>
      </div>

      <dl className="mt-auto grid grid-cols-2 gap-px border-t border-line-soft bg-line-soft">
        <div className="bg-surface px-4 py-3">
          <dt className="text-[11px] leading-tight text-faint">Peak sessions waiting</dt>
          <dd className={`mt-1 font-mono text-sm ${tone}`}>{peakWait}</dd>
        </div>
        <div className="bg-surface px-4 py-3">
          <dt className="text-[11px] leading-tight text-faint">Worst query seen</dt>
          <dd className={`mt-1 font-mono text-sm ${tone}`}>{formatMs(peakLatency)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** The points a reader can jump between, derived from the unsafe path's events. */
const STEPS = trace.unsafe.events.map((e) => ({ tMs: e.tMs, label: e.label, type: e.type }));

export function LockTraceReplay() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.2 });
  const reduceMotion = useReducedMotion();

  const [t, setT] = useState(endMs);
  const [playing, setPlaying] = useState(false);
  const startedRef = useRef(false);

  // Start once, when it first comes into view. After that the reader drives it.
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
    // Reading `t` here only sets the resume point; depending on it would restart
    // the clock every frame.
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
          Trace pending. The shape below is a placeholder in the schema of the real capture, kept
          visible so this section is never mistaken for measured data. It is replaced by the run
          from the reproducible lab before this page ships.
        </p>
      )}

      {!reduceMotion && (
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
            Show the whole run
          </button>
          <span className="ml-auto font-mono text-xs tabular-nums text-faint">
            {(shown / 1000).toFixed(1)}s of {(endMs / 1000).toFixed(0)}s
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          path={trace.unsafe}
          t={shown}
          safe={false}
          title="Added directly"
          sql={UNSAFE_SQL}
          verdict="2 critical"
        />
        <Panel
          path={trace.safe}
          t={shown}
          safe
          title="Added with NOT VALID, then validated"
          sql={SAFE_SQL}
          verdict="0 critical"
        />
      </div>

      {/* Steps double as the reduced-motion view: the whole story, as text. */}
      <ol className="mt-5 space-y-1.5">
        {STEPS.map((step, i) => (
          <li key={`${step.tMs}-${step.type}`}>
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

      <p className="mt-5 max-w-3xl text-[13px] leading-relaxed text-muted">
        Measured on PostgreSQL {trace.meta.pgVersion}, {trace.meta.rows.toLocaleString('en-US')}{' '}
        rows, {trace.meta.connections} clients.{' '}
        <a href={TRACE_LINK} className="text-accent transition-colors hover:text-accent-hover">
          Raw trace and reproduction
        </a>
        . Both panels ran the same workload; the only difference is the migration. The right-hand
        path is not free: <code className="font-mono text-[13px] text-fg">NOT VALID</code> still
        takes an <code className="font-mono text-[13px] text-fg">ACCESS EXCLUSIVE</code> lock to
        write the catalogue entry, which is the blip near the start. What it avoids is holding that
        lock for the whole verification scan.
      </p>
    </div>
  );
}
