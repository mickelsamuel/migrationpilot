'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'motion/react';
import { Pause, Play } from '@phosphor-icons/react/ssr';
import { Sql } from '@/components/sql';

/*
 * The 2 a.m. incident.
 *
 * One statement, two ways of shipping it. The lock modes, the blocking
 * behaviour and the shape of the queue are PostgreSQL's, from
 * docs/handbook/04-check-then-not-null.md. The traffic is invented so the
 * timeline fits on a screen, which is why every number here is labelled as a
 * simulation.
 *
 * Everything is derived from one number, `t`, the simulated second. Same `t`,
 * same picture: no randomness, no drift between the two panels.
 */

const WINDOW = 40; // simulated seconds on the x axis
const PLAY_SECONDS = 14; // real seconds to cross that window
const HOLD_MS = 1800; // pause on the finished frame before looping

const DDL_START = 2;
const UNSAFE_LOCK_END = 36; // ACCESS EXCLUSIVE held across the whole validation scan
const SAFE_AE_END = 2.4; // NOT VALID is a catalogue write, nothing to scan
const SAFE_VALIDATE_START = SAFE_AE_END; // VALIDATE follows immediately
const SAFE_VALIDATE_END = 37;
const STATEMENT_TIMEOUT = 25;

const QUERIES: Array<{ kind: 'SELECT' | 'UPDATE'; at: number }> = [
  { kind: 'SELECT', at: 3 },
  { kind: 'SELECT', at: 5.5 },
  { kind: 'UPDATE', at: 8 },
  { kind: 'SELECT', at: 11 },
  { kind: 'SELECT', at: 14.5 },
  { kind: 'UPDATE', at: 18 },
  { kind: 'SELECT', at: 22 },
  { kind: 'SELECT', at: 27 },
];

const FAST_QUERY = 0.006; // 6 ms, the latency when nothing is in the way

const UNSAFE_SQL = `ALTER TABLE orders
  ADD CONSTRAINT orders_amount_positive CHECK (amount > 0);`;

const SAFE_SQL = `SET lock_timeout = '2s';
ALTER TABLE orders
  ADD CONSTRAINT orders_amount_positive CHECK (amount > 0) NOT VALID;

ALTER TABLE orders VALIDATE CONSTRAINT orders_amount_positive;`;

/** When a query finishes, and whether it got there by timing out. */
function resolveUnsafe(at: number) {
  if (at >= UNSAFE_LOCK_END) return { end: at + FAST_QUERY, timedOut: false };
  const timeoutAt = at + STATEMENT_TIMEOUT;
  return timeoutAt < UNSAFE_LOCK_END
    ? { end: timeoutAt, timedOut: true }
    : { end: UNSAFE_LOCK_END, timedOut: false };
}

const UNSAFE_RESULTS = QUERIES.map((q) => ({ ...q, ...resolveUnsafe(q.at) }));
const TIMED_OUT = UNSAFE_RESULTS.filter((q) => q.timedOut).length;

/** Seconds into milliseconds when the number is small enough to deserve it. */
function formatLatency(seconds: number) {
  return seconds < 1 ? `${Math.round(seconds * 1000)} ms` : `${seconds.toFixed(1)} s`;
}

/** p99 saturates at the statement timeout: nothing can wait longer than that. */
function unsafeLatency(t: number) {
  if (t < QUERIES[0].at || t >= UNSAFE_LOCK_END) return FAST_QUERY;
  return Math.min(STATEMENT_TIMEOUT, t - QUERIES[0].at);
}

/** Worst p99 the trace has reached so far, which is what the readout names. */
function unsafePeak(t: number) {
  if (t <= QUERIES[0].at) return FAST_QUERY;
  return Math.min(STATEMENT_TIMEOUT, Math.min(t, UNSAFE_LOCK_END) - QUERIES[0].at);
}

// Geometry. Every band shares one x scale, so the three strips read as one
// timeline and the two panels line up row for row.
const VB_W = 400;
const X0 = 2;
const X1 = 398;
const LANE_COUNT = QUERIES.length;
const LANE_STEP = 11;
const LANE_H = 6;
const LANES_H = LANE_COUNT * LANE_STEP;
const PLOT_H = 48;

const x = (t: number) => X0 + (Math.max(0, Math.min(WINDOW, t)) / WINDOW) * (X1 - X0);
const PLOT_BASE = PLOT_H - 6; // a flat trace sits above the axis, not on top of it
const y = (latency: number) =>
  PLOT_BASE - (Math.min(STATEMENT_TIMEOUT, latency) / STATEMENT_TIMEOUT) * (PLOT_BASE - 4);

function latencyPath(t: number, latencyAt: (t: number) => number) {
  const points: string[] = [];
  for (let s = 0; s <= t; s += 0.4) points.push(`${x(s).toFixed(1)},${y(latencyAt(s)).toFixed(1)}`);
  points.push(`${x(t).toFixed(1)},${y(latencyAt(t)).toFixed(1)}`);
  return `M${points.join(' L')}`;
}

