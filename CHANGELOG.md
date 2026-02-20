# Changelog

All notable changes to MigrationPilot will be documented in this file.

## [1.4.0] - 2026-02-20

### New Rules (14 rules, 66 → 80 total)

**Lock Safety (MP069, MP072, MP073)**:
- **MP069**: warn-fk-lock-both-tables - FK constraint locks both source and referenced table simultaneously
- **MP072**: warn-partition-default-scan - `ATTACH PARTITION` scans DEFAULT partition under lock
- **MP073**: ban-superuser-role - `ALTER SYSTEM` / `CREATE ROLE SUPERUSER` in migrations is dangerous

**Data Safety (MP067, MP071, MP080)**:
- **MP067**: warn-backfill-no-batching - `DELETE` without WHERE clause locks entire table and bloats WAL
- **MP071**: ban-rename-in-use-column - `RENAME COLUMN` without updating dependent views/functions
- **MP080**: ban-data-in-migration - DML (INSERT/UPDATE/DELETE) mixed with DDL in same migration

**Best Practices (MP068, MP070, MP074-MP079)**:
- **MP068**: warn-integer-pk-capacity - `CREATE SEQUENCE AS integer` risks overflow — use `bigint`
- **MP070**: warn-concurrent-index-invalid - `CREATE INDEX CONCURRENTLY` can leave invalid index on failure
- **MP074**: require-deferrable-fk - FK constraints should be `DEFERRABLE` for bulk loading
- **MP075**: warn-toast-bloat-risk - `UPDATE` on TOAST columns causes bloat from full-row copies
- **MP076**: warn-xid-consuming-retry - `SAVEPOINT` creates subtransactions consuming XIDs rapidly
- **MP077**: prefer-lz4-toast-compression - Use `lz4` over `pglz` for TOAST compression (PG 14+)
- **MP078**: warn-extension-version-pin - `CREATE EXTENSION` without `VERSION` is non-deterministic
- **MP079**: warn-rls-policy-completeness - RLS policies don't cover all operations

### New Features

**VS Code Extension** (`vscode-migrationpilot/`):
- Real-time diagnostics on save with severity-mapped squiggles
- Hover tooltips showing rule details, why it matters, safe alternatives
- Quick fix actions for 12 auto-fixable rules + inline disable comments
- Configurable PG version, rule exclusion, and file patterns
- 130KB bundled with esbuild

**Browser Playground** (`site/src/app/playground/`):
- Interactive SQL editor with 5 example migrations
- Server-side analysis via Next.js Server Actions
- PG version selector (10-20), risk badges, violation cards
- Zero data storage — runs entirely on Vercel

**Analysis Features**:
- **Schema state simulation** — In-memory DDL replay tracking tables, columns, indexes, constraints, sequences
- **Cross-migration dependency graph** — Directed edges between files, cycle detection via DFS, orphan identification
- **Migration duration prediction** — Heuristic-based estimates calibrated with table stats (row count, size, indexes)
- **Lock queue simulation** — Models blocked operations, queue buildup time, and actionable recommendations
- **Trigger cascade analysis** — Static and DB-backed cascade chain discovery with depth limits
- **Sequence overflow monitoring** — Static analysis of CREATE SEQUENCE types + DB-backed current value checking

**Expand-Contract Templates** (`template` command):
- 5 operations: `rename-column`, `change-type`, `split-table`, `add-not-null`, `remove-column`
- 3-phase output (expand, migrate, contract) with proper timeouts and batch processing
- `--phase` flag to output a single phase

**Custom Rules Engine** (`src/plugins/`):
- ESLint-style plugin loading from local files or npm packages
- Validates rule IDs to prevent collision with built-in `MP` prefix
- Default severity assignment for plugins missing severity field

**Shareable Config Presets** (5 total):
- `migrationpilot:recommended` — Default balanced settings
- `migrationpilot:strict` — All 80 rules at critical severity
- `migrationpilot:ci` — CI-optimized defaults
- `migrationpilot:startup` — Disables nitpicky rules for early-stage teams
- `migrationpilot:enterprise` — Maximum safety with audit logging and lower thresholds

