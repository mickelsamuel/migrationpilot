'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CaretRight } from '@phosphor-icons/react/ssr';
import type { Report, Violation } from '../playground/engine';
import { Sql } from '@/components/sql';
import { DEFAULT_SQL, ENGINE_MANIFEST, PRECOMPUTED_REPORT } from './precomputed';

const PG_VERSION = ENGINE_MANIFEST.pgVersion;
// The worker URL carries the engine hash so a cached worker can never pair with
// a different engine build.
const WORKER_URL = `/playground/worker.js?v=${ENGINE_MANIFEST.engineBundleSha}`;

const EDITOR_HEIGHT = 212;
const RESULT_HEIGHT = 380;
const DEBOUNCE_MS = 180;
const HANG_MS = 8000;
const MAX_CHARS = 20_000;

type EngineState = 'idle' | 'ready' | 'unavailable';

const RISK_CHIP: Record<Report['riskLevel'], string> = {
  RED: 'border-danger/40 bg-danger-soft text-danger',
  YELLOW: 'border-warn/40 bg-warn-soft text-warn',
  GREEN: 'border-ok/40 bg-ok-soft text-ok',
};

/**
 * The hero analyzer.
 *
 * First paint is a real report, generated from this exact engine build at build
 * time (see scripts/build-home-fixture.js) and server-rendered, so the panel is
 * correct before any JavaScript runs. The engine itself then loads into a Web
 * Worker on idle or on first interaction, never on the path to first paint, and
 * every later edit is analysed off the main thread.
 *
 * If the worker cannot start, or WASM is blocked, the precomputed report stays
 * on screen and the widget offers the CLI instead of pretending to be live.
 */
