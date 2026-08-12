'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'motion/react';

const REPO = 'https://github.com/mickelsamuel/migrationpilot';
const RESULTS = `${REPO}/blob/main/bench/RESULTS.md`;

interface Row {
  tool: string;
  ours?: boolean;
  detected: number;
  detectedOf: number;
  detectedPct: number;
  falsePositives: number;
  falsePositivesOf: number;
  falsePositivesPct: number;
}

/** Straight from bench/RESULTS.md, headline table. */
const ROWS: Row[] = [
  { tool: 'MigrationPilot', ours: true, detected: 30, detectedOf: 33, detectedPct: 90.9, falsePositives: 1, falsePositivesOf: 17, falsePositivesPct: 5.9 },
  { tool: 'Squawk', detected: 20, detectedOf: 33, detectedPct: 60.6, falsePositives: 1, falsePositivesOf: 17, falsePositivesPct: 5.9 },
  { tool: 'pgfence', detected: 25, detectedOf: 33, detectedPct: 75.8, falsePositives: 3, falsePositivesOf: 17, falsePositivesPct: 17.6 },
];

const LINKS = [
  { label: 'Methodology', href: `${RESULTS}#what-this-measures` },
  { label: 'Corpus', href: `${REPO}/tree/main/bench/corpus` },
  { label: 'What we missed', href: `${RESULTS}#what-migrationpilot-missed` },
  { label: 'Reproduce it', href: `${RESULTS}#versions-and-setup` },
];

/*
 * `static` renders the real number, which is what the server sends and what a
 * reader without JavaScript keeps. `armed` zeroes it, and only ever runs while
 * the table is still below the fold. `running` counts back up.
 */
type Phase = 'static' | 'armed' | 'running';

function useCountUp(target: number, phase: Phase, decimals = 0) {
  const [value, setValue] = useState(target);

  useEffect(() => {
    if (phase === 'static') {
      setValue(target);
      return;
    }
    if (phase === 'armed') {
      setValue(0);
      return;
    }

    let frame = 0;
    const started = performance.now();
    const duration = 900;

    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Number((target * eased).toFixed(decimals)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, phase, decimals]);

  return value;
}

function Metric({
  count,
  of,
  pct,
  phase,
  emphasis,
}: {
  count: number;
  of: number;
  pct: number;
  phase: Phase;
  emphasis?: boolean;
}) {
  const shownCount = useCountUp(count, phase);
  const shownPct = useCountUp(pct, phase, 1);

  return (
    <span className="font-mono text-sm tabular-nums">
      <span className={emphasis ? 'text-fg' : 'text-muted'}>
        {Math.round(shownCount)}/{of}
      </span>{' '}
      <span className="text-faint">({shownPct.toFixed(1)}%)</span>
    </span>
  );
}

export function BenchmarkStrip() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const phase: Phase =
    reduceMotion || !mounted ? 'static' : inView ? 'running' : 'armed';

  return (
    <div ref={ref}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-lg font-semibold text-fg">
          Measured against Squawk and pgfence on 56 labelled migrations
        </h2>
        <p className="font-mono text-xs text-faint">bench/RESULTS.md</p>
      </div>

      <div className="mp-scroll mt-6 max-w-3xl overflow-x-auto">
        <table className="w-full min-w-[440px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="pb-2 pr-4 text-xs font-medium text-faint">Tool</th>
              <th className="pb-2 pr-4 text-xs font-medium text-faint">
                Hazards named <span className="text-faint/70">(33 dangerous files)</span>
              </th>
              <th className="pb-2 text-xs font-medium text-faint">
                False positives <span className="text-faint/70">(17 safe files)</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.tool} className="border-b border-line-soft last:border-b-0">
                <td className="py-3 pr-4">
                  <span className={`text-sm ${row.ours ? 'font-medium text-fg' : 'text-muted'}`}>
                    {row.tool}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <Metric
                    count={row.detected}
                    of={row.detectedOf}
                    pct={row.detectedPct}
                    phase={phase}
                    emphasis={row.ours}
                  />
                </td>
                <td className="py-3">
                  <Metric
                    count={row.falsePositives}
                    of={row.falsePositivesOf}
                    pct={row.falsePositivesPct}
                    phase={phase}
                    emphasis={row.ours}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-5 max-w-2xl text-[13px] leading-relaxed text-muted">
        56 labelled files. Author-built corpus. Tools pinned. Detection is strict: the tool has to
        name the specific hazard the file was written to contain. Every file MigrationPilot missed
        is listed by name in the results.
      </p>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="text-[13px] text-accent transition-colors hover:text-accent-hover"
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}
