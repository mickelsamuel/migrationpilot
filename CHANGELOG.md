# Changelog

All notable changes to MigrationPilot will be documented in this file.

## [1.2.0] - 2026-02-16

### Security
- Switch license key signing from HMAC-SHA256 to Ed25519 asymmetric cryptography
- Remove Pro rules from programmatic API exports (only free rules publicly accessible)
- Add security headers to landing page (CSP, HSTS, X-Frame-Options, Referrer-Policy)
- Add CORS headers restricting API endpoints to migrationpilot.dev origin
- Fix error message leakage in checkout, billing-portal, and webhook APIs
- Add rate limiting and email validation to billing-portal endpoint
- Remove dist/ and internal config files from public repository

### Improvements
- Add expired license warning with renewal link across all CLI commands
- Add `--license-key` option to watch mode for Pro features
- Drop Node 20 from CI matrix (EOL April 2026), require Node >= 22

## [1.1.0] - 2026-02-13

### New Rules (23 rules, 25 → 48 total)

**Lock Safety (MP026-MP033)**:
- **MP026**: ban-drop-table - DROP TABLE permanently removes table and data
- **MP027**: disallowed-unique-constraint - UNIQUE constraint without USING INDEX scans full table
- **MP028**: no-rename-table - Renaming tables breaks queries, views, FKs
- **MP029**: ban-drop-not-null - DROP NOT NULL may break app assumptions
- **MP030**: require-not-valid-check - CHECK constraint without NOT VALID (auto-fixable)
- **MP031**: ban-exclusion-constraint - EXCLUSION constraint under ACCESS EXCLUSIVE
- **MP032**: ban-cluster - CLUSTER rewrites table under ACCESS EXCLUSIVE
- **MP033**: require-concurrent-refresh-matview - REFRESH MATERIALIZED VIEW without CONCURRENTLY (auto-fixable)

**Data Safety (MP034-MP036)**:
- **MP034**: ban-drop-database - DROP DATABASE in migration files
- **MP035**: ban-drop-schema - DROP SCHEMA permanently removes schema
- **MP036**: ban-truncate-cascade - TRUNCATE CASCADE across FK-referencing tables

**Best Practices (MP037-MP045, MP048)**:
- **MP037**: prefer-text-over-varchar - VARCHAR(n) has no benefit over TEXT in PostgreSQL
- **MP038**: prefer-bigint-over-int - INT PK/FK can overflow, use BIGINT
- **MP039**: prefer-identity-over-serial - SERIAL quirks, use GENERATED ALWAYS AS IDENTITY
- **MP040**: prefer-timestamptz - TIMESTAMP without TZ causes timezone bugs
- **MP041**: ban-char-field - CHAR(n) wastes space and causes comparison bugs
- **MP042**: require-index-name - Unnamed indexes are hard to reference
- **MP043**: ban-domain-constraint - Domain constraints validate against ALL using columns
- **MP044**: no-data-loss-type-narrowing - Narrowing column type risks data loss
- **MP045**: require-primary-key - Tables without PK break replication
- **MP048**: ban-alter-default-volatile - Volatile SET DEFAULT on existing column is misleading

**Advanced (MP046-MP047)**:
- **MP046**: require-concurrent-detach-partition - DETACH PARTITION without CONCURRENTLY (PG 14+)
- **MP047**: ban-set-logged-unlogged - SET LOGGED/UNLOGGED rewrites entire table

### Auto-fix
- 2 new auto-fixable rules: MP030 (NOT VALID on CHECK) and MP033 (CONCURRENTLY on matview refresh)
- Total auto-fixable rules: 6 (MP001, MP004, MP009, MP020, MP030, MP033)

### CLI Improvements
- New `list-rules` command with `--json` option
- `--exclude <rules>` flag to skip specific rules (comma-separated)
- Enriched `--version` output (node version, platform, rule count)
- `NO_COLOR` env var and `TERM=dumb` detection for color disabling

### PG-Version-Aware Rule Updates
- MP002: PG 18+ recommends `SET NOT NULL NOT VALID` + `VALIDATE NOT NULL`
- MP003: PG 11+ note about volatile vs non-volatile defaults
- MP015: PG 10+ recommends `GENERATED ALWAYS AS IDENTITY` over SERIAL
- MP018: PG 18+ recommends `NOT NULL NOT VALID` approach
- MP039: Only flags on PG >= 10 (IDENTITY not available before)
- MP046: Only flags on PG >= 14 (DETACH CONCURRENTLY not available before)

### Config
- `extends` field for shareable config presets
- 3 built-in presets: `migrationpilot:recommended`, `migrationpilot:strict`, `migrationpilot:ci`
- Strict preset: all rules at critical severity, fail on warning

### Package Metadata
- Added `bugs`, `funding`, `packageManager` fields
- Expanded keywords for npm discoverability
- Fixed TypeScript resolution order in exports (`types` before `import`)

### Documentation
- Complete README rewrite with all 48 rules, comparison table, all features
- Per-rule documentation in `docs/rules/` (48 files)
- Landing page updated with v1.1.0, 48 rules, 9 feature cards, grouped rules display
- `.env.example` and `.editorconfig` added