export function Analyzer() {
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [report, setReport] = useState<Report>(PRECOMPUTED_REPORT);
  const [engineState, setEngineState] = useState<EngineState>('idle');
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [selected, setSelected] = useState(0);

  const workerRef = useRef<Worker | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const requestedRef = useRef(false);
  const jobRef = useRef(0);
  const hangRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reduceMotion = useReducedMotion();

  const teardown = useCallback((state: EngineState) => {
    if (hangRef.current) clearTimeout(hangRef.current);
    workerRef.current?.terminate();
    workerRef.current = null;
    setEngineState(state);
  }, []);

  const startEngine = useCallback(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;

    let worker: Worker;
    try {
      worker = new Worker(WORKER_URL);
    } catch {
      setEngineState('unavailable');
      return;
    }

    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'ready') {
        setEngineState('ready');
        return;
      }
      if (msg?.type === 'fatal') {
        teardown('unavailable');
        return;
      }
      // A message from a superseded job is dropped: latest request wins.
      if (msg?.id !== jobRef.current) return;
      if (hangRef.current) clearTimeout(hangRef.current);

      if (msg.type === 'result') {
        setReport(msg.report as Report);
        setSelected(0);
      } else {
        teardown('unavailable');
      }
    };
    worker.onerror = () => teardown('unavailable');
    workerRef.current = worker;
  }, [teardown]);

  // Idle so the engine never competes with first paint, and on first interaction
  // so a fast typist is not left waiting for the idle callback.
  useEffect(() => {
    const idle = window.requestIdleCallback;
    if (typeof idle === 'function') {
      const handle = idle(() => startEngine(), { timeout: 2500 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = setTimeout(startEngine, 1200);
    return () => clearTimeout(timer);
  }, [startEngine]);

  useEffect(
    () => () => {
      if (hangRef.current) clearTimeout(hangRef.current);
      workerRef.current?.terminate();
    },
    [],
  );

  // Re-analyse once typing settles.
  useEffect(() => {
    if (engineState !== 'ready' || sql === DEFAULT_SQL) return;
    const worker = workerRef.current;
    if (!worker) return;

    const timer = setTimeout(() => {
      const id = ++jobRef.current;
      const started = performance.now();

      if (hangRef.current) clearTimeout(hangRef.current);
      hangRef.current = setTimeout(() => {
        // A worker that has stopped answering is not coming back.
        requestedRef.current = true;
        teardown('unavailable');
      }, HANG_MS);

      const settle = (event: MessageEvent) => {
        if (event.data?.id === id) {
          setElapsed(Math.max(1, Math.round(performance.now() - started)));
          worker.removeEventListener('message', settle);
        }
      };
      worker.addEventListener('message', settle);
      worker.postMessage({ type: 'analyze', id, sql, pgVersion: PG_VERSION });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [sql, engineState, teardown]);

  const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    const pre = preRef.current;
    if (!pre) return;
    pre.scrollTop = event.currentTarget.scrollTop;
    pre.scrollLeft = event.currentTarget.scrollLeft;
  };

  const violations = report.violations;
  const blocked = report.summary.criticalCount > 0;
  const unavailable = engineState === 'unavailable';
  const parseFailed = Boolean(report.parseError);
  const engineLabel =
    engineState === 'ready'
      ? elapsed === null
        ? 'live'
        : `${elapsed} ms`
      : unavailable
        ? 'static'
        : 'analysed locally';

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface shadow-panel">
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5">
        <span className="mp-scroll overflow-x-auto whitespace-nowrap font-mono text-xs text-faint">
          {report.file}
        </span>
        <span className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted">
          PostgreSQL {PG_VERSION}
        </span>
      </div>

      {/* A transparent textarea sitting exactly on top of coloured SQL. */}
      <div className="relative" style={{ height: EDITOR_HEIGHT }}>
        <pre
          ref={preRef}
          aria-hidden
          className="mp-scroll pointer-events-none absolute inset-0 overflow-auto whitespace-pre p-4 font-mono text-[16px] leading-[1.7] text-fg sm:text-[13px]"
        >
          <Sql code={sql} />
          {'\n'}
        </pre>
        <label htmlFor="hero-sql" className="sr-only">
          Migration SQL. Edit it to re-run the analysis.
        </label>
        <textarea
          id="hero-sql"
          value={sql}
          onChange={(event) => setSql(event.target.value.slice(0, MAX_CHARS))}
          onScroll={syncScroll}
          onFocus={startEngine}
          onPointerDown={startEngine}
          readOnly={unavailable}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          maxLength={MAX_CHARS}
          className="mp-scroll absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent p-4 font-mono text-[16px] leading-[1.7] text-transparent caret-accent outline-none sm:text-[13px]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line-soft bg-raised px-4 py-2.5">
        {/* SQL that does not parse was never analysed, so there is no score to
            show and nothing passed. The CLI prints a red "Parse Error" and
            exits 1 for exactly this input; the strip says the same. */}
        {parseFailed ? (
          <>
            <span className="rounded border border-danger/40 bg-danger-soft px-2 py-0.5 font-mono text-[11px] font-medium text-danger">
              PARSE ERROR
            </span>
            <span className="font-mono text-xs text-muted">nothing analysed</span>
            <span className="ml-auto flex items-center gap-3">
              <span className="font-mono text-xs text-danger">exits 1</span>
              <span className="font-mono text-xs text-faint">{engineLabel}</span>
            </span>
          </>
        ) : (
          <>
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${RISK_CHIP[report.riskLevel]}`}
            >
              {report.riskLevel} {report.riskScore}/100
            </span>
            <span className="font-mono text-xs text-danger">
              {report.summary.criticalCount} critical
            </span>
            <span className="font-mono text-xs text-warn">
              {report.summary.warningCount} warnings
            </span>
            <span className="ml-auto flex items-center gap-3">
              <span className={`font-mono text-xs ${blocked ? 'text-danger' : 'text-ok'}`}>
                {blocked ? 'fails --fail-on critical' : 'passes --fail-on critical'}
              </span>
              <span className="font-mono text-xs text-faint">{engineLabel}</span>
            </span>
          </>
        )}
      </div>

      {unavailable && (
        <p className="border-b border-line-soft bg-surface px-4 py-3 text-[13px] leading-relaxed text-muted">
          The in-browser engine could not start here, so this stays on the result it was built
          with. Run it locally instead:{' '}
          <code className="font-mono text-[13px] text-fg">
            npx migrationpilot analyze migration.sql
          </code>
        </p>
      )}

      <div className="mp-scroll overflow-y-auto" style={{ height: RESULT_HEIGHT }}>
        {parseFailed ? (
          <div className="space-y-2 p-4">
            <p className="font-mono text-[13px] font-medium text-danger">Parse Error</p>
            <p className="font-mono text-[13px] leading-relaxed text-muted">{report.parseError}</p>
            <p className="text-[13px] leading-relaxed text-muted">
              PostgreSQL rejected this before any rule ran, so nothing here has been checked.
            </p>
          </div>
        ) : violations.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            No violations. All {report.summary.totalStatements} statements cleared{' '}
            {ENGINE_MANIFEST.offlineRuleCount} rules.
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

      <p className="border-t border-line-soft px-4 py-2.5 text-[11px] leading-relaxed text-faint">
        Static analysis: it reads the SQL, never the database. {ENGINE_MANIFEST.databaseRuleCount}{' '}
        of the {ENGINE_MANIFEST.ruleCount} rules need <code className="font-mono">--database-url</code>{' '}
        and stay silent here.
      </p>
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
        className="flex min-h-[44px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-raised"
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
              <a
                href={`/rules/${violation.ruleId.toLowerCase()}`}
                className="inline-flex min-h-[32px] items-center text-xs text-accent transition-colors hover:text-accent-hover"
              >
                Why this rule exists
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
