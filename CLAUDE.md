# MigrationPilot

PostgreSQL migration safety CLI + GitHub Action. Analyzes DDL for lock types, table sizes, query impact, and service dependencies. Posts results as PR comments.

## Commands
- `pnpm dev` - Run CLI in dev mode via tsx
- `pnpm build` - Build with esbuild
- `pnpm test` - Run vitest (550+ tests across 31 files)
- `pnpm lint` - Lint with eslint

## Stack
- TypeScript (ESM, strict), Node.js 20+, pnpm
- libpg-query (WASM PG parser), pg (DB client), commander (CLI), chalk + cli-table3 (output)
- vitest + PGlite (unit tests), esbuild (bundle)
- Stripe (billing), Resend (email)

## Architecture
- `src/parser/` - DDL parsing with libpg-query WASM
- `src/locks/` - Lock type classification (pure lookup table)
- `src/rules/` - 48 safety rules (MP001-MP048), engine, registry, shared helpers, inline disable
- `src/production/` - Production context queries (PAID tier: MP013, MP014, MP019)
- `src/scoring/` - Risk scoring (RED/YELLOW/GREEN)
- `src/generator/` - Safe migration SQL generation
- `src/output/` - CLI table (quiet/verbose/timing), PR comment, SARIF v2.1.0, markdown, JSON (versioned schema), execution plan, structured errors
- `src/analysis/` - Shared analyzeSQL pipeline, transaction boundary + migration ordering validation
- `src/index.ts` - Programmatic API entry point (17 exports)
- `src/fixer/` - Auto-fix engine (MP001, MP004, MP009, MP020, MP030, MP033)
- `src/frameworks/` - Migration framework detection (14 frameworks)
- `src/watch/` - File watcher with debounce
- `src/hooks/` - Git pre-commit hook installer
- `src/config/` - Config file system (.migrationpilotrc.yml), 3 built-in presets
- `src/action/` - GitHub Action entry point
- `src/license/` - License key validation (HMAC-SHA256, client-side)
- `src/billing/` - Stripe checkout + webhook + Resend email
- `src/cli.ts` - CLI entry (8 commands: analyze, check, plan, init, detect, watch, hook, list-rules; --stdin, --fix --dry-run, --quiet, --verbose, --format json/sarif/markdown, --no-color, --exclude, severity overrides, help examples)
- `site/` - Landing page (Next.js 16 + Tailwind CSS 4)
- `api/` - Vercel serverless (checkout, stripe-webhook)

## Code Rules
- 2-space indent, ESM imports, strict TypeScript
- Each rule file exports a single Rule object (id, name, severity, description, whyItMatters, docsUrl, check fn)
- Pure functions for parser, lock classifier, rules — no side effects
- Only production/, license/, billing/ modules may do I/O
- All PR comment output must be valid GitHub-Flavored Markdown
- CJS format for bundles (handles commander + @actions require())

## Critical Warnings
- NEVER read user table data from production DBs — only pg_stat_*, pg_class, pg_roles
- NEVER run DDL against any database — read-only analysis only
- License validation is client-side, no telemetry by default
- Free rules: MP001-MP012, MP015-MP018, MP020-MP048 (excl. MP013, MP014, MP019). Paid: MP013, MP014, MP019
- Exit codes: 0=clean, 1=warnings (with --fail-on warning), 2=critical violations

## Session Management
- ALWAYS read PROGRESS.md at session start to restore context
- ALWAYS update PROGRESS.md before finishing work or when asked to compact
- When compacting, preserve: current phase, completed files, next steps, test status
- Use TaskCreate for multi-step work
- Use subagents ONLY for isolated research — never for core implementation

## References
- @PROGRESS.md - Current status and next steps
- @PLAN.md - Implementation plan and phase breakdown
- @improvement/ - 12-doc research hub (competitors, features, strategy, action list)
- @improvement/10-master-action-list.md - Prioritized task list