### Quality
- 550+ tests across 31 test files
- All 23 new rules have full test coverage
- Build clean: CLI 835KB, Action 1.2MB, API 219KB

---

## [1.0.0] - 2026-02-12

### Core Engine
- DDL parser powered by libpg-query (WASM) for accurate PostgreSQL AST analysis
- Lock type classifier mapping every DDL operation to its PostgreSQL lock level
- Risk scoring engine with RED/YELLOW/GREEN levels based on lock impact and production context

### Safety Rules (25 rules)
- **MP001**: require-concurrent-index - CREATE INDEX must use CONCURRENTLY
- **MP002**: require-check-not-null - SET NOT NULL needs CHECK constraint pattern
- **MP003**: volatile-default-rewrite - Volatile defaults cause full table rewrite (PG < 11)
- **MP004**: require-lock-timeout - DDL must have lock_timeout set
- **MP005**: require-not-valid-fk - Foreign keys must use NOT VALID + VALIDATE
- **MP006**: no-vacuum-full - VACUUM FULL blocks all queries
- **MP007**: no-column-type-change - Column type changes rewrite the table
- **MP008**: no-multi-ddl-transaction - Multiple DDL in one transaction compounds lock time
- **MP009**: require-concurrent-drop-index - DROP INDEX should use CONCURRENTLY
- **MP010**: no-rename-column - Renaming columns breaks running queries
- **MP011**: no-add-column-default-volatile - Volatile defaults on existing columns cause rewrite
- **MP012**: no-enum-add-value-in-transaction - ALTER TYPE ADD VALUE cannot run in a transaction
- **MP013**: high-traffic-table-ddl - DDL on high-traffic tables (Pro)
- **MP014**: large-table-ddl - DDL on tables > threshold rows (Pro)
- **MP015**: no-add-column-serial - SERIAL creates implicit sequence with ACCESS EXCLUSIVE
- **MP016**: require-index-on-fk - Foreign key columns need indexes
- **MP017**: no-drop-column - DROP COLUMN acquires ACCESS EXCLUSIVE lock
- **MP018**: no-force-set-not-null - SET NOT NULL needs CHECK pattern on PG 12+
- **MP019**: no-exclusive-lock-high-connections - ACCESS EXCLUSIVE with many active connections (Pro)
- **MP020**: require-statement-timeout - Long-running DDL needs statement_timeout
- **MP021**: require-concurrent-reindex - REINDEX needs CONCURRENTLY on PG 12+
- **MP022**: no-drop-cascade - CASCADE silently drops dependent objects
- **MP023**: require-if-not-exists - CREATE TABLE/INDEX need IF NOT EXISTS
- **MP024**: no-enum-value-removal - DROP TYPE destroys enum and dependent columns
- **MP025**: ban-concurrent-in-transaction - CONCURRENTLY in transaction always fails

### CLI
- 7 commands: `analyze`, `check`, `plan`, `init`, `detect`, `watch`, `hook`
- Output formats: text (default), JSON (structured schema), SARIF v2.1.0, markdown
- Modes: `--quiet` (gcc-style), `--verbose` (per-statement), `--stdin` (pipe input)
- Auto-fix with `--fix` and `--fix --dry-run` (MP001, MP004, MP009, MP020)
- `--no-color` flag for CI environments
- Config file support (`.migrationpilotrc.yml`)
- Inline disable comments (`-- migrationpilot-disable MP001`)
- Rule metadata: every violation includes "Why this matters" explanation and docs URL
- Performance timing in output footer

### GitHub Action
- Analyzes migration files changed in PRs
- Posts/updates safety report as PR comment
- SARIF output for GitHub Code Scanning integration
- Configurable fail threshold (critical/warning/never)

### Production Context (Pro tier)
- Query impact analysis via pg_stat_statements
- Table size awareness via pg_class/pg_stat_user_tables
- Active connection monitoring via pg_stat_activity
- Read-only: only queries pg_catalog system views

### Developer Experience
- Programmatic API: `import { analyzeSQL } from 'migrationpilot'`
- TypeScript declarations included
- Migration framework auto-detection (14 frameworks)
- Watch mode with debounced file monitoring
- Git pre-commit hook installer (standalone + husky)
- Execution plan visualization with duration estimates
- Transaction boundary analysis
- Migration ordering validation

### Billing
- Stripe Checkout integration for Pro subscriptions
- HMAC-SHA256 license key validation (client-side, no telemetry)
- Webhook-driven key generation with Resend email delivery

### Quality
- 451 tests across 26 test files
- E2E tests spawning the actual CLI binary
- Snapshot tests for output format stability
- TypeScript strict mode with noUncheckedIndexedAccess
- ESLint clean, zero security vulnerabilities

[1.2.0]: https://github.com/mickelsamuel/migrationpilot/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/mickelsamuel/migrationpilot/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mickelsamuel/migrationpilot/releases/tag/v1.0.0
