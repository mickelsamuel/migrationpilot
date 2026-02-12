# MigrationPilot — Progress Tracker

**Last Updated**: 2026-02-11
**Current Phase**: A (Weeks 1-4) — Core CLI + GitHub Action
**Current Task**: Phase A nearly COMPLETE — ready for real repo test + launch

---

## Session Log

### Session 2 — 2026-02-11 (continued)
**Goal**: Implement GitHub Action, add edge case tests, esbuild bundle
**Status**: COMPLETE

#### What Got Done
- [x] GitHub Action entry point (src/action/index.ts) — full implementation
  - Reads inputs from @actions/core
  - Gets changed files from PR via @actions/github (paginated)
  - Filters migration files by glob pattern
  - Runs full analysis pipeline per file (parse → lock → rules → score)
  - Builds combined PR comment for multiple files
  - Upserts comment using hidden marker `<!-- migrationpilot-report -->`
  - Sets outputs (risk-level, violations)
  - Fails CI based on fail-on threshold
- [x] 79 tests passing across 4 test files (was 31)
  - tests/parser.test.ts — 23 tests (was 12)
  - tests/locks.test.ts — 18 tests (was 8)
  - tests/rules.test.ts — 29 tests (was 11)
  - tests/scoring.test.ts — 9 tests (NEW)
- [x] esbuild bundle working — CLI: 238KB, Action: 987KB
  - CJS format (handles commander's require() correctly)
  - libpg-query marked external (loads WASM at runtime)
- [x] CLI smoke tested from built dist/ — both safe + dangerous migrations work
- [x] Fixed TypeScript errors: unused imports, type narrowing in classify.ts
- [x] All 8 rules tested: MP001-MP008 including edge cases
- [x] New tests: volatile defaults (PG10 vs PG17), FK NOT VALID, multi-DDL transactions, scoring with table stats + query frequency

### Session 1 — 2026-02-11
**Goal**: Initialize project, set up development environment, write core engine
**Status**: COMPLETE

#### What Got Done
- [x] Full project scaffold with pnpm, TypeScript (ESM, strict), vitest, eslint
- [x] DDL parser with libpg-query WASM (src/parser/parse.ts)
- [x] Table/column extraction from AST (src/parser/extract.ts)
- [x] Lock type classifier — full lookup table (src/locks/classify.ts)
- [x] Rules engine architecture (src/rules/engine.ts)
- [x] 8 critical rules implemented: MP001-MP008
- [x] Risk scoring system — RED/YELLOW/GREEN (src/scoring/score.ts)
- [x] Safe migration generator (src/generator/alternatives.ts)
- [x] CLI with commander — `analyze` and `check` commands (src/cli.ts)
- [x] Terminal output formatter with chalk + cli-table3 (src/output/cli.ts)
- [x] PR comment formatter — GitHub Flavored Markdown (src/output/pr-comment.ts)
- [x] action.yml for GitHub Action Marketplace
- [x] Claude Code optimization: custom commands, hooks, skills, lean CLAUDE.md

#### Key Findings During Build
- libpg-query AST uses **string enums** for subtypes (e.g., `"AT_AlterColumnType"`), not integers
- VACUUM options are `DefElem[]` arrays, not bitmasks
- SET statements parse as `VariableSetStmt`, need special handling in lock classifier
- JSDoc comments can't contain `*/` in string examples (terminates comment block)
- esbuild ESM format can't handle commander's internal require() — use CJS format
- Lock-only risk score maxes at 40/100 (YELLOW), RED requires table size or query frequency factors

#### What's Done from Phase A Plan
- [x] Project scaffold (Week 1)
- [x] DDL parser with libpg-query (Week 1)
- [x] Table/column extraction (Week 1)
- [x] Lock type classifier (Week 1)
- [x] 79 tests passing (Week 1)
- [x] 8 critical rules: MP001-MP008 (Week 2)
- [x] CLI + output + safe alternatives (Week 3)
- [x] GitHub Action entry point (Week 4)
- [x] PR comment posting via @actions/github (Week 4)
- [x] esbuild bundle for distribution (Week 4)

#### What's Left for v0.1.0 LAUNCH
- [ ] Push to GitHub (mickelsamuel/migrationpilot)
- [ ] Test GitHub Action in a real PR
- [ ] README with usage examples + screenshots
- [ ] npm publish
- [ ] GitHub Action Marketplace listing
- [ ] Show HN post

#### Next Steps (Resume Here)
1. Push to GitHub — `git push origin main`
2. Create a test repo with a PR containing a dangerous migration to verify the GitHub Action works end-to-end
3. Write README.md with: badges, quick start, CLI usage, GitHub Action usage, rule list, screenshots
4. npm publish + Marketplace listing

---

## All Files in Project

### Source Files
- src/parser/parse.ts — DDL parsing with libpg-query
- src/parser/extract.ts — Table/column extraction from AST
- src/locks/classify.ts — Lock type classification
- src/rules/engine.ts — Rule runner + interfaces
- src/rules/index.ts — Rule registry
- src/rules/MP001-concurrent-index.ts
- src/rules/MP002-check-not-null.ts
- src/rules/MP003-volatile-default.ts
- src/rules/MP004-lock-timeout.ts
- src/rules/MP005-not-valid-fk.ts
- src/rules/MP006-vacuum-full.ts
- src/rules/MP007-column-type-change.ts
- src/rules/MP008-multi-ddl-transaction.ts
- src/scoring/score.ts — Risk scoring (RED/YELLOW/GREEN)
- src/generator/alternatives.ts — Safe SQL generation
- src/output/cli.ts — Terminal output formatter
- src/output/pr-comment.ts — PR comment GFM formatter
- src/cli.ts — CLI entry point (commander)
- src/action/index.ts — GitHub Action entry (IMPLEMENTED)
- src/production/context.ts — Production context (placeholder, Phase B)
- src/license/validate.ts — License validation (placeholder, Phase C)

### Test Files
- tests/parser.test.ts — 23 tests
- tests/locks.test.ts — 18 tests
- tests/rules.test.ts — 29 tests
- tests/scoring.test.ts — 9 tests

### Build Output
- dist/cli.cjs — 238KB CLI bundle
- dist/action/index.js — 987KB Action bundle

### Config Files
- package.json, tsconfig.json, vitest.config.ts, eslint.config.js
- action.yml, .gitignore
- CLAUDE.md, PLAN.md, PROGRESS.md
- .claude/commands/catchup.md, .claude/commands/checkpoint.md
- .claude/settings.json, .claude/skills/postgresql-migrations/SKILL.md

---

## Key Decisions Made
1. TypeScript + ESM + strict mode
2. pnpm as package manager
3. vitest for testing (PGlite for unit, testcontainers for integration)
4. esbuild for bundling — CJS format (handles commander require())
5. Open-core model: free static linting, paid production context
6. libpg-query AST uses string enum subtypes — all code adapted
7. VACUUM options are DefElem arrays — all code adapted
8. SET/RESET classified as ACCESS SHARE (no lock)
9. libpg-query marked external in esbuild (WASM can't be bundled)
10. Hidden HTML comment marker for PR comment upsert
