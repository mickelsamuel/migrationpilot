# MigrationPilot — Progress Tracker

**Last Updated**: 2026-02-12
**Current Phase**: B COMPLETE — v0.2.0 shipped
**Current Task**: Phase B done, ready for Phase C (Stripe billing + license keys)

---

## Session Log

### Session 3 — 2026-02-11
**Goal**: Phase B — Production context, rules MP009-MP014, CLI/Action integration
**Status**: COMPLETE

#### What Got Done
- [x] Production context module (src/production/context.ts) — full implementation
  - Connects to PG via DATABASE_URL using node-postgres Pool
  - Queries pg_class for table sizes (reltuples, pg_total_relation_size, index count)
  - Queries pg_stat_statements for affected queries (calls, mean_exec_time)
  - Queries pg_stat_activity for active connections per table
  - Checks for pg_stat_statements extension availability
  - testConnection() helper for validation
- [x] 6 new rules: MP009-MP014
  - MP009: require-drop-index-concurrently (warning) — DROP INDEX without CONCURRENTLY
  - MP010: no-rename-column (warning) — RENAME COLUMN breaks app queries
  - MP011: unbatched-data-backfill (warning) — UPDATE without WHERE clause
  - MP012: no-enum-add-value-in-transaction (warning) — ALTER TYPE ADD VALUE in txn
  - MP013: high-traffic-table-ddl (warning, paid) — DDL on high-traffic table (needs prod context)
  - MP014: large-table-ddl (warning, paid) — Long-held lock on large table (needs prod context)
- [x] Extended RuleContext with optional production context (tableStats, affectedQueries, activeConnections)
- [x] runRules() now accepts optional ProductionContext and threads it to each rule
- [x] CLI: --database-url option on analyze + check commands
- [x] Action: database-url input wired to fetchProductionContext
- [x] Risk scoring now uses production context for table size + query frequency factors
- [x] 107 tests passing across 5 test files
- [x] New test file: tests/context.test.ts (8 tests)
- [x] Rules tests expanded: 29→49 tests (all 6 new rules + production context rules)
- [x] Typecheck + lint + build all passing
- [x] CLI bundle: 424KB, Action bundle: 1.1MB

### Session 2 — 2026-02-11 (continued)
**Goal**: Ship v0.1.0 — GitHub Action, tests, bundle, deploy
**Status**: COMPLETE

#### What Got Done
- [x] GitHub Action entry point (src/action/index.ts) — full implementation
- [x] 79 tests passing across 4 test files
- [x] esbuild bundle: CLI (238KB) + Action (987KB + WASM deps)
- [x] Private GitHub repo created: mickelsamuel/migrationpilot
- [x] CI workflow (test + lint + typecheck) — passing
- [x] Migration Safety Check workflow — tested and working
- [x] README.md with full docs
- [x] Test PR #1 created — action works end-to-end
- [x] v0.1.0 tagged and pushed

### Session 1 — 2026-02-11
**Goal**: Initialize project, set up development environment, write core engine
**Status**: COMPLETE
(See git history for details)

---

## Phase A Checklist — COMPLETE
- [x] Project scaffold with pnpm, TypeScript, vitest, eslint
- [x] DDL parser with libpg-query WASM
- [x] Table/column extraction from AST
- [x] Lock type classifier (pure lookup table)
- [x] 8 critical rules: MP001-MP008
- [x] Risk scoring system (RED/YELLOW/GREEN)
- [x] Safe migration generator
- [x] CLI with commander (analyze + check commands)
- [x] Terminal output with chalk + cli-table3
- [x] PR comment formatter (GitHub Flavored Markdown)
- [x] GitHub Action entry point + PR comment posting
- [x] esbuild bundle for distribution
- [x] 79 tests passing
- [x] CI + Migration Safety Check workflows
- [x] README with full documentation
- [x] GitHub repo (private) + v0.1.0 tag
- [x] Tested in real PR — action works end-to-end

