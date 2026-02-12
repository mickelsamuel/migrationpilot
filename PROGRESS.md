# MigrationPilot — Progress Tracker

**Last Updated**: 2026-02-12
**Current Phase**: D IN PROGRESS
**Current Task**: SARIF + landing page done, continue with launch prep

---

## Session Log

### Session 4 — 2026-02-12
**Goal**: Phase C + Phase D — License keys, Stripe billing, SARIF, landing page
**Status**: Phase C COMPLETE (v0.3.0), Phase D IN PROGRESS

#### What Got Done
- [x] License key validation (src/license/validate.ts) — HMAC-SHA256 signed keys
- [x] Feature gating in CLI (--license-key) + Action (license-key input)
- [x] 25 license tests (generation, validation, tampering, env fallback, feature gating)
- [x] Stripe billing module (src/billing/stripe.ts) — checkout, webhook, portal
- [x] Email delivery (src/billing/email.ts) — Resend API
- [x] Webhook handler (src/billing/webhook.ts) — framework-agnostic
- [x] Vercel serverless endpoints (api/checkout.ts, api/stripe-webhook.ts)
- [x] 20 billing tests
- [x] SARIF v2.1.0 output (src/output/sarif.ts)
  - CLI --format sarif for analyze + check commands
  - Action writes migrationpilot-results.sarif + exposes sarif-file output
  - Rule descriptors, fix suggestions, multi-file combined output
- [x] 11 SARIF tests
- [x] README overhaul — badges, SARIF docs, pricing table, architecture, updated examples
- [x] Landing page (site/) — Next.js 16 + Tailwind CSS 4
  - Hero, CLI demo, feature grid, 14 rules list, pricing tiers, CTA
  - Ready for Vercel deployment
- [x] 175 tests passing across 9 test files
- [x] v0.3.0 tagged and pushed

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

## Phase D Checklist — IN PROGRESS
- [x] SARIF output format (CLI --format sarif + Action sarif-file output)
- [x] README polish with badges, pricing, architecture
- [x] Landing page (site/) — Next.js + Tailwind
- [ ] Deploy landing page to Vercel (migrationpilot.dev)
- [ ] GitLab CI integration (optional)
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
- src/rules/engine.ts, src/rules/index.ts — Rule engine + registry (14 rules)
- src/rules/MP001-MP014 — All safety rules
- src/scoring/score.ts — Risk scoring
- src/generator/alternatives.ts — Safe SQL generation
- src/output/cli.ts — Terminal output
- src/output/pr-comment.ts — PR comment GFM
- src/output/sarif.ts — SARIF v2.1.0 output
- src/cli.ts — CLI entry point
- src/action/index.ts — GitHub Action entry point
- src/production/context.ts — Production context queries
- src/license/validate.ts — License key validation
- src/billing/stripe.ts — Stripe checkout + webhook
- src/billing/email.ts — Resend email delivery
- src/billing/webhook.ts — Webhook handler
- api/checkout.ts — Vercel POST /api/checkout
- api/stripe-webhook.ts — Vercel POST /api/stripe-webhook
- site/ — Next.js landing page

### Test Files (175 tests)
- tests/parser.test.ts — 23 tests
- tests/locks.test.ts — 18 tests
- tests/rules.test.ts — 49 tests
- tests/scoring.test.ts — 9 tests
- tests/context.test.ts — 8 tests
- tests/integration.test.ts — 12 tests (PGlite)
- tests/license.test.ts — 25 tests
- tests/billing.test.ts — 20 tests
- tests/sarif.test.ts — 11 tests

---

## Key Decisions
1. TypeScript ESM + strict, pnpm, vitest, esbuild
2. CJS format for bundles (handles commander + @actions require())
3. libpg-query external in esbuild, WASM copied to dist
4. Hidden HTML comment marker for PR comment upsert
5. Open-core: free static linting (MP001-MP012), paid production context (MP013-MP014)
6. Production context: pg Pool with connection/query timeouts, single-connection max
7. License keys: HMAC-SHA256 signed, 100% client-side validation
8. Stripe billing: webhook-driven key generation, Resend for email delivery
9. SARIF v2.1.0 for GitHub Code Scanning + IDE integration
10. Landing page: Next.js 16 + Tailwind CSS 4 in site/ subdirectory