**Enterprise Features**:
- **Team management** — Org-level seat tracking, member registration, activity logging, centralized config fetching
- **Policy enforcement** — Required rules, severity floors, blocked SQL patterns, review-required patterns
- **SSO authentication** — Device code flow for CLI login, API key auth, token management
- `team` command — Show organization status, seats, members, and recent activity
- `login` / `logout` commands — Authenticate via SSO or API key
- `policy` command — Check migration files against organization policies
- `team` and `policy` config sections in `.migrationpilotrc.yml`

**CLI Improvements**:
- `template` command — Generate expand-contract migration templates
- `predict` command — Estimate migration duration with optional table stats
- Next-step suggestions after analysis (Rust compiler-inspired)
- 20 commands total (was 14)

**Pricing Restructure**:
- Pro: $29 → $19/month ($24 → $16/month annual)
- New Team tier: $49/month ($42/month annual), up to 10 seats
- 4-tier structure: Free, Pro, Team, Enterprise

### Quality
- 970+ tests across 54 test files
- Build clean: CLI 1.0MB, Action 1.6MB, API 390KB, MCP 1.2MB
- Typecheck clean, lint clean
- 14 new rule documentation pages (docs/rules/MP067-MP080.md)
- 17 VS Code extension tests
- 33 enterprise feature tests (team, policy, SSO)

## [1.3.0] - 2026-02-19

### New Rules (18 rules, 48 → 66 total)

**Lock Safety (MP049, MP055)**:
- **MP049**: require-partition-key-in-pk - Partitioned table PK must include all partition key columns
- **MP055**: drop-pk-replica-identity-break - Dropping PK breaks logical replication when table uses default REPLICA IDENTITY

**Best Practices (MP050-MP051, MP056, MP058-MP059)**:
- **MP050**: prefer-hnsw-over-ivfflat - HNSW provides better recall without training data or reindexing
- **MP051**: require-spatial-index - Spatial/geometry columns need GIST or SP-GIST indexes
- **MP056**: gin-index-on-jsonb-without-expression - Plain GIN index on JSONB column useless for ->> operator queries
- **MP058**: multi-alter-table-same-table - Multiple ALTER TABLE on same table causes unnecessary lock cycles
- **MP059**: sequence-not-reset-after-data-migration - INSERT with explicit IDs without setval() causes duplicate key errors

**Dependency & Transaction Safety (MP052-MP054)**:
- **MP052**: warn-dependent-objects - DROP/ALTER COLUMN may break views, functions, or triggers
- **MP053**: ban-uncommitted-transaction - BEGIN without matching COMMIT leaves open transaction
- **MP054**: alter-type-add-value-in-transaction - New enum value not visible until COMMIT

**Replication Safety (MP057, MP060)**:
- **MP057**: rls-enabled-without-policy - ENABLE ROW LEVEL SECURITY without CREATE POLICY silently denies all access
- **MP060**: alter-type-rename-value - RENAME VALUE breaks logical replication subscribers

**Performance (MP061)**:
- **MP061**: suboptimal-column-order - Variable-length columns before fixed-size columns wastes alignment padding

**Safety (MP062)**:
- **MP062**: ban-add-generated-stored-column - Adding a stored generated column causes full table rewrite under ACCESS EXCLUSIVE lock

**Static Analysis (MP063)**:
- **MP063**: warn-do-block-ddl - DO block contains DDL that bypasses static analysis — lock impact cannot be determined

**Operations Safety (MP064-MP065)**:
- **MP064**: ban-disable-trigger - DISABLE TRIGGER breaks replication, audit logs, and FK enforcement
- **MP065**: ban-lock-table - Explicit LOCK TABLE blocks queries and can cause deadlocks

**Maintenance (MP066)**:
- **MP066**: warn-autovacuum-disabled - Disabling autovacuum causes table bloat and risks transaction ID wraparound

### New Commands
- `doctor` - Diagnostic checks (Node version, config, latest version, framework, license)
- `completion <shell>` - Shell completion scripts for bash, zsh, and fish
- `drift` - Compare two database schemas to detect drift between environments
- `trends` - Historical analysis of migration safety trends over time
- `explain <rule>` - Show detailed information about a specific rule
- `rollback <file>` - Generate reverse DDL for migration rollback

