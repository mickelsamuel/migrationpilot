'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from '@phosphor-icons/react/ssr';
import { Sql } from './sql';

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    });
  }, [text]);

  return { copied, copy };
}

function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      className={[
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-raised hover:text-fg',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {copied ? <Check size={16} weight="bold" className="text-accent" /> : <Copy size={16} />}
    </button>
  );
}

/** A one-line shell command with a copy button. The `$` is decoration, not copied. */
export function CommandBlock({ command, className }: { command: string; className?: string }) {
  return (
    <div
      className={[
        'flex w-fit max-w-full items-center gap-3 rounded-xl border border-line bg-surface py-2 pl-4 pr-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span aria-hidden className="select-none font-mono text-sm text-faint">$</span>
      {/* Scrolls rather than truncating: a half-shown command is a broken one.
          mp-scroll keeps the overflow bar thin and themed, which matters on
          narrow screens where this panel almost always scrolls. */}
      <code className="mp-scroll min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-fg">
        {command}
      </code>
      <CopyButton text={command} label="Copy command" />
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
  /** Wraps long lines instead of scrolling them off the edge. */
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
          wrap ? 'whitespace-pre-wrap break-all' : '',
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
