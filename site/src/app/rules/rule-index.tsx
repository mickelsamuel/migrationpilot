'use client';

import { useMemo, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react/ssr';
import type { RuleCatalogEntry, RuleCategory } from '../rule-data';

interface Props {
  categories: { title: RuleCategory; rules: RuleCatalogEntry[] }[];
}

/**
 * The rule index, filtered in the page.
 *
 * Every row is server-rendered first, so the whole catalog is in the HTML and
 * findable without JavaScript. The filter only hides rows that are already
 * there.
 */
export function RuleIndex({ categories }: Props) {
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return categories;
    return categories
      .map((category) => ({
        title: category.title,
        rules: category.rules.filter((rule) =>
          `${rule.id} ${rule.name} ${rule.shortDesc}`.toLowerCase().includes(needle),
        ),
      }))
      .filter((category) => category.rules.length > 0);
  }, [categories, needle]);

  const shown = filtered.reduce((total, category) => total + category.rules.length, 0);
  const all = categories.reduce((total, category) => total + category.rules.length, 0);

  return (
    <>
      <div className="sticky top-14 z-30 -mx-5 mb-10 border-b border-line-soft bg-bg/90 px-5 py-4 backdrop-blur-xl sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <MagnifyingGlass
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <label htmlFor="rule-filter" className="sr-only">
              Filter rules by id, name or description
            </label>
            <input
              id="rule-filter"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by id, name or lock"
              className="h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[16px] text-fg outline-none transition-colors placeholder:text-faint focus:border-accent sm:text-sm"
            />
          </div>
          <p className="font-mono text-xs text-faint">
            {shown === all ? `${all} rules` : `${shown} of ${all}`}
          </p>
        </div>
      </div>

      {shown === 0 ? (
        <p className="text-sm text-muted">
          Nothing matches <span className="font-mono text-fg">{query}</span>. Rule ids look like{' '}
          <span className="font-mono text-fg">MP001</span>; names look like{' '}
          <span className="font-mono text-fg">require-concurrent-index-creation</span>.
        </p>
      ) : (
        <div className="space-y-12">
          {filtered.map((category) => (
            <section key={category.title}>
              <div className="mb-4 flex items-baseline gap-3">
                <h2 className="text-base font-medium text-fg">{category.title}</h2>
                <span className="font-mono text-xs text-faint">{category.rules.length}</span>
              </div>

              <ul className="overflow-hidden rounded-xl border border-line">
                {category.rules.map((rule) => (
                  <li key={rule.id} className="border-b border-line-soft last:border-b-0">
                    <a
                      href={`/rules/${rule.id.toLowerCase()}`}
                      className="flex min-h-[56px] flex-wrap items-center gap-x-4 gap-y-1 bg-surface px-4 py-3 transition-colors hover:bg-raised"
                    >
                      <span className="w-14 shrink-0 font-mono text-xs text-accent">{rule.id}</span>
                      <span className="font-mono text-[13px] text-fg">{rule.name}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                            rule.severity === 'critical'
                              ? 'border-danger/40 bg-danger-soft text-danger'
                              : 'border-warn/40 bg-warn-soft text-warn'
                          }`}
                        >
                          {rule.severity}
                        </span>
                        {rule.autoFixable && (
                          <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">
                            auto-fix
                          </span>
                        )}
                        {rule.requiresDatabaseUrl && (
                          <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">
                            needs database
                          </span>
                        )}
                      </span>
                      <span className="w-full text-[13px] leading-snug text-muted lg:w-auto lg:flex-1 lg:text-right">
                        {rule.shortDesc}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
