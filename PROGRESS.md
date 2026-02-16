# MigrationPilot — Progress Tracker

**Last Updated**: 2026-02-16
**Current Phase**: PAYMENT SYSTEM PRODUCTION-READY (v1.1.0)
**Current Task**: Ready for external setup (Stripe, domain, Resend) + marketing

---

## Session Log

### Session 11 — 2026-02-16
**Goal**: Complete payment system audit — fix all 15 billing/licensing issues to make the product deployment-ready
**Status**: ALL 15 ISSUES FIXED

#### Critical Fixes
- [x] Fixed signing secret architecture — bake HMAC secret into CLI at build time via esbuild `--define`
  - Created `scripts/build.js` to replace inline build command
  - Updated `src/license/validate.ts` with `__MP_SIGNING_SECRET__` compile-time constant
  - Updated `.github/workflows/publish.yml` to inject secret during CI build
- [x] Fixed Pro checkout button — CTA was GET to POST-only endpoint (405 error)
  - Created `site/src/app/checkout/page.tsx` — client component that POSTs to `/api/checkout`
  - Changed CTA link from `/api/checkout?tier=pro` to `/checkout?tier=pro`
- [x] Created checkout success page (`site/src/app/checkout/success/page.tsx`)
  - Shows payment confirmation, setup instructions (CLI + GitHub Action), billing link
- [x] Created billing management page (`site/src/app/billing/page.tsx`)
  - Email lookup → Stripe Customer Portal redirect
- [x] Created billing portal API (`api/billing-portal.ts`)
  - Vercel serverless function, looks up customer by email, creates portal session
- [x] Fixed subscription upgrade key regeneration — `handleSubscriptionUpdated` now generates new license key when tier changes
- [x] Fixed license expiry alignment — uses `subscription.items.data[0].current_period_end` instead of hardcoded 365 days

#### Moderate Fixes
- [x] Added webhook idempotency — `handleCheckoutComplete` checks for existing key before generating
- [x] Added `invoice.paid` handler — refreshes license key on billing cycle renewal
- [x] Added `findCustomerByEmail` export for billing portal
- [x] Added `@vercel/node` to devDependencies (was missing, API files import it)
- [x] Fixed MP019 missing from license feature gating test (now checks all 3 Pro rules)
- [x] Created `vercel.json` for proper site + API routing on Vercel

#### Minor Fixes
- [x] Added rate limiting to checkout endpoint (10 req/min/IP)
- [x] Added Resend DNS verification requirement to `.env.example` and `email.ts`
- [x] Fixed Stripe v20 SDK type compatibility (`current_period_end` at item level, `invoice.parent.subscription_details`)

#### New Files Created
- `scripts/build.js` — esbuild build script with signing secret injection
- `site/src/app/checkout/page.tsx` — Checkout flow page
- `site/src/app/checkout/success/page.tsx` — Payment success page
- `site/src/app/billing/page.tsx` — Billing management page
- `api/billing-portal.ts` — Stripe Customer Portal serverless function
- `vercel.json` — Vercel deployment config

#### Files Modified
- `src/license/validate.ts` — Build-time signing secret constant
- `src/billing/stripe.ts` — Idempotency, tier-change key regen, invoice.paid, findCustomerByEmail, Stripe v20 types
- `src/billing/email.ts` — DNS verification comment
- `api/checkout.ts` — Rate limiting
- `site/src/app/page.tsx` — Fixed Pro CTA link
- `tests/billing.test.ts` — 28 tests (was 20), covers idempotency, tier change, invoice.paid, expiry alignment
- `tests/license.test.ts` — Fixed MP019 in feature gating test
- `.env.example` — Added EMAIL_FROM, Resend DNS note
- `package.json` — Build script, @vercel/node dep
- `.github/workflows/publish.yml` — Signing secret injection

#### Verification
- 558 tests pass across 31 files
- Build clean (CLI 835KB, Action 1.2MB, API 219KB)
- Lint clean
- Full end-to-end flow verified: Landing → Checkout → Stripe → Success → Email → CLI validation

### Session 10 — 2026-02-13
**Goal**: Full user-facing audit — review and fix every touchpoint users would see
**Status**: ALL ISSUES FIXED

#### Bugs Fixed
- [x] Created missing LICENSE file (MIT) — was referenced in package.json but didn't exist
- [x] Fixed wrong GitHub URL in src/output/errors.ts (migrationpilot/migrationpilot → mickelsamuel/migrationpilot)
- [x] Fixed stale rule count in license error message (22 → 45 rules)
- [x] Fixed CONTRIBUTING.md rule range (MP001-MP025 → MP001-MP048)

