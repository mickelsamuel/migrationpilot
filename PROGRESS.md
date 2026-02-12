# MigrationPilot — Progress Tracker

**Last Updated**: 2026-02-12
**Current Phase**: D NEARLY COMPLETE
**Current Task**: All Phase D features built, ready for polish and launch prep

---

## Session Log

### Session 5 — 2026-02-12
**Goal**: Complete Phase D — rules MP015-020, auto-fix, framework detection, watch mode, plan command
**Status**: ALL TASKS COMPLETE

#### What Got Done
- [x] Rules MP015-MP020 (6 new rules)
  - MP015: no-add-column-serial (SERIAL/BIGSERIAL creates implicit sequence)
  - MP016: require-index-on-fk (FK columns need indexes)
  - MP017: no-drop-column (DROP COLUMN lock + app breakage warning)
  - MP018: no-force-set-not-null (SET NOT NULL needs CHECK pattern on PG 12+)
  - MP019: no-exclusive-lock-high-connections (production context, paid)
  - MP020: require-statement-timeout (long-running DDL needs timeout)
- [x] Auto-fix mode (`--fix` flag)
  - Fixes MP001 (CONCURRENTLY), MP004 (lock_timeout), MP009 (DROP INDEX CONCURRENTLY), MP020 (statement_timeout)
  - Reports unfixable violations requiring manual intervention
- [x] Migration framework auto-detection (`detect` command)
  - Detects 14 frameworks: Flyway, Liquibase, Alembic, Django, Knex, Prisma, TypeORM, Drizzle, Sequelize, goose, dbmate, Sqitch, Rails, Ecto
- [x] Watch mode (`watch` command) with debounced file monitoring
- [x] Git pre-commit hook installer (`hook install/uninstall`)
  - Standalone git hooks and husky integration
- [x] Execution plan command (`plan`) with visual timeline
  - Transaction boundary detection (BEGIN/COMMIT blocks)
  - Duration estimation (instant/seconds/minutes/hours)
  - Lock type, blocking impact, table target visualization
- [x] Migration ordering validation
  - Duplicate version detection, out-of-order files, version gaps
  - Cross-migration dependency checking (table used before created)
- [x] CLI output improvements
  - Colored lock types, risk factor progress bars
  - Multi-file check summary, health score banner
- [x] 327 tests passing across 18 test files
- [x] All pushed to GitHub

### Session 4 — 2026-02-12
**Goal**: Phase C + Phase D start — License keys, Stripe billing, SARIF, landing page
**Status**: Phase C COMPLETE (v0.3.0), Phase D started

### Session 3 — 2026-02-11
**Goal**: Phase B — Production context, rules MP009-MP014
**Status**: COMPLETE (v0.2.0)

### Session 2 — 2026-02-11
**Goal**: Ship v0.1.0 — GitHub Action, tests, bundle
**Status**: COMPLETE

### Session 1 — 2026-02-11
**Goal**: Initialize project, core engine
**Status**: COMPLETE

---

## Phase A Checklist — COMPLETE (v0.1.0)
- [x] DDL parser, lock classifier, 8 rules, CLI, GitHub Action, 79 tests

## Phase B Checklist — COMPLETE (v0.2.0)
- [x] Production context, MP009-MP014, PGlite integration tests, 119 tests

## Phase C Checklist — COMPLETE (v0.3.0)
- [x] License keys (HMAC-SHA256), Stripe billing, Resend email, feature gating, 164 tests

## Phase D Checklist — NEARLY COMPLETE
- [x] SARIF output format (CLI --format sarif + Action sarif-file output)
- [x] README polish with badges, pricing, architecture
- [x] Landing page (site/) — Next.js + Tailwind
- [x] Rules MP015-MP020 (20 total rules)
- [x] Auto-fix mode (--fix flag)
- [x] Framework auto-detection (14 frameworks)
- [x] Watch mode + pre-commit hooks
- [x] Execution plan command
- [x] Transaction-aware analysis
- [x] Migration ordering validation
- [x] CLI output improvements
- [x] Config file support (.migrationpilotrc.yml)
- [x] Inline disable comments (-- migrationpilot-disable)
- [ ] Deploy landing page to Vercel (migrationpilot.dev) — when ready
- [ ] Blog post: "Why Your PostgreSQL Migrations Are More Dangerous Than You Think"

