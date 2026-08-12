'use client';

import { useEffect, useState } from 'react';
import { GithubLogo, List, X } from '@phosphor-icons/react/ssr';

export type NavKey = 'docs' | 'rules' | 'benchmark' | 'blog' | 'pricing' | 'playground';

interface NavbarProps {
  active?: NavKey;
}

const LINKS: Array<{ key: NavKey; label: string; href: string }> = [
  { key: 'docs', label: 'Docs', href: '/docs' },
  { key: 'rules', label: 'Rules', href: '/rules' },
  { key: 'benchmark', label: 'Benchmark', href: '/benchmark' },
  { key: 'blog', label: 'Blog', href: '/blog' },
  { key: 'pricing', label: 'Pricing', href: '/pricing' },
];

const REPO = 'https://github.com/mickelsamuel/migrationpilot';

/**
 * The MigrationPilot mark, "Threshold": a shell prompt aimed at the one opening
 * in a gate. Geometry matches app/icon.svg and public/logo-400.svg — those are
 * the same three strokes in a 32-unit tile, so keep all four in step.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <g
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7.3 7.5 11.8 12l-4.5 4.5" />
        <path d="M16.7 4.5v5.6" />
        <path d="M16.7 13.9v5.6" />
      </g>
    </svg>
  );
}

export default function Navbar({ active }: NavbarProps) {
  const [open, setOpen] = useState(false);

  // A same-page hash link does not remount the nav, so the menu has to close
  // itself. Escape closes it too, and the body stays put while it is open.
  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('hashchange', close);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('hashchange', close);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line-soft bg-bg/85 backdrop-blur-xl">
      <nav className="mp-container flex h-14 items-center justify-between gap-4">
        <a
          href="/"
          className="-ml-1 flex h-11 items-center gap-2.5 px-1 text-fg"
          aria-label="MigrationPilot home"
        >
          <Mark className="h-[22px] w-[22px] text-accent" />
          <span className="text-[15px] font-semibold tracking-tight">MigrationPilot</span>
        </a>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.key}
              href={link.href}
              aria-current={active === link.key ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                active === link.key ? 'text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              {link.label}
            </a>
          ))}
          <a
            href={REPO}
            aria-label="MigrationPilot on GitHub"
            className="ml-1 rounded-lg p-2 text-muted transition-colors hover:text-fg"
          >
            <GithubLogo size={18} />
          </a>
          <a
            href="/playground"
            aria-current={active === 'playground' ? 'page' : undefined}
            className="ml-1 rounded-lg border border-accent/40 bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:border-accent hover:text-fg"
          >
            Playground
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X size={22} /> : <List size={22} />}
        </button>
      </nav>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-x-0 bottom-0 top-14 z-40 cursor-default bg-bg/70 backdrop-blur-sm md:hidden"
          />
          <div className="relative z-50 border-t border-line-soft bg-bg px-5 pb-4 pt-2 md:hidden">
            {LINKS.map((link) => (
              <a
                key={link.key}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={active === link.key ? 'page' : undefined}
                className={`flex min-h-[44px] items-center rounded-lg px-2 text-[15px] ${
                  active === link.key ? 'text-fg' : 'text-muted'
                }`}
              >
                {link.label}
              </a>
            ))}
            <a
              href={REPO}
              onClick={() => setOpen(false)}
              className="flex min-h-[44px] items-center rounded-lg px-2 text-[15px] text-muted"
            >
              GitHub
            </a>
            <a
              href="/playground"
              onClick={() => setOpen(false)}
              className="mt-2 flex min-h-[44px] items-center justify-center rounded-lg border border-accent/40 bg-accent-soft px-3 text-[15px] font-medium text-accent"
            >
              Playground
            </a>
          </div>
        </>
      )}
    </header>
  );
}
