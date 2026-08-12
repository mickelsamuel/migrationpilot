'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from '@phosphor-icons/react/ssr';
import { Sql } from './sql';

type CopyState = 'idle' | 'copied' | 'failed';

const FEEDBACK_MS = 1500;

function useCopy(text: string) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const settle = useCallback((next: CopyState) => {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), FEEDBACK_MS);
  }, []);

  const copy = useCallback(() => {
    // No clipboard at all over plain http, and writeText can be refused by
    // permission policy. Either way the button says so instead of going quiet.
    if (!navigator.clipboard?.writeText) {
      settle('failed');
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => settle('copied'),
      () => settle('failed'),
    );
  }, [text, settle]);

  return { state, copy };
}

function CopyButton({
  text,
  label,
  className,
  badge = 'left',
}: {
  text: string;
  label: string;
  /**
   * Placement for the control as a whole. It lands on the wrapper, not the
   * button, because the wrapper is what sits in the layout — and an absolutely
   * placed wrapper is its own containing block, which is what the badge below
   * anchors to.
   */
  className?: string;
  /**
   * Where the confirmation sits. Always out of flow, so nothing reflows when it
   * appears. `top` clears the content entirely and is the better place, but it
   * needs a parent that does not clip vertically — panel headers do, so those
   * take `left`.
   */
  badge?: 'left' | 'top';
}) {
  const { state, copy } = useCopy(text);
  const message = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : '';

  return (
    // rounded-lg so a background handed in by `className` follows the button's
    // shape rather than boxing it in a square.
    <span className={`flex shrink-0 items-center rounded-lg ${className ?? 'relative'}`}>
      <span
        role="status"
        aria-live="polite"
        className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-medium transition-opacity ${
          badge === 'top'
            ? 'bottom-full right-0 mb-1'
            : 'right-full top-1/2 mr-1.5 -translate-y-1/2'
        } ${
          state === 'idle'
            ? 'opacity-0'
            : state === 'copied'
              ? 'border-accent/40 bg-accent-soft text-accent opacity-100'
              : 'border-danger/40 bg-danger-soft text-danger opacity-100'
        }`}
      >
        {message}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={state === 'idle' ? label : message}
        className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
          state === 'copied'
            ? 'text-accent'
            : state === 'failed'
              ? 'text-danger'
              : 'text-faint hover:bg-raised hover:text-fg'
        }`}
      >
        {state === 'copied' ? <Check size={16} weight="bold" /> : <Copy size={16} />}
      </button>
    </span>
  );
}

/** A one-line shell command with a copy button. The `$` is decoration, not copied. */
export function CommandBlock({ command, className }: { command: string; className?: string }) {
  return (
    <div
      className={[
        'flex w-full max-w-full items-center gap-3 rounded-xl border border-line bg-surface py-2 pl-4 pr-2 sm:w-fit',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span aria-hidden className="select-none font-mono text-[13px] text-faint">$</span>
      {/* 13px is the size at which the install command fits the hero column on
          one line — at 14px it overflowed by 16px and grew a scrollbar with no
          travel. Wrapping stays as the fallback for genuinely narrow screens,
          because a sideways scroll is indistinguishable from truncation. */}
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[13px] text-fg">
        {command}
      </code>
      <CopyButton text={command} label="Copy command" badge="top" />
    </div>
  );
}

interface CodeBlockProps {
  code: string;
  /** Shown in the panel header, e.g. a file path or a command. */
  title?: string;
  /** `sql` colours keywords; `plain` renders verbatim, for real tool output. */
  language?: 'sql' | 'plain';
  copyable?: boolean;
  className?: string;
  /** Caps the panel height and scrolls inside it. */
  maxHeight?: number;
  /** Fixes the panel height, so a row of panels lines up whatever they hold. */
  height?: number;
  /**
   * Wraps long lines instead of scrolling them off the edge. Breaks at spaces
   * where it can, and mid-token only when a single token is wider than the
   * panel — which is what a JSON line does and what a sentence should not.
   */
  wrap?: boolean;
}

export function CodeBlock({
  code,
  title,
  language = 'plain',
  copyable = true,
  className,
  maxHeight,
  height,
  wrap,
}: CodeBlockProps) {
  // Without a header row there is nowhere to hang the copy button, so it floats
  // over the panel instead. It stays visible rather than appearing on hover:
  // a control you cannot see on a touch screen is a control that does not exist.
  const floatingCopy = copyable && !title;

  return (
    <div
      className={[
        'relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={height ? { height } : undefined}
    >
      {title && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line-soft px-4 py-2">
          <span className="mp-scroll overflow-x-auto whitespace-nowrap font-mono text-xs text-faint">
            {title}
          </span>
          {copyable && <CopyButton text={code} label="Copy code" />}
        </div>
      )}
      {floatingCopy && (
        <CopyButton
          text={code}
          label="Copy code"
          className="absolute right-1.5 top-1.5 z-10 bg-surface/85 backdrop-blur-sm"
        />
      )}
      <pre
        className={[
          'mp-scroll flex-1 overflow-auto p-4 font-mono text-[13px] leading-[1.7] text-fg',
          wrap ? 'whitespace-pre-wrap break-words' : '',
          floatingCopy ? 'pr-14' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={maxHeight ? { maxHeight } : undefined}
      >
        {language === 'sql' ? <Sql code={code} /> : code}
      </pre>
    </div>
  );
}
