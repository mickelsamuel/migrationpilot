'use client';

import { useMemo, useState } from 'react';
import { CaretDown, MagnifyingGlass, X } from '@phosphor-icons/react/ssr';
import {
  impactLabels,
  lockOrder,
  operationLabels,
  operationOrder,
  remediationLabels,
  remediationOrder,
  impactOrder,
  type RuleCatalogEntry,
  type RuleImpact,
  type RuleLock,
  type RuleOperation,
  type RuleRemediation,
} from '../rule-data';

/**
 * Applicability is the one facet that is not a single field on the rule — it is
 * "what do I need before this rule can say anything", which is a mix of server
 * version, extension and connection.
 */
type Applicability = 'needs-database' | 'pg18' | 'extension' | 'no-setup';

const APPLICABILITY_LABELS: Record<Applicability, string> = {
  'no-setup': 'SQL text alone',
  'needs-database': 'Needs --database-url',
  pg18: 'PostgreSQL 18+',
  extension: 'Needs an extension',
};

const APPLICABILITY_ORDER: Applicability[] = ['no-setup', 'needs-database', 'pg18', 'extension'];

function applicabilityOf(rule: RuleCatalogEntry): Applicability[] {
  const tags: Applicability[] = [];
  if (rule.requiresDatabaseUrl) tags.push('needs-database');
  if (rule.pgMin && rule.pgMin >= 18) tags.push('pg18');
  if (rule.extension) tags.push('extension');
  if (tags.length === 0) tags.push('no-setup');
  return tags;
}

/** Everything a search should be able to land on, lowercased once up front. */
function haystack(rule: RuleCatalogEntry): string {
  return [
    rule.id,
    rule.name,
    rule.shortDesc,
    rule.description,
    rule.category,
    rule.lock,
    operationLabels[rule.operation],
    ...rule.triggerKeywords,
    ...rule.impacts.map((i) => impactLabels[i]),
  ]
    .join(' ')
    .toLowerCase();
}

interface Filters {
  operation: Set<RuleOperation>;
  impact: Set<RuleImpact>;
  lock: Set<RuleLock>;
  applicability: Set<Applicability>;
  remediation: Set<RuleRemediation>;
  severity: Set<'critical' | 'warning'>;
}

const EMPTY: Filters = {
  operation: new Set(),
  impact: new Set(),
  lock: new Set(),
  applicability: new Set(),
  remediation: new Set(),
  severity: new Set(),
};

interface Props {
  rules: RuleCatalogEntry[];
}

