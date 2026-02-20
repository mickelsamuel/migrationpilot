# Changelog

## 0.1.0 — 2026-02-20

Initial release.

### Features

- **80 safety rules** — Lock safety, data protection, and best practices for PostgreSQL migrations
- **On-save diagnostics** — Violations appear inline as you edit `.sql` files
- **Hover information** — See why a violation matters and safe alternatives
- **Quick fixes** — One-click auto-fix for 12 rules (CONCURRENTLY, lock_timeout, VARCHAR→TEXT, TIMESTAMPTZ, and more)
- **Inline disable** — Quick action to add `-- migrationpilot-disable` comments
- **Configurable** — Target PG version (9-20), exclude rules, customize severity levels
- **3 commands** — Analyze current file, analyze all SQL files, clear diagnostics
