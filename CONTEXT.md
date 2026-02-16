# MigrationPilot — Session Context Restore

Read this document first to understand the project and current state. Then read `PROGRESS.md` for detailed session history.

---

## What Is This Project

MigrationPilot is a PostgreSQL migration safety CLI + GitHub Action. It parses SQL with the real PostgreSQL parser (libpg-query WASM), classifies every lock acquired, flags dangerous patterns with 48 safety rules, scores risk, and suggests safe alternatives — all without touching the database.

**Business model**: Open-core. Free static linting (45 rules), paid production context (3 rules: MP013, MP014, MP019 that query live DB stats). $29/mo Pro tier via Stripe.

**Tech stack**: TypeScript ESM, Node.js 20+, pnpm, vitest, esbuild, Stripe SDK v20, Resend (email), Next.js 16 + Tailwind CSS 4 (landing page), Vercel (deployment).

---

## Project Structure

```
migrationpilot/
  src/
    parser/          # DDL parsing with libpg-query WASM
    locks/           # Lock type classification
    rules/           # 48 safety rules (MP001-MP048), engine, registry
    production/      # Production context queries (Pro tier)
    scoring/         # Risk scoring (RED/YELLOW/GREEN)
    generator/       # Safe migration SQL generation
    output/          # 6 formatters: CLI, JSON, SARIF, markdown, PR comment, plan
    analysis/        # Shared analyzeSQL pipeline, transaction/ordering validation
    fixer/           # Auto-fix engine (6 rules)
    frameworks/      # Migration framework detection (14 frameworks)
    watch/           # File watcher
    hooks/           # Git pre-commit hook installer
    config/          # Config file system + presets
    license/         # HMAC-SHA256 license key validation
    billing/         # Stripe checkout + webhook + Resend email
    cli.ts           # CLI entry (8 commands)
    index.ts         # Programmatic API (17 exports)
    action/          # GitHub Action entry point
  api/
    checkout.ts      # Vercel POST /api/checkout (with rate limiting)
    stripe-webhook.ts # Vercel POST /api/stripe-webhook
    billing-portal.ts # Vercel POST /api/billing-portal
  site/              # Next.js 16 landing page
    src/app/
      page.tsx       # Landing page (features, rules, pricing)
      checkout/page.tsx    # Checkout flow (POSTs to API, redirects to Stripe)
      checkout/success/page.tsx  # Payment success page
      billing/page.tsx     # Billing management (email → Stripe portal)
      rules/[id]/page.tsx  # 48 dynamic rule pages
  scripts/
    build.js         # esbuild build script (injects signing secret at build time)
  tests/             # 558 tests across 31 files
  dist/              # Build output (CLI 835KB, Action 1.2MB, API 219KB)
```

---

## Current State (as of 2026-02-16)

### What's Done
- **Product is fully built**. 48 rules, 8 CLI commands, auto-fix, watch mode, pre-commit hooks, config presets, 14 framework detection, 6 output formats, GitHub Action, programmatic API.
- **Payment system is production-ready** (code side). Stripe checkout, webhook handling (4 events), license key generation (HMAC-SHA256), email delivery (Resend), billing portal, feature gating.
- **558 tests pass**, build clean, lint clean.
- **Landing page complete** with checkout flow, success page, billing page, 48 rule pages, OG image, SEO.

### What's NOT Done (External Setup)
None of the external services are set up yet. See `SETUP-CHECKLIST.md` for the complete list:
- Stripe account + products/prices/webhook
- Domain registration (migrationpilot.dev)
- Resend account + domain verification
- Vercel deployment + env vars
- npm account + tokens
- GitHub repo is still **private**

### What's Next
The approved execution order is:
1. ~~Dev environment setup~~ (done)
2. ~~Product gaps/features~~ (done — 48 rules, all CLI features)
3. ~~Developer experience~~ (done — explainability, timing, error messages, CI)
4. ~~Technical improvements~~ (done — strict TS, JSON output, API, E2E, snapshots)
5. **Marketing content** (not started — blog posts, Show HN, outreach)

Before marketing, the external setup from `SETUP-CHECKLIST.md` should be completed.

---

## Key Architecture Decisions

1. **License keys**: Format `MP-TIER-EXPIRY-SIGNATURE`. HMAC-SHA256 signed, client-side validation. Signing secret is baked into CLI at build time via esbuild `--define:__MP_SIGNING_SECRET__`.
2. **Billing flow**: Landing page → `/checkout?tier=pro` (client page) → POST `/api/checkout` → Stripe Checkout → redirect to `/checkout/success`. Stripe webhook fires → generates license key → emails it via Resend.
3. **Webhook events**: `checkout.session.completed` (new key), `customer.subscription.updated` (key regen on tier change), `customer.subscription.deleted` (natural expiry), `invoice.paid` (refresh key on renewal).
4. **Idempotency**: Duplicate webhook events check for existing key before generating.
5. **Expiry alignment**: License key expiry = `subscription.items.data[0].current_period_end` (Stripe v20 SDK).
6. **Free rules**: MP001-MP012, MP015-MP018, MP020-MP048 (45 rules). **Paid**: MP013, MP014, MP019 (3 rules).
7. **Rate limiting**: Checkout endpoint: 10 req/min/IP.

---

## Important Files to Read

| File | Why |
|------|-----|
| `PROGRESS.md` | Detailed session-by-session history, every file created/modified |
| `SETUP-CHECKLIST.md` | External service setup needed before deployment |
| `CLAUDE.md` | Project rules, architecture, code conventions |
| `PLAN.md` | Original implementation plan and phases |
| `README.md` | Public-facing documentation |
| `CHANGELOG.md` | Version history |
| `package.json` | Dependencies, scripts, metadata |

---

## Commands

```bash
pnpm dev          # Run CLI in dev mode
pnpm build        # Build with esbuild (injects signing secret)
pnpm test         # Run 558 tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript strict check
```

---

## Git State

- Branch: `main`
- Repo: `github.com/mickelsamuel/migrationpilot` (private)
- All work committed and pushed through session 11

---

## Rules for Working on This Project

- Always read `PROGRESS.md` at session start
- Always update `PROGRESS.md` before ending
- 2-space indent, ESM imports, strict TypeScript
- Run tests after significant changes
- No author/email/AI references in commits or code
- Use TaskCreate for multi-step work
- One task per chat, /clear between unrelated work