function Band({ height, children }: { height: number; children: React.ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      role="presentation"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function LockBand({ t, safe }: { t: number; safe: boolean }) {
  const lockEnd = safe ? SAFE_AE_END : UNSAFE_LOCK_END;
  const aeWidth = Math.max(0, x(Math.min(t, lockEnd)) - x(DDL_START));

  return (
    <Band height={12}>
      <rect x={X0} y={0} width={X1 - X0} height={12} fill="var(--color-line)" opacity={0.55} />
      {t > DDL_START && (
        <rect
          x={x(DDL_START)}
          y={0}
          width={safe ? Math.max(aeWidth, 2.5) : aeWidth}
          height={12}
          fill="var(--color-danger)"
        />
      )}
      {safe && t > SAFE_VALIDATE_START && (
        <rect
          x={x(SAFE_VALIDATE_START)}
          y={0}
          width={x(Math.min(t, SAFE_VALIDATE_END)) - x(SAFE_VALIDATE_START)}
          height={12}
          fill="var(--color-ok)"
          opacity={0.6}
        />
      )}
    </Band>
  );
}

function QueryBand({ t, safe }: { t: number; safe: boolean }) {
  return (
    <Band height={LANES_H}>
      {QUERIES.map((query, index) => {
        const laneY = index * LANE_STEP;
        const result = safe ? { end: query.at + FAST_QUERY, timedOut: false } : UNSAFE_RESULTS[index];
        const started = t >= query.at;
        const end = Math.min(t, result.end);
        const done = t >= result.end;
        const fill =
          result.timedOut && done
            ? 'var(--color-danger)'
            : safe
              ? 'var(--color-ok)'
              : 'var(--color-warn)';

        return (
          <g key={index}>
            <rect
              x={X0}
              y={laneY}
              width={X1 - X0}
              height={LANE_H}
              fill="var(--color-line)"
              opacity={0.55}
            />
            {started && (
              <rect
                x={x(query.at)}
                y={laneY}
                width={Math.max(3, x(end) - x(query.at))}
                height={LANE_H}
                fill={fill}
                opacity={done && !result.timedOut ? 0.7 : 1}
              />
            )}
          </g>
        );
      })}
    </Band>
  );
}

function LatencyBand({ t, safe }: { t: number; safe: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${PLOT_H}`}
      className="w-full"
      style={{ height: PLOT_H }}
      role="presentation"
      aria-hidden
    >
      <line
        x1={X0}
        y1={PLOT_H - 2}
        x2={X1}
        y2={PLOT_H - 2}
        stroke="var(--color-line)"
        strokeWidth={1}
      />
      <path
        d={latencyPath(t, safe ? () => FAST_QUERY : unsafeLatency)}
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

function BandLabel({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <span className="text-xs uppercase tracking-[0.08em] text-faint">{label}</span>
      <span className={`font-mono text-xs ${tone}`}>{value}</span>
    </div>
  );
}

function Panel({
  t,
  safe,
  title,
  verdict,
  sql,
  lockLabel,
  queueLabel,
  latencyLabel,
  stats,
}: {
  t: number;
  safe: boolean;
  title: string;
  verdict: string;
  sql: string;
  lockLabel: string;
  queueLabel: string;
  latencyLabel: string;
  stats: Array<{ label: string; value: string }>;
}) {
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

      {/* Fixed height side by side so the panels line up band for band. Stacked
          on a phone there is nothing to line up with, so it sizes to the SQL. */}
      <pre className="mp-scroll overflow-auto lg:h-[132px] border-b border-line-soft px-4 py-3 font-mono text-xs leading-[1.75]">
        <Sql code={sql} />
      </pre>

      <div className="space-y-5 px-4 py-5">
        <div>
          <BandLabel label="Lock on orders" value={lockLabel} tone={tone} />
          <LockBand t={t} safe={safe} />
        </div>
        <div>
          <BandLabel label="Application queries" value={queueLabel} tone={tone} />
          <QueryBand t={t} safe={safe} />
        </div>
        <div>
          <BandLabel label="p99 read latency" value={latencyLabel} tone={tone} />
          <LatencyBand t={t} safe={safe} />
        </div>
      </div>

      <dl className="mt-auto grid grid-cols-3 gap-px border-t border-line-soft bg-line-soft">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-surface px-4 py-3">
            <dt className="text-[11px] leading-tight text-faint">{stat.label}</dt>
            <dd className={`mt-1 font-mono text-sm ${tone}`}>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function LockQueueSimulation() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.25 });
  const reduceMotion = useReducedMotion();

  const [t, setT] = useState(WINDOW);
  const [paused, setPaused] = useState(false);

  const running = inView && !paused && !reduceMotion;

  useEffect(() => {
    if (!running) return;

    let frame = 0;
    let holdUntil = 0;
    let startedAt = performance.now() - (t >= WINDOW ? 0 : (t / WINDOW) * PLAY_SECONDS * 1000);
    if (t >= WINDOW) {
      setT(0);
      startedAt = performance.now();
    }

    const tick = (now: number) => {
      if (holdUntil) {
        if (now >= holdUntil) {
          holdUntil = 0;
          startedAt = now;
          setT(0);
        }
      } else {
        const next = ((now - startedAt) / (PLAY_SECONDS * 1000)) * WINDOW;
        if (next >= WINDOW) {
          setT(WINDOW);
          holdUntil = now + HOLD_MS;
        } else {
          setT(next);
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // `t` is read once to resume from where it stopped; re-running on every
    // frame would restart the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const shown = reduceMotion ? WINDOW : t;
  const unsafeLockSeconds = Math.max(0, Math.min(shown, UNSAFE_LOCK_END) - DDL_START);
  const safeLockSeconds = Math.max(0, Math.min(shown, SAFE_AE_END) - DDL_START);

  const started = QUERIES.filter((q) => shown >= q.at).length;
  const timedOutSoFar = UNSAFE_RESULTS.filter((q) => q.timedOut && shown >= q.end).length;
  const waitingNow = UNSAFE_RESULTS.filter((q) => q.at <= shown && shown < q.end).length;
  const longestWaitSoFar = Math.max(
    0,
    ...UNSAFE_RESULTS.filter((q) => shown >= q.at).map((q) => Math.min(shown, q.end) - q.at),
  );

  return (
    <div ref={ref}>
      {!reduceMotion && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-faint tabular-nums">
            t = {shown.toFixed(1)}s of {WINDOW}s
          </span>
          <button
            type="button"
            onClick={() => setPaused(!paused)}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-faint hover:text-fg"
          >
            {paused ? <Play size={12} weight="fill" /> : <Pause size={12} weight="fill" />}
            {paused ? 'Play' : 'Pause'}
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          t={shown}
          safe={false}
          title="Shipped as written"
          verdict="2 critical"
          sql={UNSAFE_SQL}
          lockLabel={`ACCESS EXCLUSIVE, ${unsafeLockSeconds.toFixed(1)}s`}
          queueLabel={waitingNow > 0 ? `${waitingNow} waiting` : `${started} arrived`}
          latencyLabel={`peak ${formatLatency(unsafePeak(shown))}`}
          stats={[
            { label: 'Reads and writes', value: 'blocked' },
            { label: 'Timed out', value: `${timedOutSoFar} of ${QUERIES.length}` },
            { label: 'Longest wait', value: `${longestWaitSoFar.toFixed(0)} s` },
          ]}
        />
        <Panel
          t={shown}
          safe
          title="Shipped as MigrationPilot rewrites it"
          verdict="0 critical"
          sql={SAFE_SQL}
          lockLabel={
            shown < SAFE_VALIDATE_START
              ? `ACCESS EXCLUSIVE, ${safeLockSeconds.toFixed(1)}s`
              : 'SHARE UPDATE EXCLUSIVE'
          }
          queueLabel={`${started} served`}
          latencyLabel={`peak ${formatLatency(FAST_QUERY)}`}
          stats={[
            { label: 'Reads and writes', value: 'allowed' },
            { label: 'Timed out', value: `0 of ${QUERIES.length}` },
            { label: 'Longest wait', value: '6 ms' },
          ]}
        />
      </div>

      <div className="mt-5">
        <p className="max-w-3xl text-[13px] leading-relaxed text-muted">
          Simulated timeline over 40 seconds. The lock modes and the blocking behaviour are
          PostgreSQL&apos;s, documented in{' '}
          <a
            href="https://www.postgresql.org/docs/current/sql-altertable.html"
            className="text-accent transition-colors hover:text-accent-hover"
          >
            ALTER TABLE
          </a>{' '}
          and{' '}
          <a
            href="https://www.postgresql.org/docs/current/explicit-locking.html"
            className="text-accent transition-colors hover:text-accent-hover"
          >
            Explicit Locking
          </a>
          . The eight queries are invented so the story fits on a screen. The rewrite on the right
          is what <a href="/rules/mp030" className="text-accent transition-colors hover:text-accent-hover">MP030</a>{' '}
          and <a href="/rules/mp004" className="text-accent transition-colors hover:text-accent-hover">MP004</a>{' '}
          tell you to write.
        </p>
      </div>
      <p className="sr-only">
        Left panel: adding the CHECK constraint directly holds an ACCESS EXCLUSIVE lock on orders
        for 34 seconds while PostgreSQL validates every existing row. All eight application queries
        block behind it and {TIMED_OUT} of them hit the statement timeout. Right panel: adding the
        same constraint with NOT VALID takes the strong lock for a fraction of a second, and the
        validation scan then runs under SHARE UPDATE EXCLUSIVE, which blocks neither reads nor
        writes. No query waits.
      </p>
    </div>
  );
}
