# Contributing to MigrationPilot

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/mickelsamuel/migrationpilot.git
cd migrationpilot

# Install dependencies
pnpm install

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Build
pnpm build
```

## Project Structure

```
src/
  parser/       DDL parsing with libpg-query WASM
  locks/        Lock type classification
  rules/        Safety rules (MP001-MP112)
  scoring/      Risk scoring engine
  output/       Output formatters (CLI, JSON, SARIF, markdown, PR comment)
  analysis/     Shared analysis pipeline, transaction analysis, ordering
  fixer/        Auto-fix engine
  config/       Configuration file system
  production/   Production context queries (what --database-url reads)
  schema/       Schema introspection and modelling
  graph/        Dependency graph between objects
  cascade/      Cascade / blast-radius analysis
  lockqueue/    Lock queue and contention modelling
  sequence/     Multi-file migration ordering
  simulate/     Shadow-database simulation
  mutate/       Mutation testing for the rule set
  prediction/   Duration and impact estimates
  templates/    Migration templates
  plugins/      Third-party rule plugins
  mcp/          MCP server (agent-facing tools)
  license/      License key validation
  cli.ts        CLI entry point
  index.ts      Programmatic API entry point
  browser.ts    Browser bundle for the playground
  action/       GitHub Action entry point
bench/          Benchmark corpus and runner
tests/          Test files
```

Not every directory is listed — `src/` has a few more (audit, auth, billing, doctor,
drift, frameworks, generator, history, hooks, policy, prompts, team, update, usage,
watch). The ones above are the parts most contributions touch.

## Adding a New Rule

1. Create `src/rules/MP0XX-rule-name.ts`:
   ```typescript
   import type { Rule, RuleContext, RuleViolation } from './engine.js';

   export const ruleName: Rule = {
     id: 'MP0XX',
     name: 'rule-name',
     severity: 'warning', // or 'critical'
     description: 'Short description of what the rule checks.',
     whyItMatters: 'Explains the real-world impact if this rule is violated.',
     docsUrl: 'https://migrationpilot.dev/rules/mp0xx',
     check(stmt, ctx): RuleViolation | null {
       // Return a violation or null
     },
   };
   ```

2. Register in `src/rules/index.ts` by adding to the `allRules` array.

3. Add tests in the appropriate test file.

4. Run `pnpm typecheck && pnpm test && pnpm lint`.

If the rule reads live catalog data (table size, write counters, replication,
extension metadata) and cannot say anything without it, add
`requiresDatabaseUrl: true` next to `docsUrl`. That flag is public — it shows up
in `list-rules --json` and in the MCP `get_rule` tool — so
`tests/requires-database-url.test.ts` checks it both ways: a flagged rule must
stay silent across the whole benchmark corpus with no database, and a rule that
touches production context must carry the flag.

## Running the Benchmark

```bash
pnpm build && node bench/run.mjs
```

The build is required — the runner drives the built CLI, not the TypeScript
sources. It scores MigrationPilot against Squawk and pgfence on the labelled
corpus in `bench/corpus/` and rewrites `bench/RESULTS.md` and
`bench/results.json`. The competitors are fetched with `npx` at pinned versions,
so the first run needs network access.

Useful flags: `--tools=mp` to skip the competitors, `--dump-rules` to see every
rule id each tool emitted per file, `--no-timing` to skip the throughput phase.
See `bench/README.md` for the rest.

If you add or change a rule, re-run the benchmark and commit the regenerated
results with your change. Everything in `RESULTS.md` is generated except the
clearly marked defects section.

## Adding a Docs Page

Documentation lives in two places that are maintained separately:

- `docs/` — the markdown a reader gets from the repository. Add
  `docs/<topic>.md`, match the shape of a neighbour like `docs/auto-fix.md`
  (title, a short paragraph saying what the feature is for, then runnable
  examples), and link it from any related page.
- `site/src/app/docs/docs-data.ts` — the website's copy, written by hand as
  structured sections rather than generated from `docs/`. Adding a page there is
  a separate change.

Per-rule pages under `docs/rules/MP0XX.md` follow the existing per-rule format;
copy the closest existing rule page rather than inventing a new layout.

## Code Style

- TypeScript strict mode (ESM)
- 2-space indentation
- async/await over promise chains
- Pure functions for parser, lock classifier, rules (no side effects)
- Only the modules that need it (production/, license/, billing/, config/) may do I/O

## Pull Request Process

1. Fork the repository and create a feature branch
2. Make your changes with tests
3. Ensure all checks pass: `pnpm typecheck && pnpm test && pnpm lint`
4. Submit a pull request with a clear description

## Conventional Commits

We use conventional commit messages:
- `feat:` New features
- `fix:` Bug fixes
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `docs:` Documentation changes
- `chore:` Maintenance tasks