#### Inconsistencies Fixed
- [x] Fixed README build sizes (805KB → 835KB, 218KB → 219KB)
- [x] Fixed README JSON schema URL example (report-v1.1.0.json → report-v1.json to match actual code)
- [x] Aligned pricing tiers — README now matches landing page (3 tiers: Free/Pro/Enterprise, removed Team)
- [x] Fixed "combined" phrasing on landing page (was misleading)

#### Cosmetic/Polish
- [x] Created site/public/robots.txt for SEO
- [x] Created site/public/sitemap.xml with all 49 URLs (home + 48 rule pages)
- [x] Created site/src/app/opengraph-image.tsx — Next.js dynamic OG image for social sharing
- [x] Enhanced site metadata: metadataBase, canonical URL, OG images, expanded keywords
- [x] Changed Enterprise contact email from personal Gmail to hello@migrationpilot.dev
- [x] Changed "Start Pro Trial" → "Get Pro" (no trial flow exists)
- [x] Expanded footer: 4-column layout with Product, Resources, Company sections, links to npm/changelog/contributing/issues/security/license
- [x] Added "Made in Montreal" footer tag

#### Rule Pages
- [x] Created site/src/app/rules/[id]/page.tsx — dynamic route for all 48 rules
- [x] Created site/src/app/rule-data.ts — complete rule data (48 entries with descriptions, examples, metadata)
- [x] All 48 rule pages statically generated at build time (/rules/mp001 through /rules/mp048)
- [x] Each page has: severity badge, auto-fix badge, tier badge, description, why it's dangerous, bad/good examples, config, GitHub link

#### New Files Created
- LICENSE — MIT license
- site/public/robots.txt — SEO robots file
- site/public/sitemap.xml — 49-URL sitemap
- site/src/app/opengraph-image.tsx — Dynamic OG image
- site/src/app/rule-data.ts — Complete rule metadata for 48 rules
- site/src/app/rules/[id]/page.tsx — Dynamic rule page route

#### Files Modified
- src/output/errors.ts — Fixed GitHub URL and rule count
- CONTRIBUTING.md — Fixed rule range
- README.md — Fixed build sizes, JSON schema URL, pricing table
- site/src/app/page.tsx — Fixed "combined" phrasing, Pro CTA, Enterprise email, expanded footer
- site/src/app/layout.tsx — Enhanced metadata (OG image, keywords, canonical, metadataBase)

#### Verification
- 550 tests pass across 31 files
- Typecheck clean, lint clean, build clean
- Site builds successfully with 51 pages (home, 404, OG image, 48 rule pages)
- CLI smoke tests pass (--version, list-rules, list-rules --json, analyze)
- Bundle sizes: CLI 835KB, Action 1.2MB, API 219KB

### Session 9 — 2026-02-13
**Goal**: Product Perfection — go from 25 to 48 rules, CLI improvements, config presets, README/landing page rewrite, per-rule docs
**Status**: ALL 10 PHASES COMPLETE

#### What Got Done
- [x] Phase 1: Infrastructure updates (helpers, classify, extract) + 8 lock safety rules (MP026-MP033)
- [x] Phase 2: 15 data safety + best practice rules (MP034-MP048), 2 new auto-fixes
- [x] Phase 3: PG-version-aware rule updates (MP002/003/015/018 for PG 10/11/18)
- [x] Phase 4: CLI improvements (list-rules, --exclude, NO_COLOR, enriched --version)
- [x] Phase 5: Config presets (recommended/strict/ci) with extends field
- [x] Phase 6: Complete README rewrite (48 rules, comparison table, all features)
- [x] Phase 7: Landing page rewrite (v1.1.0, 9 feature cards, 48 rules grouped by category)
- [x] Phase 8: Package metadata (bugs, funding, keywords, exports order), .env.example, .editorconfig, CLAUDE.md update
- [x] Phase 9: Per-rule documentation (48 markdown files in docs/rules/)
- [x] Phase 10: Final verification — 550 tests pass, typecheck clean, lint clean, build clean
- [x] Smoke tests: --version (enriched), list-rules (48), list-rules --json (48), analyze --format json
- [x] Bundle sizes: CLI 835KB, Action 1.2MB, API 219KB

