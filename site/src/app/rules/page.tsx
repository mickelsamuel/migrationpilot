import type { Metadata } from 'next';
import Navbar from '@/components/navbar';
import { Footer } from '@/components/footer';
import {
  autoFixableRuleIds,
  productionContextRuleIds,
  ruleCatalog,
  ruleCategories,
} from '../rule-data';
import { RuleIndex } from './rule-index';

const REPO = 'https://github.com/mickelsamuel/migrationpilot';

const total = ruleCatalog.length;
const criticalCount = ruleCatalog.filter((rule) => rule.severity === 'critical').length;
const needsDatabase = productionContextRuleIds.length;
const autoFixable = autoFixableRuleIds.length;

export const metadata: Metadata = {
  title: `All ${total} rules: MigrationPilot`,
  description: `Every MigrationPilot rule: what it triggers on, the lock it names, and whether it can be fixed automatically. ${criticalCount} critical, ${autoFixable} auto-fixable, ${needsDatabase} that need a database connection.`,
  alternates: { canonical: '/rules' },
};

export default function RulesPage() {
  return (
    <>
      <Navbar active="rules" />
      <main className="pt-14">
        <section className="pb-2 pt-16 md:pt-20">
          <div className="mp-container">
            <h1 className="max-w-2xl text-[32px] font-semibold leading-[1.15] tracking-tight text-fg sm:text-[40px]">
              All {total} rules
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
              Each one names the lock a statement takes, what that lock blocks, and the pattern to
              use instead. Rule names are what you put in{' '}
              <code className="font-mono text-[15px] text-fg">.migrationpilotrc.yml</code>, so they
              are generated from the engine rather than typed here.
            </p>

            <dl className="mt-8 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line-soft sm:grid-cols-4">
              <Stat value={String(criticalCount)} label="critical" tone="danger" />
              <Stat value={String(total - criticalCount)} label="warning" tone="warn" />
              <Stat value={String(autoFixable)} label="fixed by --fix" />
              <Stat value={String(needsDatabase)} label="need a database" />
            </dl>
          </div>
        </section>

        <section className="py-10">
          <div className="mp-container">
            <RuleIndex categories={ruleCategories} />

            <p className="mt-14 max-w-2xl text-[13px] leading-relaxed text-muted">
              The {needsDatabase} catalogue-aware rules read table sizes, write traffic, replication
              state and index definitions. Without{' '}
              <code className="font-mono text-[13px] text-fg">--database-url</code> they stay silent
              rather than guess.{' '}
              <a
                href={`${REPO}/tree/main/docs/handbook`}
                className="text-accent transition-colors hover:text-accent-hover"
              >
                The handbook
              </a>{' '}
              explains the twenty hazards these rules are built on.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: 'danger' | 'warn' }) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt
        className={`font-mono text-xl tabular-nums ${
          tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-fg'
        }`}
      >
        {value}
      </dt>
      <dd className="mt-1 text-[13px] leading-snug text-muted">{label}</dd>
    </div>
  );
}
