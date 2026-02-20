# MigrationPilot for VS Code

PostgreSQL migration safety linter for VS Code. Analyzes SQL migration files on save with 80 safety rules for lock safety, data protection, and best practices.

Powered by the real PostgreSQL parser (libpg-query) — no regex heuristics.

## Getting Started

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=migrationpilot.migrationpilot)
2. Open any `.sql` migration file
3. Violations appear inline as you type and save

No configuration required. Works out of the box with sensible defaults.

## Features

- **On-save diagnostics** — Violations appear inline as you edit SQL files
- **Hover information** — Hover over violations to see why they matter and safe alternatives
- **Quick fixes** — One-click fixes for 12 auto-fixable rules (e.g., add CONCURRENTLY, replace VARCHAR with TEXT)
- **Inline disable** — Quick action to add `-- migrationpilot-disable` comments
- **Configurable** — Set target PG version, exclude rules, customize severity levels

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `migrationpilot.enable` | `true` | Enable/disable diagnostics |
| `migrationpilot.pgVersion` | `17` | Target PostgreSQL version (9-20) |
| `migrationpilot.excludeRules` | `[]` | Rule IDs to exclude |
| `migrationpilot.filePattern` | `**/*.sql` | Glob pattern for SQL files |
| `migrationpilot.severity.critical` | `Error` | VS Code severity for critical violations |
| `migrationpilot.severity.warning` | `Warning` | VS Code severity for warning violations |

## Commands

- **MigrationPilot: Analyze Current File** — Run analysis on the active SQL file
- **MigrationPilot: Analyze All SQL Files** — Scan all SQL files in workspace
- **MigrationPilot: Clear Diagnostics** — Clear all MigrationPilot diagnostics

## Links

- [Documentation](https://migrationpilot.dev/docs) — Full docs, framework guides, and rule reference
- [CLI + GitHub Action](https://www.npmjs.com/package/migrationpilot) — Use MigrationPilot in CI/CD
- [All 80 Rules](https://migrationpilot.dev/docs/rules) — Browse rules with examples and configuration
- [GitHub](https://github.com/mickelsamuel/migrationpilot) — Source code and issue tracker

## Contributing

```bash
cd vscode-migrationpilot
npm install
npm run build
npm run package  # creates .vsix
```

See [CONTRIBUTING.md](https://github.com/mickelsamuel/migrationpilot/blob/main/CONTRIBUTING.md) for details.

## License

[MIT](https://github.com/mickelsamuel/migrationpilot/blob/main/LICENSE)