#### New Files Created (28 rule files + 5 test files + 48 doc files + 2 project files)
- src/rules/MP026-MP048 — 23 new safety rule files
- tests/rules-mp026-033.test.ts — 30 tests
- tests/rules-mp034-040.test.ts — 25 tests
- tests/rules-mp041-048.test.ts — 31 tests
- tests/cli-improvements.test.ts — 6 tests
- tests/config-presets.test.ts — 6 tests
- docs/rules/MP001.md through docs/rules/MP048.md — 48 per-rule doc files
- .env.example — Environment variable template
- .editorconfig — Editor config

#### Files Modified
- src/rules/index.ts — Registered 23 new rules (now 48 total)
- src/rules/helpers.ts — Added DDL keys for RefreshMatViewStmt, TruncateStmt, DropdbStmt, domain stmts
- src/locks/classify.ts — Lock classification for matview, truncate, dropdb, domain stmts
- src/parser/extract.ts — Target extraction for RefreshMatViewStmt, TruncateStmt
- src/fixer/fix.ts — Added MP030 + MP033 auto-fixes (6 total)
- src/rules/MP002, MP003, MP015, MP018 — PG-version-aware safe alternatives
- src/cli.ts — list-rules, --exclude, NO_COLOR, enriched --version, v1.1.0
- src/config/load.ts — extends field, 3 built-in presets, resolvePreset export
- src/output/json.ts, src/output/sarif.ts — Version bumped to 1.1.0
- package.json — v1.1.0, bugs, funding, keywords, exports order, packageManager
- README.md — Complete rewrite (48 rules, comparison table, all features)
- site/src/app/page.tsx — Complete rewrite (v1.1.0, 48 rules, features, pricing)
- CLAUDE.md — Updated counts (48 rules, 550+ tests, 8 commands)
- CHANGELOG.md — v1.1.0 section added
- tests/api.test.ts, cli-modes.test.ts, rules.test.ts, e2e.test.ts, json-output.test.ts, sarif.test.ts, snapshots.test.ts, rules-mp015-020.test.ts — Updated for new rules/version

### Session 8 — 2026-02-13
**Goal**: Technical Improvements Phase (Step 4) — version alignment, TypeScript strictness, JSON output, programmatic API, E2E tests, snapshots, severity overrides, security audit, community files
**Status**: ALL 9 CHECKPOINTS COMPLETE

#### What Got Done
- [x] CP1: Version alignment — unified to 1.0.0 (package.json, cli.ts, sarif.ts)
- [x] CP1: TypeScript strictness — enabled noUncheckedIndexedAccess, fixed ~65 errors across 18 files
- [x] CP2: JSON output format — structured JsonReport with $schema, versioned schema, enriched rule metadata
- [x] CP3: Programmatic API — src/index.ts exports 17 functions/classes, src/analysis/analyze.ts extracted from cli.ts
- [x] CP3: API bundle — dist/index.js (174KB ESM), dist/index.d.ts type declarations
- [x] CP4: E2E CLI tests — 14 tests spawning dist/cli.cjs binary (version, help, analyze, check, init, detect, stdin)
- [x] CP5: Snapshot tests — 11 snapshot tests for all output formatters (CLI, markdown, JSON, SARIF, PR comment, quiet, verbose)
- [x] CP6: Severity overrides — applySeverityOverrides wired to config, supports downgrade/upgrade per rule
- [x] CP7: Security audit — pnpm audit clean, SIGTERM handler added to watch mode, SECURITY.md
- [x] CP8: Community files — CHANGELOG.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, issue/PR templates, FUNDING.yml
- [x] CP9: Final verification — typecheck clean, 451 tests pass, lint clean, build clean
- [x] Bundle sizes: CLI 788KB, Action 1.2MB, API 174KB
- [x] 451 tests passing across 26 test files

#### New Files Created
- src/output/json.ts — JSON output formatter with versioned schema
- src/analysis/analyze.ts — Shared analyzeSQL function (extracted from cli.ts)
- src/index.ts — Programmatic API entry point (17 exports)
- tests/json-output.test.ts — 14 JSON formatter tests
- tests/api.test.ts — 10 programmatic API tests
- tests/e2e.test.ts — 14 E2E CLI tests
- tests/fixtures/e2e/clean.sql — E2E fixture: clean migration
- tests/fixtures/e2e/unsafe.sql — E2E fixture: unsafe migration
- tests/snapshots.test.ts — 11 snapshot tests
- tests/severity-overrides.test.ts — 7 severity override tests
- tests/__snapshots__/snapshots.test.ts.snap — Snapshot file
- CHANGELOG.md — v1.0.0 release changelog
- CONTRIBUTING.md — Contributor guide
- CODE_OF_CONDUCT.md — Contributor Covenant v2.1
- SECURITY.md — Security policy
- .github/ISSUE_TEMPLATE/bug_report.md — Bug report template
- .github/ISSUE_TEMPLATE/feature_request.md — Feature request template
- .github/pull_request_template.md — PR template
- .github/FUNDING.yml — GitHub Sponsors config

