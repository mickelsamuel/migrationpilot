'use client';

import { useState } from 'react';

interface NavbarProps {
  active?: 'docs' | 'blog' | 'pricing';
}

export default function Navbar({ active }: NavbarProps) {
  const [open, setOpen] = useState(false);

  const linkClass = (name?: string) =>
    name === active
      ? 'text-white font-medium'
      : 'text-slate-400 hover:text-white transition-colors';

  return (
    <nav className="fixed top-0 w-full z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">MP</div>
          <span className="font-semibold text-lg">MigrationPilot</span>
        </a>
        <div className="hidden md:flex items-center gap-6 text-sm">
          <a href="/docs" className={linkClass('docs')}>Docs</a>
          <a href="/blog" className={linkClass('blog')}>Blog</a>
          <a href="/#pricing" className={linkClass('pricing')}>Pricing</a>
          <a href="https://github.com/mickelsamuel/migrationpilot" className="text-slate-400 hover:text-white transition-colors">GitHub</a>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden flex flex-col gap-1.5 p-2 -mr-2"
          aria-label="Toggle menu"
        >
          <span className={`block w-5 h-0.5 bg-slate-300 transition-transform ${open ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block w-5 h-0.5 bg-slate-300 transition-opacity ${open ? 'opacity-0' : ''}`} />
          <span className={`block w-5 h-0.5 bg-slate-300 transition-transform ${open ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-slate-800/50 bg-slate-950/95 backdrop-blur-xl px-6 py-4 space-y-3">
          <a href="/docs" onClick={() => setOpen(false)} className="block text-sm text-slate-400 hover:text-white transition-colors">Docs</a>
          <a href="/blog" onClick={() => setOpen(false)} className="block text-sm text-slate-400 hover:text-white transition-colors">Blog</a>
          <a href="/#pricing" onClick={() => setOpen(false)} className="block text-sm text-slate-400 hover:text-white transition-colors">Pricing</a>
          <a href="https://github.com/mickelsamuel/migrationpilot" className="block text-sm text-slate-400 hover:text-white transition-colors">GitHub</a>
        </div>
      )}
    </nav>
  );
}