export function RuleIndex({ rules }: Props) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [openOnMobile, setOpenOnMobile] = useState(false);

  const indexed = useMemo(
    () => rules.map((rule) => ({ rule, text: haystack(rule), apply: applicabilityOf(rule) })),
    [rules],
  );

  const needle = query.trim().toLowerCase();

  const matches = useMemo(
    () =>
      indexed.filter(({ rule, text, apply }) => {
        if (needle && !text.includes(needle)) return false;
        if (filters.operation.size && !filters.operation.has(rule.operation)) return false;
        if (filters.impact.size && !rule.impacts.some((i) => filters.impact.has(i))) return false;
        if (filters.lock.size && !filters.lock.has(rule.lock)) return false;
        if (filters.applicability.size && !apply.some((a) => filters.applicability.has(a)))
          return false;
        if (filters.remediation.size && !filters.remediation.has(rule.remediation)) return false;
        if (filters.severity.size && !filters.severity.has(rule.severity)) return false;
        return true;
      }),
    [indexed, needle, filters],
  );

  const shown = matches.map((m) => m.rule);
  const activeCount = Object.values(filters).reduce((n, set) => n + set.size, 0);

  // Counts are of the whole catalogue, so a facet never silently vanishes; the
  // ones that would return nothing under the current filters are dimmed.
  const counts = useMemo(() => {
    const tally = <T extends string>(pick: (r: RuleCatalogEntry) => T[]) => {
      const map = new Map<T, number>();
      for (const { rule } of matches) for (const key of pick(rule)) map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    };
    return {
      operation: tally<RuleOperation>((r) => [r.operation]),
      impact: tally<RuleImpact>((r) => r.impacts),
      lock: tally<RuleLock>((r) => [r.lock]),
      applicability: tally<Applicability>((r) => applicabilityOf(r)),
      remediation: tally<RuleRemediation>((r) => [r.remediation]),
      severity: tally<'critical' | 'warning'>((r) => [r.severity]),
    };
  }, [matches]);

  function toggle<K extends keyof Filters>(group: K, value: Filters[K] extends Set<infer T> ? T : never) {
    setFilters((prev) => {
      const next = new Set(prev[group] as Set<typeof value>);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [group]: next };
    });
  }

  const clearAll = () => {
    setFilters(EMPTY);
    setQuery('');
  };

  // Grouped by the object the statement acts on — the first question an
  // engineer actually asks. Severity is a consequence, so it comes last.
  const groups = useMemo(() => {
    return operationOrder
      .map((operation) => ({
        operation,
        rules: shown.filter((rule) => rule.operation === operation),
      }))
      .filter((group) => group.rules.length > 0);
  }, [shown]);

  const facetRail = (
    <div className="space-y-7">
      <FacetGroup
        label="Operation"
        hint="What the statement acts on"
        values={operationOrder}
        labels={operationLabels}
        counts={counts.operation}
        selected={filters.operation}
        onToggle={(v) => toggle('operation', v)}
      />
      <FacetGroup
        label="Operational impact"
        hint="What it does to a live database"
        values={impactOrder}
        labels={impactLabels}
        counts={counts.impact}
        selected={filters.impact}
        onToggle={(v) => toggle('impact', v)}
      />
      <FacetGroup
        label="Lock taken"
        values={lockOrder}
        labels={Object.fromEntries(lockOrder.map((l) => [l, l === 'none' ? 'No table lock' : l])) as Record<RuleLock, string>}
        counts={counts.lock}
        selected={filters.lock}
        onToggle={(v) => toggle('lock', v)}
        mono
      />
      <FacetGroup
        label="What it needs"
        values={APPLICABILITY_ORDER}
        labels={APPLICABILITY_LABELS}
        counts={counts.applicability}
        selected={filters.applicability}
        onToggle={(v) => toggle('applicability', v)}
      />
      <FacetGroup
        label="Remediation"
        values={remediationOrder}
        labels={remediationLabels}
        counts={counts.remediation}
        selected={filters.remediation}
        onToggle={(v) => toggle('remediation', v)}
      />
      <FacetGroup
        label="Severity"
        hint="An output, not a starting point"
        values={['critical', 'warning'] as const}
        labels={{ critical: 'Critical', warning: 'Warning' }}
        counts={counts.severity}
        selected={filters.severity}
        onToggle={(v) => toggle('severity', v)}
      />
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
      {/* Filters */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <button
          type="button"
          onClick={() => setOpenOnMobile((v) => !v)}
          aria-expanded={openOnMobile}
          className="flex h-11 w-full items-center justify-between rounded-lg border border-line bg-surface px-4 text-sm text-fg lg:hidden"
        >
          <span>
            Filters{activeCount > 0 && <span className="ml-2 text-accent">{activeCount}</span>}
          </span>
          <CaretDown size={14} className={openOnMobile ? 'rotate-180' : undefined} />
        </button>

        <div className={`${openOnMobile ? 'mt-5 block' : 'hidden'} lg:mt-0 lg:block`}>
          <div className="mb-6 flex items-center justify-between">
            <p className="font-mono text-xs text-faint">
              {shown.length === rules.length ? `${rules.length} rules` : `${shown.length} of ${rules.length}`}
            </p>
            {(activeCount > 0 || needle) && (
              <button
                type="button"
                onClick={clearAll}
                className="flex items-center gap-1 font-mono text-xs text-accent transition-colors hover:text-accent-hover"
              >
                <X size={11} weight="bold" />
                clear
              </button>
            )}
          </div>
          {facetRail}
        </div>
      </div>

      {/* Results */}
      <div className="mt-8 lg:mt-0">
        <div className="relative mb-8">
          <MagnifyingGlass
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <label htmlFor="rule-search" className="sr-only">
            Search rules by id, name, or SQL
          </label>
          <input
            id="rule-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="MP084, ALTER TYPE, NOT VALID, CONCURRENTLY…"
            className="h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[16px] text-fg outline-none transition-colors placeholder:text-faint focus:border-accent sm:text-sm"
          />
        </div>

        {shown.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface px-5 py-8">
            <p className="text-sm text-muted">
              Nothing matches. Search takes rule ids like{' '}
              <span className="font-mono text-fg">MP084</span>, rule names like{' '}
              <span className="font-mono text-fg">require-not-valid-foreign-key</span>, and the SQL
              itself — <span className="font-mono text-fg">ALTER TYPE</span>,{' '}
              <span className="font-mono text-fg">SET NOT NULL</span>,{' '}
              <span className="font-mono text-fg">CONCURRENTLY</span>.
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="mt-4 text-sm text-accent transition-colors hover:text-accent-hover"
            >
              Clear everything
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            {groups.map((group) => (
              <section key={group.operation}>
                <div className="mb-3 flex items-baseline gap-3">
                  <h2 className="text-sm font-medium text-fg">
                    {operationLabels[group.operation]}
                  </h2>
                  <span className="font-mono text-xs text-faint">{group.rules.length}</span>
                </div>

                <ul className="overflow-hidden rounded-xl border border-line">
                  {group.rules.map((rule) => (
                    <li key={rule.id} className="border-b border-line-soft last:border-b-0">
                      <a
                        href={`/rules/${rule.id.toLowerCase()}`}
                        className="block bg-surface px-4 py-3 transition-colors hover:bg-raised"
                      >
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="w-14 shrink-0 font-mono text-xs text-accent">
                            {rule.id}
                          </span>
                          <span className="font-mono text-[13px] text-fg">{rule.name}</span>
                          <span
                            className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                              rule.severity === 'critical'
                                ? 'border-danger/40 bg-danger-soft text-danger'
                                : 'border-warn/40 bg-warn-soft text-warn'
                            }`}
                          >
                            {rule.severity}
                          </span>
                          <span className="w-full text-[13px] leading-snug text-muted lg:w-auto lg:flex-1 lg:text-right">
                            {rule.shortDesc}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-faint">
                          <span className={rule.lock === 'none' ? '' : 'text-muted'}>
                            {rule.lock === 'none' ? 'no table lock' : rule.lock}
                          </span>
                          {rule.impacts.slice(0, 3).map((impact) => (
                            <span key={impact}>{impactLabels[impact]}</span>
                          ))}
                          {rule.autoFixable && <span className="text-ok">auto-fix</span>}
                          {rule.requiresDatabaseUrl && <span>needs database</span>}
                          {rule.extension && <span>{rule.extension}</span>}
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FacetGroup<T extends string>({
  label,
  hint,
  values,
  labels,
  counts,
  selected,
  onToggle,
  mono,
}: {
  label: string;
  hint?: string;
  values: readonly T[];
  labels: Record<T, string>;
  counts: Map<T, number>;
  selected: Set<T>;
  onToggle: (value: T) => void;
  mono?: boolean;
}) {
  return (
    <fieldset>
      <legend className="text-[11px] uppercase tracking-wide text-faint">{label}</legend>
      {hint && <p className="mt-1 text-[11px] leading-snug text-faint/70">{hint}</p>}
      <div className="mt-2 space-y-0.5">
        {values.map((value) => {
          const count = counts.get(value) ?? 0;
          const checked = selected.has(value);
          return (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 transition-colors hover:bg-raised ${
                count === 0 && !checked ? 'opacity-35' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(value)}
                className="h-3.5 w-3.5 shrink-0 accent-accent"
              />
              <span
                className={`min-w-0 flex-1 truncate text-[12px] ${
                  checked ? 'text-fg' : 'text-muted'
                } ${mono ? 'font-mono text-[11px]' : ''}`}
              >
                {labels[value]}
              </span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-faint">{count}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