#### Files Modified
- package.json — version 1.0.0, exports field, API bundle in build script
- tsconfig.json — noUncheckedIndexedAccess: true
- src/cli.ts — version 1.0.0, import shared analyzeSQL, JSON formatter, severity overrides, SIGTERM, removed unused StatementResult import
- src/output/sarif.ts — toolVersion default 1.0.0
- src/rules/engine.ts — noUncheckedIndexedAccess fix + applySeverityOverrides
- src/rules/helpers.ts, disable.ts, MP002, MP004, MP008, MP013, MP020 — noUncheckedIndexedAccess fixes
- src/scoring/score.ts, output/cli.ts, output/markdown.ts, output/pr-comment.ts — noUncheckedIndexedAccess fixes
- src/parser/extract.ts, fixer/fix.ts, license/validate.ts — noUncheckedIndexedAccess fixes
- src/analysis/transaction.ts, ordering.ts — noUncheckedIndexedAccess fixes
- src/action/index.ts — noUncheckedIndexedAccess fixes
- tests/sarif.test.ts — Updated version assertions to 1.0.0

### Session 7 — 2026-02-12
**Goal**: Developer Experience Phase (Step 3) — rule explainability, timing, CLI polish, error messages, CI hardening
**Status**: ALL TASKS COMPLETE

