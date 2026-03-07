# MigrationPilot — Implementation Plan

## Current Phase: PHASE 0 — Validation + Project Setup
**Started**: 2026-02-11

---

## Phase Overview

| Phase | Weeks | What | Gate |
|-------|-------|------|------|
| **0** | Week 0 | Validation: landing page, blog posts, outreach | 3+ engineers interested |
| **A** | Weeks 1-4 | Core CLI: parser, lock classifier, 8 rules, CLI, GitHub Action | v0.1.0 launch on HN |
| **B** | Weeks 5-8 | Production context: table stats, pg_stat_statements, risk scoring | v0.2.0 ship |
| **C** | Weeks 9-10 | Billing: Stripe, license keys, Pro tier launch | First revenue |
| **D** | Weeks 11-12 | Growth: SARIF, GitLab, content, 12-week assessment | Kill/continue decision |

---

## Phase 0 Tasks (Current)

### Day 1-2: Project Setup + Blog Post #1
- [x] Create project folder structure
- [x] Set up PLAN.md, PROGRESS.md
- [ ] Initialize pnpm project with TypeScript
- [ ] Set up vitest, eslint, tsconfig (ESM, strict)
- [ ] Create directory scaffold (src/parser, src/locks, src/rules, etc.)
- [ ] Write blog post #1: "Why Your PostgreSQL Migrations Are More Dangerous Than You Think"

### Day 3-4: Landing Page + Blog Post #2
- [ ] Register migrationpilot.dev domain
- [ ] Deploy landing page on Vercel (Next.js + Tailwind)
- [ ] Email signup form (Resend or serverless function)
- [ ] Write blog post #2: "The Complete Guide to PostgreSQL Lock Types for Schema Changes"

### Day 5-6: Outreach + Blog Post #3
- [ ] Post on r/PostgreSQL (educational framing)
- [ ] Post on r/devops about zero-downtime migration challenges
- [ ] DM 10 engineers on Twitter/LinkedIn who've written about migration problems
- [ ] Write blog post #3: "How CloudKitchens Prevents Migration Outages"

### Day 7: Assessment
- [ ] Count email signups, Reddit engagement, DM responses
- [ ] GO/NO-GO: Need 3+ "yes I'd try this"

---

## Phase A Tasks (Weeks 1-4)

### Week 1: Parser + Lock Classifier
- [ ] DDL parser with libpg-query WASM (src/parser/parse.ts)
- [ ] Table/column extraction from AST (src/parser/extract.ts)
- [ ] Lock type classifier lookup table (src/locks/classify.ts)
- [ ] 20+ unit tests with PGlite

### Week 2: Static Rules Engine
- [ ] Rules engine architecture (src/rules/engine.ts)
- [ ] MP001: require-concurrent-index
- [ ] MP002: require-check-not-null
- [ ] MP003: volatile-default-rewrite
- [ ] MP004: require-lock-timeout
- [ ] MP005: require-not-valid-fk
- [ ] MP006: no-vacuum-full
- [ ] MP007: no-column-type-change
- [ ] MP008: no-multi-ddl-transaction
- [ ] Full test coverage for all 8 rules

### Week 3: CLI + Output + Safe Alternatives
- [ ] CLI with commander (src/cli.ts)
- [ ] Terminal output with chalk + cli-table3
- [ ] Safe migration generator (src/generator/alternatives.ts)
- [ ] lock_timeout retry wrapper generation
- [ ] End-to-end SQL file → CLI → formatted output

### Week 4: GitHub Action + PR Comments + LAUNCH
- [ ] action.yml + action entry point
- [ ] PR comment formatter (GFM markdown)
- [ ] @actions/github for posting/updating PR comments
- [ ] esbuild bundle for single-file distribution
- [ ] v0.1.0 LAUNCH: npm publish, GH Action Marketplace, Show HN

---

## Kill Conditions (Non-Negotiable)
- < 3 interested engineers from validation → Don't build
- < 50 GitHub stars after 8 weeks → Reassess
- Zero paying customers 4 months post-Pro → Kill product
- < $1K MRR at 12 months → Side-project mode