### New Features
- **MCP Server** — Model Context Protocol server with 4 tools (`analyze_migration`, `suggest_fix`, `explain_lock`, `list_rules`) for AI assistant integration
- **Schema Drift Detection** — Compare two database schemas via `information_schema` to find missing tables, columns, indexes, and constraints
- **Historical Analysis** — JSONL-based storage of analysis results with trend computation
- **Audit Logging** — JSONL event log for enterprise compliance, configurable path, CI/user/timestamp enrichment
- **Air-Gapped Mode** — `--offline` flag skips update checks and production context for regulated environments
- **Free Usage Tracking** — 3 production analyses per month on free tier with contextual upgrade prompts
- **14-Day Free Trial** — Pro trial via Stripe Checkout with no credit card required upfront
- **Annual Pricing** — ~17% discount ($24/mo billed annually vs $29/mo monthly)
- **Shell Completions** — bash, zsh, and fish completion scripts via `migrationpilot completion`
- **Star Prompt** — One-time "Star on GitHub" message after first analysis with violations (suppressed in CI)
- **Update Checker** — npm registry version check with 24h cache in `~/.migrationpilot/`

### New Auto-Fixes (6 → 12 rules)
- **MP021**: `REINDEX` → `REINDEX CONCURRENTLY`
- **MP023**: `CREATE TABLE/INDEX` → `CREATE TABLE/INDEX IF NOT EXISTS`
- **MP037**: `VARCHAR(n)` → `TEXT`
- **MP040**: `TIMESTAMP` → `TIMESTAMPTZ`
- **MP041**: `CHAR(n)` → `TEXT`
- **MP046**: `DETACH PARTITION` → `DETACH PARTITION CONCURRENTLY`

### CLI Improvements
- `--output <file>` flag on `analyze` and `check` — write report to file while showing summary on stdout
- `--offline` flag on `analyze` and `check` commands for air-gapped deployment
- `--no-config` flag to skip config file loading
- `init --preset <name>` flag for quick configuration (recommended, strict, ci)
- `init --force` flag to overwrite existing config files
- Config file validation — warns on unknown keys in `.migrationpilotrc.yml`
- Post-analysis messages (update check, star prompt) with CI-aware suppression

### GitHub Action Improvements
- **Inline annotations** — violations appear directly in the PR diff "Files changed" tab
- **Job Summary** — rich markdown summary with metrics and violations table in the Actions tab
- New `exclude` input — comma-separated list of rules to skip (e.g. `MP001,MP004`)
- New `config-file` input — path to `.migrationpilotrc.yml` (auto-detected if not specified)
- Config-driven severity overrides in Action context
- Expired license warning with renewal link
- Paginated PR comment lookup (handles repos with 100+ comments)

### Programmatic API
- New exports: `autoFix`, `isFixable` (auto-fix engine), `detectFrameworks` (framework detection)

### Documentation
- 31 documentation pages on landing site (6 core docs + 14 framework guides + 9 provider guides + rules index + pricing)
- Dedicated `/pricing` page with tier comparison, annual toggle, and FAQ
- Rules index page (`/docs/rules`) with all 66 rules categorized
- `/migrate-from-atlas` landing page — rule mapping, feature comparison, migration guide
- `/migrate-from-squawk` landing page — 25-rule mapping, 18-feature comparison, migration guide
- Enterprise landing page with security, compliance, SLA details
- GitLab CI and Bitbucket Pipelines example configurations
- Rule documentation for MP049-MP066 (18 files)

### Quality
- 781+ tests across 48 test files
- 33 E2E CLI tests covering all major commands, flags, and performance
- 31 fixer tests covering all 12 auto-fix rules
- 20 MCP server tests covering all 4 tools
- 12 new rule tests for MP052-MP054
- 21 new rule tests for MP055-MP060
- 19 config tests including validation warnings and auditLog support
- Build clean: CLI 923KB, Action 1.5MB, API 274KB, MCP 1.2MB
- Site: 100+ pages (66 rules + 31 docs + enterprise + billing + migrate-from-atlas + migrate-from-squawk + misc)

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

[1.4.0]: https://github.com/mickelsamuel/migrationpilot/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/mickelsamuel/migrationpilot/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/mickelsamuel/migrationpilot/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/mickelsamuel/migrationpilot/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mickelsamuel/migrationpilot/releases/tag/v1.0.0
