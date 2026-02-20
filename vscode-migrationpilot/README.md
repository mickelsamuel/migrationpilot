# MigrationPilot for VS Code

PostgreSQL migration safety linter for VS Code. Analyzes SQL migration files on save with 80 safety rules for lock safety, data protection, and best practices.

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

## Building

```bash
cd vscode-migrationpilot
npm install
npm run build
```

To create a VSIX package:

```bash
npm run package
```
