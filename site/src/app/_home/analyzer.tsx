'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowSquareOut, CaretRight } from '@phosphor-icons/react/ssr';
import { loadEngine, type Engine, type Report, type Violation } from '../playground/engine';
import { Sql } from '@/components/sql';
import { DEFAULT_SQL, PRECOMPUTED_REPORT } from './precomputed';

const PG_VERSION = 17;
// 8 lines at 13px/1.7 plus the padding, so the default migration never clips.
const EDITOR_HEIGHT = 212;
const RESULT_HEIGHT = 380;

type EngineState = 'idle' | 'ready' | 'unavailable';

const RISK_TEXT: Record<Report['riskLevel'], string> = {
  RED: 'text-danger',
  YELLOW: 'text-warn',
  GREEN: 'text-ok',
};

/**
 * The hero analyzer.
 *
 * Renders a real report on first paint from `precomputed.ts`, then loads the
 * same WebAssembly engine the playground uses and re-analyses on every edit.
 * If the engine cannot load, the precomputed report stays on screen and the
 * editor becomes read-only rather than lying about being live.
 */
export function Analyzer() {
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [report, setReport] = useState<Report>(PRECOMPUTED_REPORT);
  const [engineState, setEngineState] = useState<EngineState>('idle');
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [selected, setSelected] = useState(0);

  const engineRef = useRef<Engine | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const requestedRef = useRef(false);
  const runIdRef = useRef(0);

  const reduceMotion = useReducedMotion();

  const startEngine = useCallback(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    loadEngine()
      .then((engine) => {
        engineRef.current = engine;
        setEngineState('ready');
      })
      .catch(() => setEngineState('unavailable'));
  }, []);

  // Load on idle so the engine never competes with first paint, and on first
  // interaction so a fast typist is not left waiting for the idle callback.
  useEffect(() => {
    const idle = window.requestIdleCallback;
    if (typeof idle === 'function') {
      const handle = idle(() => startEngine(), { timeout: 2500 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = setTimeout(startEngine, 1200);
    return () => clearTimeout(timer);
  }, [startEngine]);

  // Re-analyse after the typing settles. Debounced, and stale runs are dropped.
  useEffect(() => {
    if (engineState !== 'ready' || sql === DEFAULT_SQL) return;
    const engine = engineRef.current;
    if (!engine) return;

    const id = ++runIdRef.current;
    const timer = setTimeout(async () => {
      const started = performance.now();
      try {
        const next = await engine.analyzeMigration(sql, PG_VERSION);
        if (runIdRef.current !== id) return;
        setElapsed(Math.max(1, Math.round(performance.now() - started)));
        setReport(next);
        setSelected(0);
      } catch {
        if (runIdRef.current === id) setEngineState('unavailable');
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [sql, engineState]);

  const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    const pre = preRef.current;
    if (!pre) return;
    pre.scrollTop = event.currentTarget.scrollTop;
    pre.scrollLeft = event.currentTarget.scrollLeft;
  };

  const violations = report.violations;
  const readOnly = engineState === 'unavailable';
  // What `--fail-on critical` does, which is the default and what CI runs.
  const blocked = report.summary.criticalCount > 0;

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface shadow-panel">
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5">
        <span className="mp-scroll overflow-x-auto whitespace-nowrap font-mono text-xs text-faint">
          {report.file}
        </span>
        <span className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-faint">
          PG {PG_VERSION}
        </span>
      </div>

      {/* Editor: a transparent textarea sitting exactly on top of coloured SQL. */}
      <div className="relative" style={{ height: EDITOR_HEIGHT }}>
        <pre
          ref={preRef}
          aria-hidden
          className="mp-scroll pointer-events-none absolute inset-0 overflow-auto whitespace-pre p-4 font-mono text-[13px] leading-[1.7] text-fg"
        >
          <Sql code={sql} />
          {'\n'}
        </pre>
        <textarea
          value={sql}
          onChange={(event) => setSql(event.target.value)}
          onScroll={syncScroll}
          onFocus={startEngine}
          onPointerDown={startEngine}
          readOnly={readOnly}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          aria-label="Migration SQL, editable"
          className="mp-scroll absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent p-4 font-mono text-[13px] leading-[1.7] text-transparent caret-accent outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line-soft bg-raised px-4 py-2.5">
        <span
          className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${
            blocked
              ? 'border-danger/40 bg-danger-soft text-danger'
              : 'border-ok/40 bg-ok-soft text-ok'
          }`}
        >
          {blocked ? 'fails --fail-on critical' : 'passes --fail-on critical'}
        </span>
        <span className="font-mono text-xs text-danger">
          {report.summary.criticalCount} critical
        </span>
        <span className="font-mono text-xs text-warn">
          {report.summary.warningCount} warnings
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className={`font-mono text-xs ${RISK_TEXT[report.riskLevel]}`}>
            {report.riskLevel} {report.riskScore}/100
          </span>
          <span className="font-mono text-xs text-faint">
            {engineState === 'ready'
              ? elapsed === null
                ? 'live'
                : `${elapsed} ms`
              : engineState === 'unavailable'
                ? 'engine unavailable'
                : 'analysed locally'}
          </span>
        </span>
      </div>

      <div className="mp-scroll overflow-y-auto" style={{ height: RESULT_HEIGHT }}>
        {report.parseError ? (
          <p className="p-4 font-mono text-[13px] leading-relaxed text-warn">{report.parseError}</p>
        ) : violations.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            No violations. All {report.summary.totalStatements} statements cleared 112 rules.
          </p>
        ) : (
          <ul>
            {violations.map((violation, index) => (
              <ViolationRow
                key={`${violation.ruleId}-${violation.line}-${index}`}
                violation={violation}
                open={selected === index}
                onToggle={() => setSelected(selected === index ? -1 : index)}
                reduceMotion={Boolean(reduceMotion)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ViolationRow({
  violation,
  open,
  onToggle,
  reduceMotion,
}: {
  violation: Violation;
  open: boolean;
  onToggle: () => void;
  reduceMotion: boolean;
}) {
  const critical = violation.severity === 'critical';

  return (
    <li className="border-b border-line-soft last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-raised"
      >
        <CaretRight
          size={12}
          weight="bold"
          className={`shrink-0 text-faint transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${critical ? 'bg-danger' : 'bg-warn'}`}
        />
        <span className={`shrink-0 font-mono text-xs ${critical ? 'text-danger' : 'text-warn'}`}>
          {violation.ruleId}
        </span>
        <span className="truncate font-mono text-xs text-muted">{violation.ruleName}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-faint">
          line {violation.line}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={reduceMotion ? {} : { height: 'auto', opacity: 1 }}
            exit={reduceMotion ? {} : { height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-4 pb-4 pl-[38px]">
              <p className="text-[13px] leading-relaxed text-muted">{violation.message}</p>
              {violation.safeAlternative && (
                <pre className="mp-scroll overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-xs leading-[1.7]">
                  <Sql code={violation.safeAlternative} />
                </pre>
              )}
              {violation.docsUrl && (
                <a
                  href={`/rules/${violation.ruleId.toLowerCase()}`}
                  className="inline-flex items-center gap-1.5 text-xs text-accent transition-colors hover:text-accent-hover"
                >
                  Why this rule exists
                  <ArrowSquareOut size={12} weight="bold" />
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