## Launch Checklist (when ready to go public)
- [ ] Make repo public
- [ ] npm publish
- [ ] GitHub Action Marketplace listing
- [ ] Deploy landing page to migrationpilot.dev
- [ ] Show HN post
- [ ] Blog post

---

## All Files in Project

### Source Files
- src/parser/parse.ts, src/parser/extract.ts — DDL parsing
- src/locks/classify.ts — Lock type classification
- src/rules/engine.ts, src/rules/index.ts — Rule engine + registry (20 rules)
- src/rules/MP001-MP020 — All 20 safety rules
- src/rules/disable.ts — Inline disable comment parser
- src/scoring/score.ts — Risk scoring
- src/generator/alternatives.ts — Safe SQL generation
- src/output/cli.ts — Terminal output (with colored locks, risk bars, summary)
- src/output/pr-comment.ts — PR comment GFM
- src/output/sarif.ts — SARIF v2.1.0 output
- src/output/plan.ts — Execution plan formatter
- src/analysis/transaction.ts — Transaction boundary analysis
- src/analysis/ordering.ts — Migration ordering validation
- src/fixer/fix.ts — Auto-fix engine
- src/frameworks/detect.ts — Migration framework detection (14 frameworks)
- src/watch/watcher.ts — File watcher with debounce
- src/hooks/install.ts — Git pre-commit hook installer
- src/config/load.ts — Config file system (.migrationpilotrc.yml)
- src/cli.ts — CLI entry point (7 commands: analyze, check, plan, init, detect, watch, hook)
- src/action/index.ts — GitHub Action entry point
- src/production/context.ts — Production context queries
- src/license/validate.ts — License key validation
- src/billing/stripe.ts — Stripe checkout + webhook
- src/billing/email.ts — Resend email delivery
- src/billing/webhook.ts — Webhook handler
- api/checkout.ts — Vercel POST /api/checkout
- api/stripe-webhook.ts — Vercel POST /api/stripe-webhook
- site/ — Next.js landing page

### Test Files (327 tests across 18 files)
- tests/parser.test.ts — 23 tests
- tests/locks.test.ts — 18 tests
- tests/rules.test.ts — 49 tests
- tests/rules-mp015-020.test.ts — 32 tests
- tests/scoring.test.ts — 9 tests
- tests/context.test.ts — 8 tests
- tests/integration.test.ts — 12 tests (PGlite)
- tests/license.test.ts — 25 tests
- tests/billing.test.ts — 20 tests
- tests/sarif.test.ts — 11 tests
- tests/config.test.ts — 16 tests
- tests/disable.test.ts — 19 tests
- tests/fixer.test.ts — 15 tests
- tests/frameworks.test.ts — 17 tests
- tests/hooks.test.ts — 9 tests
- tests/transaction.test.ts — 11 tests
- tests/plan.test.ts — 17 tests
- tests/ordering.test.ts — 16 tests

---

## Key Decisions
1. TypeScript ESM + strict, pnpm, vitest, esbuild
2. CJS format for bundles (handles commander + @actions require())
3. libpg-query external in esbuild, WASM copied to dist
4. Hidden HTML comment marker for PR comment upsert
5. Open-core: free static linting (MP001-MP012, MP015-MP018, MP020), paid production context (MP013-MP014, MP019)
6. Production context: pg Pool with connection/query timeouts, single-connection max
7. License keys: HMAC-SHA256 signed, 100% client-side validation
8. Stripe billing: webhook-driven key generation, Resend for email delivery
9. SARIF v2.1.0 for GitHub Code Scanning + IDE integration
10. Landing page: Next.js 16 + Tailwind CSS 4 in site/ subdirectory
11. Auto-fix limited to safe, deterministic transforms (MP001, MP004, MP009, MP020)
12. Framework detection via file/directory heuristics, no package manager queries
13. Transaction analysis: shared context module, reusable across rules
14. Duration estimation: size-based heuristics (instant/seconds/minutes/hours)
