const REPO = 'https://github.com/mickelsamuel/migrationpilot';
const RESULTS = `${REPO}/blob/main/bench/RESULTS.md`;

interface Row {
  tool: string;
  ours?: boolean;
  detected: number;
  detectedOf: number;
  detectedPct: number;
  falsePositives: number;
  falsePositivesOf: number;
  falsePositivesPct: number;
}

/** Straight from bench/RESULTS.md, headline table. */
const ROWS: Row[] = [
  { tool: 'MigrationPilot', ours: true, detected: 30, detectedOf: 33, detectedPct: 90.9, falsePositives: 1, falsePositivesOf: 17, falsePositivesPct: 5.9 },
  { tool: 'Squawk', detected: 20, detectedOf: 33, detectedPct: 60.6, falsePositives: 1, falsePositivesOf: 17, falsePositivesPct: 5.9 },
  { tool: 'pgfence', detected: 25, detectedOf: 33, detectedPct: 75.8, falsePositives: 3, falsePositivesOf: 17, falsePositivesPct: 17.6 },
];

const LINKS = [
  { label: 'Methodology', href: `${RESULTS}#what-this-measures` },
  { label: 'Corpus', href: `${REPO}/tree/main/bench/corpus` },
  { label: 'What we missed', href: `${RESULTS}#what-migrationpilot-missed` },
  { label: 'Reproduce it', href: `${RESULTS}#versions-and-setup` },
];

function Metric({
  count,
  of,
  pct,
  emphasis,
}: {
  count: number;
  of: number;
  pct: number;
  emphasis?: boolean;
}) {
  return (
    <span className="font-mono text-sm tabular-nums">
      <span className={emphasis ? 'text-fg' : 'text-muted'}>
        {count}/{of}
      </span>{' '}
      <span className="text-faint">({pct.toFixed(1)}%)</span>
    </span>
  );
}

export function BenchmarkStrip() {
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-xl font-semibold text-fg">
          Measured against Squawk and pgfence on 56 labelled migrations
        </h2>
        <p className="font-mono text-xs text-faint">bench/RESULTS.md</p>
      </div>

      <div className="mp-scroll mt-6 max-w-3xl overflow-x-auto">
        <table className="w-full min-w-[440px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="pb-2 pr-4 text-xs font-medium text-faint">Tool</th>
              <th className="pb-2 pr-4 text-xs font-medium text-faint">
                Hazards named <span className="text-faint/70">(33 dangerous files)</span>
              </th>
              <th className="pb-2 text-xs font-medium text-faint">
                False positives <span className="text-faint/70">(17 safe files)</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.tool} className="border-b border-line-soft last:border-b-0">
                <td className="py-3 pr-4">
                  <span className={`text-sm ${row.ours ? 'font-medium text-fg' : 'text-muted'}`}>
                    {row.tool}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <Metric
                    count={row.detected}
                    of={row.detectedOf}
                    pct={row.detectedPct}
                    emphasis={row.ours}
                  />
                </td>
                <td className="py-3">
                  <Metric
                    count={row.falsePositives}
                    of={row.falsePositivesOf}
                    pct={row.falsePositivesPct}
                    emphasis={row.ours}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-5 max-w-2xl text-[13px] leading-relaxed text-muted">
        56 labelled files. Author-built corpus. Tools pinned. Detection is strict: the tool has to
        name the specific hazard the file was written to contain. Every file MigrationPilot missed
        is listed by name in the results.
      </p>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="text-[13px] text-accent transition-colors hover:text-accent-hover"
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}
