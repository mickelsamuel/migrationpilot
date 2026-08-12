'use client';

import { useState } from 'react';
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

/** The MigrationPilot mark: a change passing through a gate. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <rect x="3" y="3" width="18" height="18" rx="5.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.25 14.75h9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M9.4 11.1 12 8.5l2.6 2.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Navbar({ active }: NavbarProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line-soft bg-bg/85 backdrop-blur-xl">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <a href="/" className="flex items-center gap-2.5 text-fg" aria-label="MigrationPilot home">
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
            className="ml-1 rounded-lg border border-accent/35 bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:border-accent/60 hover:text-fg"
          >
            Playground
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="-mr-2 rounded-lg p-2 text-muted md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <List size={20} />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-line-soft bg-bg px-5 py-3 md:hidden">
          {LINKS.map((link) => (
            <a
              key={link.key}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`block rounded-lg px-2 py-2.5 text-sm ${
                active === link.key ? 'text-fg' : 'text-muted'
              }`}
            >
              {link.label}
            </a>
          ))}
          <a href={REPO} className="block rounded-lg px-2 py-2.5 text-sm text-muted">
            GitHub
          </a>
          <a
            href="/playground"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-lg border border-accent/35 bg-accent-soft px-3 py-2.5 text-sm font-medium text-accent"
          >
            Playground
          </a>
        </div>
      )}
    </header>
  );
}
