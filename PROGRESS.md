# MigrationPilot — Progress Tracker

**Last Updated**: 2026-02-12
**Current Phase**: C COMPLETE — v0.3.0 shipped
**Current Task**: Phase C done, ready for Phase D (Growth: SARIF, content, launch prep)

---

## Session Log

### Session 4 — 2026-02-12
**Goal**: Phase C — License keys, Stripe billing, feature gating
**Status**: COMPLETE

#### What Got Done
- [x] License key validation (src/license/validate.ts)
  - HMAC-SHA256 signed keys: MP-<TIER>-<EXPIRY>-<SIGNATURE>
  - Client-side validation, no API calls needed
  - Signing secret from env var MIGRATIONPILOT_SIGNING_SECRET
  - generateLicenseKey(), validateLicense(), isProOrAbove()
  - timingSafeEqual for signature comparison
- [x] Feature gating in CLI + Action
  - CLI: --license-key option, reads MIGRATIONPILOT_LICENSE_KEY env var
  - Action: license-key input in action.yml
  - --database-url gated behind Pro license
  - MP013/MP014 rules filtered for free tier (PRO_RULE_IDS set)
- [x] License tests: 25 tests (key generation, validation, tampering, env fallback, feature gating)
- [x] Stripe billing module (src/billing/stripe.ts)
  - Checkout session creation for Pro/Team/Enterprise subscriptions
  - Webhook event handling (checkout complete, subscription update/delete)
  - License key generation on successful payment
  - Key stored in subscription metadata for retrieval
  - Customer portal session creation
  - Tier resolution from subscription price metadata or lookup_key
- [x] Email delivery (src/billing/email.ts)
  - Resend API integration for transactional email
  - HTML + plain-text license key delivery emails
  - Setup instructions for CLI + GitHub Action in email
- [x] Webhook handler (src/billing/webhook.ts)
  - Framework-agnostic processWebhook() function
  - Config loading from environment variables
  - Signature verification → event handling → email delivery pipeline
- [x] Vercel serverless API endpoints
  - api/stripe-webhook.ts — POST /api/stripe-webhook
  - api/checkout.ts — POST /api/checkout
- [x] Billing tests: 20 tests (Stripe client, checkout, portal, webhook events, email, config)
- [x] 164 tests passing across 8 test files
- [x] Typecheck + build passing

### Session 3 — 2026-02-11
**Goal**: Phase B — Production context, rules MP009-MP014, CLI/Action integration
**Status**: COMPLETE

#### What Got Done
- [x] Production context module (src/production/context.ts) — full implementation
- [x] 6 new rules: MP009-MP014
- [x] CLI: --database-url option, Action: database-url input
- [x] Risk scoring with production context
- [x] 119 tests across 6 files, PGlite integration tests
- [x] v0.2.0 tagged and pushed

### Session 2 — 2026-02-11 (continued)
**Goal**: Ship v0.1.0 — GitHub Action, tests, bundle, deploy
**Status**: COMPLETE

### Session 1 — 2026-02-11
**Goal**: Initialize project, set up development environment, write core engine
**Status**: COMPLETE

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
- [x] pg_class table stats, pg_stat_statements, pg_stat_activity
- [x] Enhanced risk scoring with production context
- [x] CLI --database-url + Action database-url
- [x] Rules MP009-MP014 implemented
- [x] 119 tests, PGlite integration tests
- [x] v0.2.0 tag

## Phase C Checklist — COMPLETE
- [x] License key generation + validation (src/license/validate.ts)
  - HMAC-SHA256 signed keys, client-side validation
  - Tiers: free, pro, team, enterprise
- [x] Stripe billing integration (src/billing/stripe.ts)
  - Checkout Session for subscriptions
  - Webhook handler for checkout/subscription events
  - Customer portal for billing management
- [x] Email delivery (src/billing/email.ts) — Resend API
- [x] Webhook HTTP handler (src/billing/webhook.ts)
- [x] Vercel serverless endpoints (api/checkout.ts, api/stripe-webhook.ts)
- [x] Pro tier feature gating in CLI + Action
  - --license-key / license-key input
  - MIGRATIONPILOT_LICENSE_KEY env var
  - --database-url gated behind Pro
  - MP013/MP014 gated behind Pro
- [x] 164 tests passing across 8 files
- [x] v0.3.0 tag

## What's Next — Phase D (Weeks 11-12) ← START HERE
- [ ] SARIF output format for IDE integration
- [ ] GitLab CI integration (parallel to GitHub Action)
- [ ] Content: blog posts, README polish, documentation site
- [ ] Landing page (migrationpilot.dev)
- [ ] 12-week assessment: stars, users, revenue → kill/continue decision

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
- src/rules/engine.ts — Rule runner + interfaces
- src/rules/index.ts — Rule registry (14 rules)
- src/rules/MP001-MP008 — 8 critical rules (free tier)
- src/rules/MP009-MP014 — 6 extended rules (MP013-MP014 paid)
- src/scoring/score.ts — Risk scoring
- src/generator/alternatives.ts — Safe SQL generation
- src/output/cli.ts — Terminal output formatter
- src/output/pr-comment.ts — PR comment GFM formatter
- src/cli.ts — CLI entry point (--database-url, --license-key)
- src/action/index.ts — GitHub Action entry point
- src/production/context.ts — Production context engine
- src/license/validate.ts — HMAC-SHA256 license key validation
- src/billing/stripe.ts — Stripe checkout, webhook, portal
- src/billing/email.ts — Resend email delivery
- src/billing/webhook.ts — Framework-agnostic webhook handler
- api/checkout.ts — Vercel serverless: POST /api/checkout
- api/stripe-webhook.ts — Vercel serverless: POST /api/stripe-webhook

### Test Files (164 tests)
- tests/parser.test.ts — 23 tests
- tests/locks.test.ts — 18 tests
- tests/rules.test.ts — 49 tests
- tests/scoring.test.ts — 9 tests
- tests/context.test.ts — 8 tests
- tests/integration.test.ts — 12 tests (PGlite)
- tests/license.test.ts — 25 tests
- tests/billing.test.ts — 20 tests

### Build Output
- dist/cli.cjs — CLI bundle (428KB)
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
9. License keys: HMAC-SHA256 signed, 100% client-side validation, no API calls
10. Stripe billing: webhook-driven key generation, Resend for email delivery
11. Vercel serverless for billing API endpoints
