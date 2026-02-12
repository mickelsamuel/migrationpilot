# MigrationPilot

PostgreSQL migration safety CLI + GitHub Action. Analyzes DDL for lock types, table sizes, query impact, and service dependencies. Posts results as PR comments.

## Commands
- `pnpm dev` - Run CLI in dev mode via tsx
- `pnpm build` - Build with esbuild
- `pnpm test` - Run vitest
- `pnpm lint` - Lint with eslint

## Stack
- TypeScript (ESM, strict), Node.js 20+, pnpm
- libpg-query (WASM PG parser), pg (DB client), commander (CLI), chalk + cli-table3 (output)
- vitest + PGlite (unit tests), testcontainers (integration tests)
- esbuild (bundle for GitHub Action)

## Architecture
- `src/parser/` - DDL parsing with libpg-query WASM
- `src/locks/` - Lock type classification (pure lookup table)
- `src/rules/` - 14 static analysis rules (MP001-MP014)
- `src/production/` - Production context queries (PAID tier)
- `src/scoring/` - Risk scoring (RED/YELLOW/GREEN)
- `src/generator/` - Safe migration SQL generation
- `src/output/` - CLI table + PR comment formatters
- `src/action/` - GitHub Action entry point
- `src/license/` - License key validation
- `src/cli.ts` - CLI entry (commander)

## Code Rules
- 2-space indent, ESM imports, strict TypeScript
- Each rule file exports a single Rule object (id, name, severity, check fn)
- Pure functions for parser, lock classifier, rules — no side effects
- Only production/ and license/ modules may do I/O
- All PR comment output must be valid GitHub-Flavored Markdown

## Critical Warnings
- NEVER read user table data from production DBs — only pg_stat_*, pg_class, pg_roles
- NEVER run DDL against any database — read-only analysis only
- License validation is client-side, no telemetry by default
- Test with PGlite for unit tests, testcontainers for integration tests

## Session Management
- ALWAYS read PROGRESS.md at session start to restore context
- ALWAYS update PROGRESS.md before finishing work or when asked to compact
- When compacting, preserve: current phase, completed files, next steps, test status
- Use the built-in task system (TaskCreate/TaskUpdate) for multi-step work
- Use subagents ONLY for isolated research — never for core implementation

## References
See @PLAN.md for the full implementation plan and phase breakdown
See @PROGRESS.md for current status and next steps
See @idea-deep-dive/ for market research and architecture details