#### What Got Done
- [x] Rule metadata enrichment: whyItMatters + docsUrl on all 25 rules
  - Every violation now explains real-world impact ("Why: ...")
  - Every rule links to documentation (https://migrationpilot.dev/rules/mpXXX)
  - Output formatters (CLI, markdown, PR comment, verbose) all show "Why" when rules provided
- [x] Timing output: "25 rules checked in 120ms" footer in CLI and check summary
  - performance.now() timing around analyzeSQL in analyze + check commands
  - Sub-second shows ms, >=1s shows seconds with 2 decimal places
- [x] --no-color flag: chalk.level = 0 via commander preAction hook
- [x] Help text examples on all 7 commands (init, detect, watch, hook, plan, analyze, check)
- [x] Structured error messages (src/output/errors.ts):
  - formatFileError: path, common causes
  - formatParseError: file, error, SQL preview, issue tracker link
  - formatConnectionError: error, causes, static analysis fallback
  - formatLicenseError: error, renewal link, free tier fallback
  - Integrated into cli.ts (file read, parse, connection errors)
- [x] CI workflow hardening (.github/workflows/ci.yml):
  - Node 20/22/24 on Ubuntu, Node 22 on macOS + Windows
  - fail-fast: false, added pnpm build step
- [x] npm publish workflow (.github/workflows/publish.yml):
  - Triggers on v* tags, full test/lint/build before publish
  - npm publish --provenance --access public
- [x] 395 tests passing across 21 test files
- [x] Lint clean, build clean (CLI 783KB, Action 1.2MB)

#### New Files Created
- src/output/errors.ts — structured error formatters
- tests/errors.test.ts — 11 error formatter tests
- .github/workflows/publish.yml — npm publish on tag

#### Files Modified (key changes)
- src/rules/engine.ts — added whyItMatters + docsUrl to Rule interface
- src/rules/MP001-MP025 (all 25 rules) — added metadata
- src/output/cli.ts — FormatOptions, timing footer, "Why:" display
- src/output/pr-comment.ts — "Why:" blockquote under violations
- src/output/markdown.ts — "Why:" + docs link under violations
- src/cli.ts — timing, --no-color, help examples, error messages, pass rules to formatters
- .github/workflows/ci.yml — Node/OS matrix + build step
- tests/rules.test.ts — 3 new metadata validation tests
- tests/cli-modes.test.ts — 10 new tests (explainability + timing)

### Session 6 — 2026-02-12
**Goal**: Product Gaps Phase — new rules, output formats, CLI enhancements
**Status**: ALL TASKS COMPLETE

#### What Got Done
- [x] Shared helpers refactor (extracted isInsideTransaction/isDDL to src/rules/helpers.ts)
- [x] 5 new rules (MP021-MP025, total now 25 rules):
  - MP021: require-concurrent-reindex (REINDEX needs CONCURRENTLY on PG12+)
  - MP022: no-drop-cascade (CASCADE silently drops dependents)
  - MP023: require-if-not-exists (CREATE TABLE/INDEX need IF NOT EXISTS)
  - MP024: no-enum-value-removal (DROP TYPE destroys enum + dependent columns)
  - MP025: ban-concurrent-in-transaction (CONCURRENTLY in txn = runtime ERROR)
- [x] Markdown output format (--format markdown) — clean GFM for docs/wikis
- [x] Quiet mode (--quiet) — gcc-style one-line-per-violation
- [x] Verbose mode (--verbose) — per-statement PASS/FAIL for all rules
- [x] --stdin support — pipe SQL from any framework (django sqlmigrate | migrationpilot analyze --stdin)
- [x] --fix --dry-run — preview auto-fix changes without writing
- [x] Exit code refinement — 0=clean, 1=warnings, 2=critical
- [x] Fixed all lint errors (6 pre-existing + 1 new)
- [x] 371 tests passing across 20 test files
- [x] Build clean (dist/cli.cjs 771KB, dist/action/index.js 1.2MB)

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
- src/rules/engine.ts, src/rules/index.ts — Rule engine + registry (25 rules)
- src/rules/MP001-MP025 — All 25 safety rules (each with whyItMatters + docsUrl)
- src/rules/helpers.ts — Shared rule helpers (isInsideTransaction, isDDL)
- src/rules/disable.ts — Inline disable comment parser
- src/scoring/score.ts — Risk scoring
- src/generator/alternatives.ts — Safe SQL generation
- src/output/cli.ts — Terminal output (colored locks, risk bars, summary, timing, "Why:" display)
- src/output/json.ts — JSON output formatter with versioned schema
- src/output/pr-comment.ts — PR comment GFM (with "Why:" blockquotes)
- src/output/sarif.ts — SARIF v2.1.0 output
- src/output/plan.ts — Execution plan formatter
- src/output/markdown.ts — GFM markdown output (with "Why:" + docs links)
- src/output/errors.ts — Structured error formatters (file, parse, connection, license)
- src/analysis/analyze.ts — Shared analyzeSQL pipeline (pure function, no process.exit)
- src/analysis/transaction.ts — Transaction boundary analysis
- src/analysis/ordering.ts — Migration ordering validation
- src/fixer/fix.ts — Auto-fix engine
- src/frameworks/detect.ts — Migration framework detection (14 frameworks)
- src/watch/watcher.ts — File watcher with debounce
- src/hooks/install.ts — Git pre-commit hook installer
- src/config/load.ts — Config file system (.migrationpilotrc.yml)
- src/cli.ts — CLI entry point (7 commands: analyze, check, plan, init, detect, watch, hook)
- src/index.ts — Programmatic API entry point (17 exports)
- src/action/index.ts — GitHub Action entry point
- src/production/context.ts — Production context queries
- src/license/validate.ts — License key validation
- src/billing/stripe.ts — Stripe checkout + webhook
- src/billing/email.ts — Resend email delivery
- src/billing/webhook.ts — Webhook handler
- api/checkout.ts — Vercel POST /api/checkout
- api/stripe-webhook.ts — Vercel POST /api/stripe-webhook
- site/ — Next.js landing page

### Test Files (451 tests across 26 files)
- tests/parser.test.ts — 23 tests
- tests/locks.test.ts — 18 tests
- tests/rules.test.ts — 52 tests (incl. metadata validation)
- tests/rules-mp015-020.test.ts — 32 tests
- tests/rules-mp021-025.test.ts — 27 tests
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
- tests/cli-modes.test.ts — 27 tests (quiet, verbose, markdown, fix, exit codes, explainability, timing)
- tests/errors.test.ts — 11 tests
- tests/json-output.test.ts — 14 tests (JSON formatter)
- tests/api.test.ts — 10 tests (programmatic API)
- tests/e2e.test.ts — 14 tests (E2E CLI binary)
- tests/snapshots.test.ts — 11 tests (output format stability)
- tests/severity-overrides.test.ts — 7 tests (config severity overrides)

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
