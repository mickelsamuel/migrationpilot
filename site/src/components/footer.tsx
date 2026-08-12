import { Mark } from './navbar';

const REPO = 'https://github.com/mickelsamuel/migrationpilot';

const COLUMNS: Array<{ heading: string; links: Array<{ label: string; href: string }> }> = [
  {
    heading: 'Product',
    links: [
      { label: 'Playground', href: '/playground' },
      { label: 'Rules', href: '/rules' },
      { label: 'Benchmark', href: '/benchmark' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Changelog', href: '/changelog' },
    ],
  },
  {
    heading: 'Docs',
    links: [
      { label: 'Quick start', href: '/docs/quick-start' },
      { label: 'CLI reference', href: '/docs/cli-reference' },
      { label: 'GitHub Action', href: '/docs/github-action' },
      { label: 'Configuration', href: '/docs/configuration' },
      { label: 'Blog', href: '/blog' },
    ],
  },
  {
    heading: 'Compare',
    links: [
      { label: 'Squawk', href: '/compare/squawk' },
      { label: 'Atlas', href: '/compare/atlas' },
      { label: 'Flyway', href: '/compare/flyway' },
      { label: 'Liquibase', href: '/compare/liquibase' },
    ],
  },
  {
    heading: 'Project',
    links: [
      { label: 'GitHub', href: REPO },
      { label: 'npm', href: 'https://www.npmjs.com/package/migrationpilot' },
      { label: 'Issues', href: `${REPO}/issues` },
      { label: 'Privacy', href: '/privacy' },
      { label: 'llms.txt', href: '/llms.txt' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line-soft py-14">
      <div className="mp-container">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-4 lg:col-span-1">
            <a href="/" className="flex items-center gap-2.5 text-fg">
              <Mark className="h-5 w-5 text-accent" />
              <span className="text-sm font-semibold tracking-tight">MigrationPilot</span>
            </a>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-faint">
              Local, deterministic analysis of PostgreSQL migrations. Free and MIT licensed.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <h3 className="mb-3 text-[13px] font-medium text-fg">{column.heading}</h3>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-[13px] text-muted transition-colors hover:text-fg"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-line-soft pt-6 text-[13px] text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>MIT licensed. Built in Montreal by Mickel Samuel.</p>
          <p>
            <a href="/terms" className="transition-colors hover:text-muted">Terms</a>
            <span aria-hidden className="px-2 text-line">/</span>
            <a href="/privacy" className="transition-colors hover:text-muted">Privacy</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
