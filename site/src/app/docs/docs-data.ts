export interface DocPage {
  slug: string;
  title: string;
  description: string;
  sections: { heading: string; content: string; code?: string; language?: string }[];
}

export const docs: DocPage[] = [
  {
    slug: 'quick-start',
    title: 'Quick Start',
    description: 'Get started with MigrationPilot in under 2 minutes.',
    sections: [
      {
        heading: 'Install',
        content: 'Install MigrationPilot globally or use it directly with npx:',
        code: `# Run without installing
npx migrationpilot analyze migration.sql

# Or install globally
npm install -g migrationpilot
migrationpilot analyze migration.sql`,
        language: 'bash',
      },
      {
        heading: 'Analyze a Migration',
        content: 'Point MigrationPilot at any SQL file. It parses the DDL using the real PostgreSQL parser and checks against 80 safety rules.',
        code: `# Analyze a single file
migrationpilot analyze migrations/001_add_users.sql

# Analyze all migrations in a directory
migrationpilot check ./migrations

# Read from stdin
cat migration.sql | migrationpilot analyze --stdin`,
        language: 'bash',
      },
      {
        heading: 'Understand the Output',
        content: 'MigrationPilot shows a color-coded summary with risk level (GREEN/YELLOW/RED), violation severity (critical/warning), lock types acquired, and safe alternatives for each issue found.',
      },
      {
        heading: 'Auto-fix Issues',
        content: 'Some violations can be fixed automatically. Preview changes first with --dry-run:',
        code: `# Preview fixes
migrationpilot analyze migration.sql --fix --dry-run

# Apply fixes
migrationpilot analyze migration.sql --fix`,
        language: 'bash',
      },
      {
        heading: 'Add to CI',
        content: 'Add MigrationPilot to your CI pipeline to catch unsafe migrations before merge. See the GitHub Action, GitLab CI, and Bitbucket Pipelines setup guides for detailed instructions.',
      },
    ],
  },
  {
    slug: 'configuration',
    title: 'Configuration',
    description: 'Configure MigrationPilot with a YAML config file or package.json.',
    sections: [
      {
        heading: 'Config File Locations',
        content: 'MigrationPilot searches for config files in priority order, walking up from the current directory:',
        code: `.migrationpilotrc.yml      # highest priority
.migrationpilotrc.yaml
migrationpilot.config.yml
migrationpilot.config.yaml
package.json               # "migrationpilot" key`,
      },
      {
        heading: 'Generate a Config File',
        content: 'Use the init command to generate a default configuration file:',
        code: `migrationpilot init`,
        language: 'bash',
      },
      {
        heading: 'Full Configuration Reference',
        content: 'Here is a complete configuration file with all available options:',
        code: `# .migrationpilotrc.yml

# Extend a built-in preset: recommended, strict, ci, startup, enterprise
extends: "migrationpilot:recommended"

# Target PostgreSQL version (9-20)
pgVersion: 17

# Fail CI on severity level: critical, warning, never
failOn: critical

# Default migration file pattern
migrationPath: "migrations/**/*.sql"

# Per-rule configuration
rules:
  MP001: true                    # enable (default)
  MP037: false                   # disable a rule
  MP004:
    severity: warning            # downgrade from critical
  MP013:
    threshold: 5000              # custom threshold (default: 10000)
  MP014:
    threshold: 500000            # custom threshold (default: 1000000)

# Production context thresholds
thresholds:
  highTrafficQueries: 10000      # MP013: min query count
  largeTableRows: 1000000        # MP014: min row count
  redScore: 50                   # Risk score for RED
  yellowScore: 25                # Risk score for YELLOW

# Files to ignore (glob patterns)
ignore:
  - "migrations/seed_*.sql"
  - "migrations/test_*.sql"

# Audit logging (enterprise)
auditLog:
  enabled: true
  path: ./migrationpilot-audit.jsonl`,
        language: 'yaml',
      },
      {
        heading: 'Built-in Presets',
        content: 'MigrationPilot includes five presets you can extend. "recommended" uses default settings with failOn: critical. "strict" promotes all rules to critical severity and fails on warnings. "ci" is optimized for CI with failOn: critical and no ignore patterns. "startup" disables nitpicky rules for early-stage teams. "enterprise" enables maximum safety with audit logging.',
        code: `# Use the strict preset
extends: "migrationpilot:strict"

# Override individual rules from the preset
rules:
  MP037: false   # disable in strict mode`,
        language: 'yaml',
      },
      {
        heading: 'Inline Disable Comments',
        content: 'Disable specific rules for individual statements with SQL comments:',
        code: `-- migrationpilot-disable MP001
CREATE INDEX idx_users_email ON users (email);

-- migrationpilot-disable MP001,MP004
ALTER TABLE orders ADD COLUMN status text;`,
        language: 'sql',
      },
      {
        heading: 'package.json Configuration',
        content: 'Alternatively, add configuration to your package.json under the "migrationpilot" key:',
        code: `{
  "migrationpilot": {
    "pgVersion": 16,
    "failOn": "warning",
    "rules": {
      "MP037": false
    }
  }
}`,
        language: 'json',
      },
    ],
  },
  {
    slug: 'github-action',
    title: 'GitHub Action',
    description: 'Run MigrationPilot as a GitHub Action to catch unsafe migrations in pull requests.',
    sections: [
      {
        heading: 'Basic Setup',
        content: 'Add MigrationPilot to your GitHub Actions workflow to automatically analyze migration files on every pull request:',
        code: `# .github/workflows/migration-check.yml
name: Migration Safety Check
on:
  pull_request:
    paths:
      - 'migrations/**'

permissions:
  contents: read
  pull-requests: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mickelsamuel/migrationpilot@v1
        with:
          path: migrations/
          fail-on: critical`,
        language: 'yaml',
      },
      {
        heading: 'Action Inputs',
        content: 'The GitHub Action supports the following inputs:',
        code: `- uses: mickelsamuel/migrationpilot@v1
  with:
    # Path to migration files (required)
    path: migrations/

    # Glob pattern for SQL files (default: **/*.sql)
    pattern: "V*.sql"

    # Target PostgreSQL version (default: 17)
    pg-version: "16"

    # Fail threshold: critical, warning, never (default: critical)
    fail-on: critical

    # Production database URL for context (Pro tier)
    database-url: \${{ secrets.DATABASE_URL }}

    # License key for Pro features
    license-key: \${{ secrets.MIGRATIONPILOT_LICENSE }}

    # Comma-separated rules to exclude
    exclude: "MP037,MP041"

    # SARIF file output path
    sarif-file: results.sarif`,
        language: 'yaml',
      },
      {
        heading: 'PR Comment Output',
        content: 'MigrationPilot automatically posts a comment on the pull request with a summary of findings. The comment includes risk level, violation details with severity, lock types, and safe alternatives. Comments are updated on subsequent pushes rather than duplicated.',
      },
      {
        heading: 'SARIF Integration',
        content: 'Upload SARIF results to GitHub Code Scanning for inline annotations:',
        code: `- uses: mickelsamuel/migrationpilot@v1
  with:
    path: migrations/
    sarif-file: results.sarif

- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
    sarif_file: results.sarif`,
        language: 'yaml',
      },
      {
        heading: 'Production Context (Pro)',
        content: 'With a Pro license, the Action can connect to your database to check table sizes, query patterns, and connection counts for context-aware analysis:',
        code: `- uses: mickelsamuel/migrationpilot@v1
  with:
    path: migrations/
    database-url: \${{ secrets.DATABASE_URL }}
    license-key: \${{ secrets.MIGRATIONPILOT_LICENSE }}`,
        language: 'yaml',
      },
    ],
  },
  {
    slug: 'ci-integration',
    title: 'CI Integration',
    description: 'Integrate MigrationPilot with GitHub Actions, GitLab CI, Bitbucket Pipelines, and other CI systems.',
    sections: [
      {
        heading: 'GitHub Actions',
        content: 'Use the official GitHub Action for the best experience with automatic PR comments. See the GitHub Action page for full details.',
        code: `- uses: mickelsamuel/migrationpilot@v1
  with:
    path: migrations/
    fail-on: critical`,
        language: 'yaml',
      },
      {
        heading: 'GitLab CI',
        content: 'Add MigrationPilot to your .gitlab-ci.yml pipeline:',
        code: `migration-check:
  stage: test
  image: node:22-slim
  script:
    - npx migrationpilot check ./migrations --fail-on critical
  rules:
    - changes:
        - migrations/**/*.sql`,
        language: 'yaml',
      },
      {
        heading: 'Bitbucket Pipelines',
        content: 'Add MigrationPilot to your bitbucket-pipelines.yml:',
        code: `pipelines:
  pull-requests:
    '**':
      - step:
          name: Migration Safety Check
          image: node:22-slim
          script:
            - npx migrationpilot check ./migrations --fail-on critical`,
        language: 'yaml',
      },
      {
        heading: 'Generic CI (Jenkins, CircleCI, etc.)',
        content: 'MigrationPilot works with any CI system that supports Node.js:',
        code: `# Install and run
npm install -g migrationpilot
migrationpilot check ./migrations --fail-on critical --format json

# Or use npx (no install needed)
npx migrationpilot check ./migrations --fail-on critical`,
        language: 'bash',
      },
      {
        heading: 'Exit Codes',
        content: 'MigrationPilot uses standard exit codes for CI integration: 0 means no issues found, 1 means warnings detected (when --fail-on warning), and 2 means critical violations detected. Use --fail-on never to always exit 0.',
      },
      {
        heading: 'Output Formats',
        content: 'Choose the output format that works best for your CI system:',
        code: `# Human-readable (default)
migrationpilot check ./migrations

# JSON for parsing
migrationpilot check ./migrations --format json

# SARIF for code scanning
migrationpilot check ./migrations --format sarif

# Markdown for reports
migrationpilot check ./migrations --format markdown

# Quiet mode (one line per violation)
migrationpilot analyze migration.sql --quiet`,
        language: 'bash',
      },
    ],
  },
  {
    slug: 'programmatic-api',
    title: 'Programmatic API',
    description: 'Use MigrationPilot as a library in your Node.js applications.',
    sections: [
      {
        heading: 'Installation',
        content: 'Install MigrationPilot as a dependency:',
        code: `npm install migrationpilot`,
        language: 'bash',
      },
      {
        heading: 'Basic Usage',
        content: 'Import and use the analysis pipeline:',
        code: `import { analyzeSQL, allRules } from 'migrationpilot';

const sql = \`
  ALTER TABLE users ADD COLUMN email text;
  CREATE INDEX idx_users_email ON users (email);
\`;

const result = await analyzeSQL(sql, 'migration.sql', 17, allRules);

console.log(result.overallRisk);    // { level: 'YELLOW', score: 35 }
console.log(result.violations);     // Array of violations
console.log(result.statements);     // Parsed statements with lock types`,
        language: 'typescript',
      },
      {
        heading: 'Available Exports',
        content: 'The programmatic API exports these functions and types:',
        code: `import {
  // Core analysis
  analyzeSQL,              // Full analysis pipeline
  parseMigration,          // SQL → AST parsing
  extractTargets,          // AST → table/column targets
  classifyLock,            // Statement → lock type

  // Rules
  allRules,                // All free-tier rules
  runRules,                // Run rules against statements

  // Scoring
  calculateRisk,           // Calculate risk score

  // Output formatters
  formatCliOutput,         // Terminal table output
  formatSarif,             // SARIF v2.1.0
  formatJson,              // Structured JSON
  formatPrComment,         // GitHub PR comment

  // Auto-fix
  autoFix,                 // Apply automatic fixes
  isFixable,               // Check if a rule is fixable

  // Utilities
  detectFrameworks,        // Detect migration frameworks
  loadConfig,              // Load configuration
} from 'migrationpilot';`,
        language: 'typescript',
      },
      {
        heading: 'Custom Rule Filtering',
        content: 'Filter rules to only check specific categories:',
        code: `import { analyzeSQL, allRules } from 'migrationpilot';

// Only check lock-related rules
const lockRules = allRules.filter(r =>
  ['MP001', 'MP004', 'MP006', 'MP008'].includes(r.id)
);

const result = await analyzeSQL(sql, 'file.sql', 17, lockRules);`,
        language: 'typescript',
      },
      {
        heading: 'JSON Output Schema',
        content: 'The JSON output follows a versioned schema for stability:',
        code: `{
  "$schema": "https://migrationpilot.dev/schemas/report-v1.json",
  "version": "1.4.0",
  "file": "migration.sql",
  "overallRisk": { "level": "RED", "score": 75 },
  "statementCount": 3,
  "ruleCount": 80,
  "violations": [
    {
      "ruleId": "MP001",
      "ruleName": "require-concurrent-index",
      "severity": "critical",
      "message": "CREATE INDEX acquires ACCESS EXCLUSIVE lock...",
      "statement": "CREATE INDEX idx_users_email ON users (email);",
      "line": 2,
      "fix": "CREATE INDEX CONCURRENTLY idx_users_email ON users (email);"
    }
  ]
}`,
        language: 'json',
      },
    ],
  },
  {
    slug: 'cli-reference',
    title: 'CLI Reference',
    description: 'Complete reference for all MigrationPilot CLI commands and options.',
    sections: [
      {
        heading: 'analyze',
        content: 'Analyze a single migration file for safety issues.',
        code: `migrationpilot analyze <file> [options]

Options:
  --pg-version <version>    Target PostgreSQL version (default: 17)
  --format <format>         Output: text, json, sarif, markdown
  --fail-on <severity>      Exit code threshold: critical, warning, never
  --database-url <url>      PostgreSQL connection for production context
  --license-key <key>       License key for Pro features
  --fix                     Auto-fix safe violations
  --dry-run                 Preview fixes without writing (use with --fix)
  --stdin                   Read SQL from stdin
  --quiet                   One-line-per-violation output
  --verbose                 Show all checks including passing
  --exclude <rules>         Comma-separated rules to skip
  --offline                 Skip update checks and network access
  --no-config               Ignore config file`,
        language: 'text',
      },
      {
        heading: 'check',
        content: 'Analyze all migration files in a directory.',
        code: `migrationpilot check <dir> [options]

Options:
  --pattern <glob>          File pattern (default: **/*.sql)
  --pg-version <version>    Target PostgreSQL version
  --format <format>         Output: text, json, sarif, markdown
  --fail-on <severity>      Exit code threshold
  --database-url <url>      PostgreSQL connection for production context
  --license-key <key>       License key for Pro features
  --exclude <rules>         Comma-separated rules to skip
  --offline                 Skip update checks and network access
  --no-config               Ignore config file`,
        language: 'text',
      },
      {
        heading: 'plan',
        content: 'Show execution plan with lock timeline visualization.',
        code: `migrationpilot plan <file> [options]

Options:
  --pg-version <version>    Target PostgreSQL version`,
        language: 'text',
      },
      {
        heading: 'init',
        content: 'Generate a default .migrationpilotrc.yml config file.',
        code: `migrationpilot init`,
        language: 'bash',
      },
      {
        heading: 'detect',
        content: 'Detect migration frameworks in the current project.',
        code: `migrationpilot detect [dir]`,
        language: 'bash',
      },
      {
        heading: 'watch',
        content: 'Watch migration files for changes and analyze on save.',
        code: `migrationpilot watch <dir> [options]

Options:
  --pattern <glob>          File pattern (default: **/*.sql)
  --pg-version <version>    Target PostgreSQL version`,
        language: 'text',
      },
      {
        heading: 'hook',
        content: 'Install or uninstall a Git pre-commit hook.',
        code: `migrationpilot hook install [dir]
migrationpilot hook uninstall [dir]`,
        language: 'bash',
      },
      {
        heading: 'list-rules',
        content: 'List all available safety rules.',
        code: `migrationpilot list-rules [options]

Options:
  --json                    Output as JSON
  --severity <level>        Filter by severity`,
        language: 'text',
      },
      {
        heading: 'doctor',
        content: 'Run diagnostic checks on your environment.',
        code: `migrationpilot doctor`,
        language: 'bash',
      },
      {
        heading: 'trends',
        content: 'View historical analysis trends.',
        code: `migrationpilot trends [options]

Options:
  --format <format>         Output: text, json`,
        language: 'text',
      },
      {
        heading: 'drift',
        content: 'Compare two database schemas for differences.',
        code: `migrationpilot drift [options]

Options:
  --source <url>            Source database connection string
  --target <url>            Target database connection string
  --schema <name>           Schema to compare (default: public)
  --format <format>         Output: text, json`,
        language: 'text',
      },
      {
        heading: 'completion',
        content: 'Generate shell completion scripts.',
        code: `# Bash
migrationpilot completion bash >> ~/.bashrc

# Zsh
migrationpilot completion zsh >> ~/.zshrc

# Fish
migrationpilot completion fish > ~/.config/fish/completions/migrationpilot.fish`,
        language: 'bash',
      },
    ],
  },
];
