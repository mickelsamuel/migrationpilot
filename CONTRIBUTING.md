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
  rules/        Safety rules (MP001-MP048)
  scoring/      Risk scoring engine
  output/       Output formatters (CLI, JSON, SARIF, markdown, PR comment)
  analysis/     Shared analysis pipeline, transaction analysis, ordering
  fixer/        Auto-fix engine
  config/       Configuration file system
  production/   Production context queries (Pro tier)
  license/      License key validation
  cli.ts        CLI entry point
  index.ts      Programmatic API entry point
  action/       GitHub Action entry point
tests/          Test files
```

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

## Code Style

- TypeScript strict mode (ESM)
- 2-space indentation
- async/await over promise chains
- Pure functions for parser, lock classifier, rules (no side effects)
- Only production/, license/, billing/ modules may do I/O

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