## Phase B Checklist — COMPLETE
- [x] Production context module (src/production/context.ts)
- [x] pg_class table stats (rows, bytes, indexes)
- [x] pg_stat_statements affected queries
- [x] pg_stat_activity active connections
- [x] Enhanced risk scoring with production context
- [x] CLI --database-url integration
- [x] Action database-url input integration
- [x] Rules MP009-MP014 implemented
- [x] 119 tests passing across 6 test files
- [x] PGlite integration tests (12 tests — pg_class, regex matching, graceful fallback)
- [x] README update with new rules + production context docs
- [x] Build + push to GitHub + CI passing
- [x] v0.2.0 tag

## What's Next — Phase C (Weeks 9-10) ← START HERE
- [ ] License key generation + validation (src/license/validate.ts):
  - HMAC-SHA256 signed keys: `MP-<tier>-<expiry>-<signature>`
  - Validate locally (no network call), check expiry
  - Key tiers: free, pro, enterprise
- [ ] Stripe billing integration:
  - Checkout Session for Pro tier subscription
  - Webhook to generate + email license key on payment
  - Customer portal for billing management
- [ ] Pro tier feature gating:
  - CLI: --license-key option, also reads MIGRATIONPILOT_LICENSE_KEY env var
  - Action: license-key input
  - Gate: production context (--database-url) requires valid Pro key
  - Gate: MP013/MP014 rules only fire with valid Pro key
  - Free tier: all static rules (MP001-MP012) always available

## Launch Checklist (when ready to go public)
- [ ] Make repo public
- [ ] npm publish
- [ ] GitHub Action Marketplace listing
- [ ] Show HN post
- [ ] Blog post: "Why Your PostgreSQL Migrations Are More Dangerous Than You Think"

---

## All Files in Project

### Source Files
- src/parser/parse.ts — DDL parsing with libpg-query
- src/parser/extract.ts — Table/column extraction from AST
- src/locks/classify.ts — Lock type classification
- src/rules/engine.ts — Rule runner + interfaces (extended with ProductionContext)
- src/rules/index.ts — Rule registry (14 rules)
- src/rules/MP001-MP008 — 8 critical rules (free tier)
- src/rules/MP009-drop-index-concurrently.ts — DROP INDEX without CONCURRENTLY
- src/rules/MP010-rename-column.ts — RENAME COLUMN warning
- src/rules/MP011-unbatched-backfill.ts — UPDATE without WHERE
- src/rules/MP012-enum-add-value.ts — ALTER TYPE ADD VALUE in txn
- src/rules/MP013-high-traffic-ddl.ts — High-traffic table DDL (paid)
- src/rules/MP014-large-table-ddl.ts — Large table DDL (paid)
- src/scoring/score.ts — Risk scoring
- src/generator/alternatives.ts — Safe SQL generation
- src/output/cli.ts — Terminal output formatter
- src/output/pr-comment.ts — PR comment GFM formatter
- src/cli.ts — CLI entry point (with --database-url)
- src/action/index.ts — GitHub Action entry point (with database-url)
- src/production/context.ts — Production context engine (pg_class, pg_stat_*)
- src/license/validate.ts — Placeholder (Phase C)

### Test Files (119 tests)
- tests/parser.test.ts — 23 tests
- tests/locks.test.ts — 18 tests
- tests/rules.test.ts — 49 tests
- tests/scoring.test.ts — 9 tests
- tests/context.test.ts — 8 tests
- tests/integration.test.ts — 12 tests (PGlite)

### Build Output
- dist/cli.cjs — CLI bundle (424KB)
- dist/action/index.js — Action bundle (1.1MB)
- dist/action/package.json — CJS type override
- dist/action/node_modules/ — libpg-query + @pgsql/types (WASM runtime)

### Test Migrations
- test-migrations/001_dangerous_migration.sql — Tests MP001-MP008
- test-migrations/002_new_rules.sql — Tests MP009-MP012

---

## Key Decisions
1. TypeScript ESM + strict, pnpm, vitest, esbuild
2. CJS format for bundles (handles commander + @actions require())
3. libpg-query external in esbuild, WASM copied to dist
4. Hidden HTML comment marker for PR comment upsert
5. Open-core: free static linting (MP001-MP012), paid production context (MP013-MP014)
6. Production context: pg Pool with connection/query timeouts, single-connection max
7. RuleContext extended with optional tableStats/affectedQueries/activeConnections
8. pg_stat_statements word-boundary regex matching for table name lookup
