# PostgreSQL Migration Safety Tools: Competitive Analysis (February 2026)

## Executive Summary

MigrationPilot currently has **25 rules**, 7 CLI commands, SARIF/JSON/Markdown output, GitHub Action integration, auto-fix for 4 rules, framework detection for 14 frameworks, watch mode, pre-commit hooks, and a config file system. This puts it in a strong position relative to the market, but there are specific gaps compared to competitors that should be addressed.

**Key finding**: The direct competitor space is surprisingly thin. Squawk (the closest competitor) has ~31 rules but appears to be in maintenance mode. Atlas has pivoted to a commercial platform with aggressive feature-gating. pgroll and reshape are zero-downtime execution tools, not linters. The biggest opportunity is to become the definitive open-source PostgreSQL migration linter while competitors stagnate or commercialize.

---

## 1. Squawk (sbdchd/squawk)

**Repository**: [github.com/sbdchd/squawk](https://github.com/sbdchd/squawk)
**Website**: [squawkhq.com](https://squawkhq.com/)
**GitHub Stars**: ~881
**Language**: Rust
**License**: GPL-3.0
**Pricing**: Free (open source)
**Status**: Appears to be in maintenance mode (low recent activity)

### Complete Rule List (31 rules)

| # | Rule | MigrationPilot Equivalent | Gap? |
|---|------|--------------------------|------|
| 1 | adding-field-with-default | MP015 (no-add-column-serial) + MP003 (volatile-default) | Partial - MP015 covers SERIAL, MP003 covers volatile defaults, but Squawk's rule targets PG <11 defaults specifically |
| 2 | adding-foreign-key-constraint | MP005 (require-not-valid-fk) | Covered |
| 3 | adding-not-nullable-field | MP002 (check-not-null) / MP018 (no-force-not-null) | Covered |
| 4 | adding-required-field | MP002 partial | Partial - Squawk specifically warns about adding a column with NOT NULL and no default |
| 5 | adding-serial-primary-key-field | MP015 partial | Partial - Squawk warns about ACCESS EXCLUSIVE lock building PK index |
| 6 | ban-char-field | None | **GAP** |
| 7 | ban-concurrent-index-creation-in-transaction | MP025 | Covered |
| 8 | ban-drop-column | MP017 | Covered |
| 9 | ban-drop-database | None | **GAP** |
| 10 | ban-drop-not-null | None | **GAP** |
| 11 | ban-drop-table | None | **GAP** |
| 12 | changing-column-type | MP007 | Covered |
| 13 | constraint-missing-not-valid | MP005 + MP002 | Covered |
| 14 | disallowed-unique-constraint | None | **GAP** |
| 15 | prefer-bigint-over-int | None | **GAP** |
| 16 | prefer-bigint-over-smallint | None | **GAP** |
| 17 | prefer-identity | None | **GAP** |
| 18 | prefer-robust-stmts | MP023 (require-if-not-exists) | Partial - MP023 covers IF NOT EXISTS, Squawk's rule is broader (IF EXISTS for drops too) |
| 19 | prefer-text-field | None | **GAP** |
| 20 | prefer-timestamptz | None | **GAP** |
| 21 | renaming-column | MP010 | Covered |
| 22 | renaming-table | None | **GAP** |
| 23 | require-concurrent-index-creation | MP001 | Covered |
| 24 | require-concurrent-index-deletion | MP009 | Covered |
| 25 | transaction-nesting | MP008 / MP025 | Covered |
| 26 | ban-create-domain-with-constraint | None | **GAP** |
| 27 | ban-alter-domain-with-add-constraint | None | **GAP** |
| 28 | ban-truncate-cascade | None | **GAP** |
| 29 | syntax-error | Parser handles this | Covered |
| 30 | require-timeout-settings | MP004 + MP020 | Covered |
| 31 | ban-uncommitted-transaction | MP008 partial | Partial |

### Squawk Rules MigrationPilot is MISSING (13 gaps)

1. **ban-char-field** - CHAR(n) wastes space, use TEXT or VARCHAR
2. **ban-drop-database** - Prevent accidental DROP DATABASE
3. **ban-drop-not-null** - Dropping NOT NULL may break clients expecting non-null
4. **ban-drop-table** - Prevent accidental DROP TABLE (backward incompatible)
5. **disallowed-unique-constraint** - UNIQUE constraint needs ACCESS EXCLUSIVE lock; use UNIQUE INDEX CONCURRENTLY instead
6. **prefer-bigint-over-int** - INT can hit 2.1B max; use BIGINT for future-proofing
7. **prefer-bigint-over-smallint** - SMALLINT can hit 32K max; use BIGINT
8. **prefer-identity** - IDENTITY columns over SERIAL (PG10+)
9. **prefer-text-field** - TEXT + CHECK constraint over VARCHAR(n) (changing VARCHAR length needs ACCESS EXCLUSIVE lock)
10. **prefer-timestamptz** - TIMESTAMPTZ over TIMESTAMP to avoid timezone bugs
11. **renaming-table** - Renaming tables breaks existing clients
12. **ban-create-domain-with-constraint** - Domain constraints need ACCESS EXCLUSIVE on dependent tables
13. **ban-alter-domain-with-add-constraint** - Same issue for ALTER DOMAIN
14. **ban-truncate-cascade** - TRUNCATE CASCADE silently truncates FK-dependent tables

### Squawk Output Formats
- **Tty** (colored terminal)
- **Gcc** (file:line:col style)
- **Json** (machine-readable)

### Squawk CLI Features
- `--assume-in-transaction` flag
- `--pg-version` flag for version-specific rules
- `--reporter` format selection
- `--exclude` rules
- `.squawk.toml` config file
- `--debug` mode (Lex/Parse/Ast output)
- `--list-rules` command
- VSCode extension + Language Server Protocol

### Squawk GitHub Action
- Separate `squawk-action` repo
- Posts comments on PRs via `upload-to-github` subcommand
- Uses environment variables for GH config

### What MigrationPilot Does Better Than Squawk
- More output formats (SARIF, markdown, JSON with schema versioning, execution plan)
- Auto-fix mode (Squawk has none)
- Framework detection (14 frameworks vs none)
- Watch mode + pre-commit hooks
- Execution plan with timeline visualization
- Risk scoring (RED/YELLOW/GREEN)
- Production context (table sizes, connection counts) -- paid
- Config file with severity overrides
- Inline disable comments
- Migration ordering validation
- Timing output
- Structured error messages
- Programmatic API

---

## 2. Stripe pg-schema-diff

**Repository**: [github.com/stripe/pg-schema-diff](https://github.com/stripe/pg-schema-diff)
**GitHub Stars**: ~795
**Language**: Go
**License**: MIT
**Pricing**: Free (open source)
**Status**: Active development

### Key Features
- **Declarative schema diffing** - compares current DB schema to desired state DDL files
- **Automatic migration generation** - generates SQL to get from A to B
- **Hazard detection system** - warns about dangerous operations
- **Concurrent index builds** - automatically uses CONCURRENTLY
- **Online index replacement** - builds new index before dropping old
- **Online constraint creation** - uses NOT VALID state
- **Online NOT NULL** - uses CHECK constraints pattern
- **Migration validation** - validates against temporary database before execution
- **Timeout management** - statement_timeout and lock_timeout per statement
- **JSON output** for plan command
- **PG 14-17 support**

### Hazard Types
- INDEX_DROPPED - queries may perform worse
- INDEX_BUILD - resource-intensive operation
- TABLE_DROPPED - data loss
- COLUMN_DROPPED - data loss
- And others for various lock-intensive operations

### What MigrationPilot Can Learn
- **Hazard allow-listing**: `--allow-hazards INDEX_BUILD` lets users explicitly accept risks
- **Temporary database validation**: Plans are validated against a temp DB before execution
- **Per-statement timeouts**: Each generated statement has its own timeout settings
- **Declarative approach**: Users describe desired end state, tool generates safe migration

### Key Difference
pg-schema-diff is a **migration generator**, not a linter. It competes in a different segment (declarative schema-as-code) but its hazard system is relevant to MigrationPilot's rule design.

---

## 3. pgroll (Xata)

**Repository**: [github.com/xataio/pgroll](https://github.com/xataio/pgroll)
**Website**: [pgroll.com](https://pgroll.com/docs)
**GitHub Stars**: ~6,300
**Language**: Go
**License**: Apache 2.0
**Pricing**: Free (open source), used internally by Xata
**Status**: Very active development, production use at Xata

### Key Features
- **Zero-downtime migrations** via expand/contract pattern
- **Multiple schema versions simultaneously** - old and new clients work at the same time
- **Automatic column backfilling**
- **Instant rollback** during active migrations
- **JSON-based migration definitions**
- **Validate command** - checks migration files before execution
- **PG 14-18 support** (actively benchmarked)
- **Single binary, no dependencies**

### What MigrationPilot Can Learn
- **Validate command**: pgroll validates migration files syntactically and checks that referenced objects exist in the target database
- **Multi-version schema approach**: The expand/contract pattern is worth documenting as a recommended practice
- **Migration format validation**: Checking that migration files conform to expected format
- **AI integration**: Designed to work with coding agents

### Key Difference
pgroll is a **migration executor** implementing expand/contract, not a static linter. It could be a complementary tool to MigrationPilot rather than a competitor.

---

## 4. Reshape (fabianlindfors)

**Repository**: [github.com/fabianlindfors/reshape](https://github.com/fabianlindfors/reshape)
**GitHub Stars**: ~1,800
**Language**: Rust
**License**: MIT
**Pricing**: Free (open source)
**Status**: Active development (209 commits)

### Key Features
- **Zero-downtime via views + triggers** - maintains old and new schemas
- **TOML/JSON migration format**
- **Multi-table migrations** - cross-table data restructuring
- **Index persistence through migrations** - clones indices to temp columns
- **Helper libraries** - Rust, Ruby/Rails, Python/Django, Go
- **`reshape docs` command** - designed for coding agents
- **PG 12+ support**

### What MigrationPilot Can Learn
- **Coding agent integration**: The `reshape docs` command for AI agents is innovative
- **Multi-table migration awareness**: Reshape handles cross-table dependencies
- **Application-level helpers**: Language-specific libraries for managing schema versions

### Key Difference
Reshape is another **migration executor**, not a linter. Complementary to MigrationPilot.

---

## 5. Atlas (Ariga)

**Repository**: [github.com/ariga/atlas](https://github.com/ariga/atlas)
**Website**: [atlasgo.io](https://atlasgo.io/)
**GitHub Stars**: ~8,100
**Language**: Go
**License**: Apache 2.0 (Community) / Atlas EULA (Pro)
**Pricing**: Free tier (limited), Pro tier (paid), Enterprise
**Status**: Very active, v1.1.0+ released, VC-backed

### Migration Analyzers (Lint Rules)

| Category | Check | MigrationPilot Equivalent | Gap? |
|----------|-------|--------------------------|------|
| Destructive (DS) | Drop schema | None | **GAP** |
| Destructive (DS) | Drop table | None | **GAP** |
| Destructive (DS) | Drop column | MP017 | Covered |
| Backward Compat (BC) | Rename table | None | **GAP** |
| Backward Compat (BC) | Rename column | MP010 | Covered |
| Data-Dependent (MF) | Add unique index on existing data | None | **GAP** |
| Data-Dependent (MF) | Modify nullable to non-nullable | MP002/MP018 | Covered |
| PostgreSQL (PG) | Non-concurrent index | MP001 | Covered |
| PostgreSQL (PG) | Table rewrite detection | MP007 partial | Partial |
| PostgreSQL (PG) | Constraint operations | MP005 | Covered |
| Naming (NM) | Naming convention enforcement | None | **GAP** |
| Nested Transactions | Nested BEGIN/COMMIT | MP008/MP025 | Covered |
| SQL Injection | Unsafe dynamic SQL | None | **GAP** |
| Custom Rules | Regex-based allow/deny (Pro) | None | **GAP** |

### Atlas Unique Features (2025-2026)
- **Atlas Copilot** - AI-powered assistant for migration authoring
- **PII Detection** - Automatic detection of personally identifiable information columns
- **Migration Hooks** - Pre/post-migration custom logic
- **Custom Schema Rules** - Regex-based allow/deny SQL statements (Pro)
- **Drift Detection** - Detects schema drift between environments
- **Deprecation Workflows** - Object deprecation tracking
- **pgvector support** - AI/ML column type awareness
- **PostgreSQL partition management** - Declarative partition support
- **Multi-project ER diagrams** - Schema visualization
- **SARIF output** (standard format)
- **Azure DevOps, GitHub Actions, GitLab CI integration**
- **Terraform provider**

### Atlas Pricing Model (Important Competitive Intel)
- **Community**: Apache 2.0, limited features
- **Starter (Free)**: Was included, but `atlas migrate lint` was **REMOVED from free tier in v0.38** (October 2025)
- **Pro**: Paid, includes linting + custom rules + PII detection
- **Enterprise**: Custom pricing

This is a major competitive opportunity: Atlas is **gating linting behind a paywall**. MigrationPilot keeping its core linting free is a significant differentiator.

---

## 6. Emerging Tools (2025-2026)

### pglinter (pmpetit/pglinter)
- **What**: PostgreSQL extension (not CLI) for database analysis
- **GitHub**: [github.com/pmpetit/pglinter](https://github.com/pmpetit/pglinter)
- **Language**: Rust (pgrx extension)
- **Stars**: New project
- **Key Features**: Rule-based DB analysis, SARIF output, PG 13-18 support, checks for unused/missing indexes, proper primary keys, FK indexing, security auditing
- **Difference**: Runs inside PostgreSQL as an extension, analyzes live database state not migration files
- **Relevance**: Its SARIF output and rule approach validates MigrationPilot's direction

### Bytebase
- **Website**: [bytebase.com](https://www.bytebase.com/)
- **What**: Full database DevOps platform (not just linting)
- **200+ SQL lint rules** across multiple databases
- **Pricing**: Open source core + commercial tiers
- **Relevance**: Validates market demand but targets enterprise platform buyers, not individual developers

### strong_migrations (Ruby/Rails)
- **Repository**: [github.com/ankane/strong_migrations](https://github.com/ankane/strong_migrations)
- **Stars**: ~4,000+
- **What**: Ruby gem for Rails ActiveRecord, catches unsafe migrations in development
- **Key insight**: Very popular in Rails ecosystem, validates that developers want this
- **Latest 2025 update**: Added check for change_column with check constraints

### safe-pg-migrations (Doctolib)
- **Repository**: [github.com/doctolib/safe-pg-migrations](https://github.com/doctolib/safe-pg-migrations)
- **What**: Ruby gem that automatically rewrites unsafe Rails migrations to safe versions
- **Key features**: Auto lock timeout (5s default), retry on lock failure (5x), concurrent index by default, verbose SQL logging
- **Relevance**: The auto-rewrite approach is similar to MigrationPilot's --fix mode

### Deliveroo migratelint
- **Repository**: [github.com/deliveroo/migratelint](https://github.com/deliveroo/migratelint)
- **What**: Python-based Postgres migration linter using pg_query
- **Rules**: Based on Braintree's "Safe Operations for High Volume PostgreSQL"
- **Relevance**: Validates the linting approach but limited feature set

### Database Lab Engine (DLE) by PostgresAI
- **What**: Provides thin database clones for CI migration testing
- **GitHub Action**: Available for testing migrations against realistic data
- **Relevance**: Complementary tool -- test migrations against clones, lint with MigrationPilot

---

## 7. PostgreSQL Version Features Affecting Migration Safety

### PostgreSQL 18 (Released February 2026)
- **NOT NULL with NOT VALID**: Can now add NOT NULL constraints without full table scan, then validate separately. This is a MAJOR migration safety improvement -- MigrationPilot should detect PG version and adjust MP002/MP018 advice accordingly
- **Virtual generated columns**: Default for generated columns; no storage overhead
- **Temporal constraints**: PRIMARY KEY, UNIQUE, FOREIGN KEY over ranges
- **Faster pg_upgrade**: --swap option, parallel checks, statistics preservation
- **Data checksums enabled by default** in initdb

### PostgreSQL 17 (Released October 2024)
- **Logical replication slot preservation** during pg_upgrade
- **Improved NOT NULL query planning** - optimizer skips redundant IS NOT NULL checks
- **pg_dump --filter** option for selective dumps
- **safe search_path for maintenance** - functions used by indexes/matviews must specify search_path

### PostgreSQL 16 (Released September 2023)
- **Logical replication from standbys**
- **pg_stat_io** for I/O statistics
- **Regular expression improvements**

### Implications for MigrationPilot
1. **PG version-aware rules**: Rules should adapt advice based on target PG version (like Squawk's `--pg-version`)
2. **PG 18 NOT NULL NOT VALID**: Update MP002/MP018 to recommend NOT VALID approach on PG18+
3. **PG 11+ default columns**: MP015 (volatile default) should note that PG 11+ doesn't require table rewrite for non-volatile defaults

---

## 8. What Developers Most Want (Community Research)

Based on HackerNews discussions, GitHub issues, Reddit threads, and blog posts:

### Most Requested Features
1. **Lock timeout + retry logic** - The #1 ask; every guide mentions it. MigrationPilot has MP004 + auto-fix.
2. **Concurrent index support** - Table stakes. MigrationPilot has MP001 + MP009 + auto-fix.
3. **Zero-downtime NOT NULL** - Very common pain point. MigrationPilot has MP002 + MP018.
4. **Foreign key NOT VALID pattern** - Frequently requested. MigrationPilot has MP005.
5. **Migration throttling/pausing** - Ability to limit IOPS during migration. No PostgreSQL tools do this well currently. **Opportunity**.
6. **Rollback planning** - Teams want to know how to reverse a migration. **GAP in all linters**.
7. **Multi-database synchronized migrations** - Hard problem, no good solutions exist.
8. **Estimated migration duration** - MigrationPilot's execution plan partially addresses this.
9. **CI integration with PR comments** - MigrationPilot has this.
10. **IDE integration** - Squawk has VSCode extension. **GAP for MigrationPilot**.

### Most Common Production Migration Failures
1. **Lock queue cascade** - DDL waiting for ACCESS EXCLUSIVE blocks all subsequent queries
2. **Missing CONCURRENTLY on index creation** - Locks entire table for writes
3. **NOT NULL without CHECK constraint pattern** - Full table scan + exclusive lock
4. **Long-running backfills without batching** - Resource exhaustion
5. **Foreign key validation without NOT VALID** - Full table scan
6. **Enum modifications in transactions** - PG error at runtime
7. **Column type changes** - Full table rewrite
8. **VACUUM FULL in production** - Extended exclusive lock
9. **Missing statement_timeout** - Runaway migrations consuming resources
10. **DROP CASCADE cascading further than expected** - Silent data loss

---

## 9. Comprehensive Gap Analysis: MigrationPilot vs. All Competitors

### Rules/Checks MigrationPilot is Missing

**HIGH PRIORITY (lock/safety critical):**

| Priority | Rule | Source | Description | Effort |
|----------|------|--------|-------------|--------|
| P0 | ban-drop-table | Squawk + Atlas | DROP TABLE is backward-incompatible + data loss | Small |
| P0 | disallowed-unique-constraint | Squawk | Adding UNIQUE constraint inline requires ACCESS EXCLUSIVE; use UNIQUE INDEX CONCURRENTLY instead | Medium |
| P0 | renaming-table | Squawk + Atlas | Renaming tables breaks existing clients | Small |
| P1 | prefer-text-field | Squawk | TEXT + CHECK over VARCHAR(n); changing VARCHAR length needs ACCESS EXCLUSIVE | Medium |
| P1 | ban-drop-not-null | Squawk | Dropping NOT NULL may break clients expecting non-null values | Small |
| P1 | add-unique-index-data-dependent | Atlas | Adding unique index may fail if duplicate data exists | Medium |

**MEDIUM PRIORITY (best practices):**

| Priority | Rule | Source | Description | Effort |
|----------|------|--------|-------------|--------|
| P2 | prefer-bigint-over-int | Squawk | INT max is 2.1B; use BIGINT for growing tables | Small |
| P2 | prefer-identity | Squawk | IDENTITY over SERIAL (PG10+) for better dependency management | Small |
| P2 | prefer-timestamptz | Squawk | TIMESTAMPTZ over TIMESTAMP to avoid timezone bugs | Small |
| P2 | ban-char-field | Squawk | CHAR(n) wastes space; use TEXT or VARCHAR | Small |
| P2 | ban-drop-database | Squawk | Prevent accidental DROP DATABASE | Small |
| P2 | ban-truncate-cascade | Squawk | TRUNCATE CASCADE silently truncates FK-dependent tables | Small |

**LOW PRIORITY (edge cases):**

| Priority | Rule | Source | Description | Effort |
|----------|------|--------|-------------|--------|
| P3 | ban-domain-constraints | Squawk | Domain constraints affect all dependent tables | Medium |
| P3 | naming-convention | Atlas | Enforce naming patterns on tables/columns/indexes | Large |
| P3 | sql-injection-detection | Atlas | Detect unsafe dynamic SQL in migration files | Large |
| P3 | drop-schema | Atlas | Prevent accidental DROP SCHEMA | Small |

### Feature Gaps

**HIGH PRIORITY:**

| Feature | Competitor | Description | Impact |
|---------|-----------|-------------|--------|
| PG version-aware rules | Squawk | `--pg-version` flag to adjust advice based on target PG version | High - affects rule accuracy for PG 11 defaults, PG 18 NOT NULL NOT VALID |
| VSCode extension / LSP | Squawk | Real-time linting in editor | High - developer experience |
| `--list-rules` command | Squawk | CLI command to list all available rules | Medium - discoverability |
| Hazard allow-listing | pg-schema-diff | `--allow-hazards TYPE` to explicitly accept specific risks | Medium - reduces false positive friction |
| Rollback SQL generation | Community ask | Generate SQL to reverse a migration | High - fills gap no competitor has |

**MEDIUM PRIORITY:**

| Feature | Competitor | Description | Impact |
|---------|-----------|-------------|--------|
| AI-assisted migration authoring | Atlas Copilot | Help write safe migrations | Medium - differentiator |
| PII column detection | Atlas Pro | Flag columns likely containing PII | Medium - compliance |
| Drift detection | Atlas | Detect schema differences between environments | Medium - enterprise |
| Terraform provider | Atlas | Infrastructure-as-code integration | Low - niche |
| GitLab CI integration | Atlas | GitLab MR comments | Medium - market expansion |

**LOW PRIORITY:**

| Feature | Competitor | Description | Impact |
|---------|-----------|-------------|--------|
| Declarative schema diffing | pg-schema-diff | Compare current vs desired schema | Low - different product segment |
| Multi-schema version support | pgroll/reshape | Expand/contract execution | Low - different product segment |
| Database extension analysis | pglinter | Analyze live DB for issues | Low - different approach |

---

## 10. Competitive Positioning Matrix

| Feature | MigrationPilot | Squawk | Atlas | pg-schema-diff | pgroll | Reshape |
|---------|---------------|--------|-------|----------------|--------|---------|
| **Static SQL linting** | 25 rules | 31 rules | ~15 rules | N/A (generator) | N/A (executor) | N/A (executor) |
| **GitHub Action** | Yes | Yes | Yes | No official | No | No |
| **SARIF output** | Yes | No | No | No | No | No |
| **JSON output** | Yes (versioned) | Yes | No | Yes | No | No |
| **Markdown output** | Yes | No | No | No | No | No |
| **Auto-fix** | 4 rules | No | No | N/A | N/A | N/A |
| **Framework detection** | 14 frameworks | No | No | No | No | No |
| **Watch mode** | Yes | No | No | No | No | No |
| **Pre-commit hooks** | Yes | No | No | No | No | No |
| **Execution plan** | Yes | No | No | Yes | No | No |
| **Risk scoring** | Yes | No | No | Hazards | No | No |
| **Production context** | Yes (paid) | No | No | Yes (requires DB) | Yes (requires DB) | Yes (requires DB) |
| **Config file** | .migrationpilotrc.yml | .squawk.toml | atlas.hcl | No | pgroll.yml | reshape.toml |
| **Inline disable** | Yes | No | No | No | No | No |
| **Severity overrides** | Yes | No | No | No | No | No |
| **Programmatic API** | Yes | No | No | Yes (Go lib) | Yes (Go lib) | No |
| **PG version awareness** | No | Yes | Yes | Yes (14-17) | Yes (14-18) | Yes (12+) |
| **VSCode extension** | No | Yes | No | No | No | No |
| **Pricing** | Open-core | Free | Free -> Paid (linting gated) | Free | Free | Free |
| **Language** | TypeScript | Rust | Go | Go | Go | Rust |

---

## 11. Actionable Recommendations (Prioritized)

### Immediate (This Sprint) - High Impact, Low Effort

1. **Add 6 missing P0 rules** (MP026-MP031):
   - MP026: ban-drop-table (backward-incompatible + data loss)
   - MP027: disallowed-unique-constraint (use UNIQUE INDEX CONCURRENTLY)
   - MP028: renaming-table (breaks existing clients)
   - MP029: ban-drop-not-null (breaks client assumptions)
   - MP030: prefer-text-field (TEXT + CHECK over VARCHAR(n))
   - MP031: add-unique-index-data-check (unique index on existing data may fail)

2. **Add `--pg-version` flag** - Version-aware rule advice:
   - PG <11: Warn about all column defaults (table rewrite)
   - PG 11+: Only warn about volatile defaults
   - PG 18+: Recommend NOT NULL NOT VALID approach
   - This is the #1 feature gap vs Squawk

3. **Add `--list-rules` command** - Simple discoverability feature

### Next Sprint - High Impact, Medium Effort

4. **Add 6 P2 best-practice rules** (MP032-MP037):
   - MP032: prefer-bigint-over-int
   - MP033: prefer-identity
   - MP034: prefer-timestamptz
   - MP035: ban-char-field
   - MP036: ban-drop-database
   - MP037: ban-truncate-cascade

5. **Rollback SQL generation** - No competitor has this:
   - For each DDL statement, generate the reverse statement
   - CREATE TABLE -> DROP TABLE IF EXISTS
   - ADD COLUMN -> DROP COLUMN
   - CREATE INDEX -> DROP INDEX
   - ADD CONSTRAINT -> DROP CONSTRAINT
   - This would be a unique differentiator

6. **Hazard allow-listing** (`--allow MP001,MP017`):
   - Let users accept specific violations without disabling rules globally
   - Similar to pg-schema-diff's `--allow-hazards`

### Future - Strategic Differentiators

7. **VSCode extension** - Real-time linting as developers write SQL
8. **GitLab CI integration** - MR comments for GitLab users
9. **AI migration assistant** - Generate safe migration SQL from natural language
10. **PII column detection** - Flag columns likely containing PII based on naming patterns

---

## 12. Market Opportunity Assessment

### Why MigrationPilot Can Win

1. **Squawk is stagnating**: Low activity, GPL license limits adoption, no auto-fix, no SARIF
2. **Atlas is paywall-gating linting**: v0.38 removed `atlas migrate lint` from free tier -- developers will seek alternatives
3. **No direct TypeScript/Node.js competitor**: The JS/TS ecosystem (the largest developer population) has no native migration linter
4. **MigrationPilot already has more features**: Auto-fix, framework detection, watch mode, SARIF, execution plan, risk scoring -- none of these exist in Squawk
5. **Open-core model is validated**: Atlas's model proves teams will pay for production context features

### Competitive Messaging

- vs. Squawk: "More rules, auto-fix, SARIF output, actively maintained, TypeScript-native"
- vs. Atlas: "Free forever for linting -- we don't gate safety behind a paywall"
- vs. pg-schema-diff: "Complementary: lint your handwritten migrations, then use pg-schema-diff for generation"
- vs. pgroll/reshape: "Different layer: we lint, they execute. Use both together"

### Target Users
1. **Individual developers** writing PostgreSQL migrations (free tier)
2. **DevOps/Platform teams** enforcing migration safety in CI (free tier + GitHub Action)
3. **Companies with large PostgreSQL deployments** needing production context (paid tier)
4. **Rails developers** migrating from strong_migrations to a language-agnostic tool
5. **Teams using Flyway/Liquibase/Alembic** wanting pre-deployment safety checks

---

## Sources

- [Squawk - GitHub](https://github.com/sbdchd/squawk)
- [Squawk Rules Overview](https://squawkhq.com/docs/rules)
- [Squawk CLI Documentation](https://squawkhq.com/docs/cli)
- [Squawk GitHub Action](https://github.com/sbdchd/squawk-action)
- [Stripe pg-schema-diff - GitHub](https://github.com/stripe/pg-schema-diff)
- [pgroll - GitHub](https://github.com/xataio/pgroll)
- [pgroll 5k stars announcement](https://xata.io/blog/pgroll-5k-stars-on-github)
- [Reshape - GitHub](https://github.com/fabianlindfors/reshape)
- [Atlas - GitHub](https://github.com/ariga/atlas)
- [Atlas Migration Analyzers](https://atlasgo.io/lint/analyzers)
- [Atlas GitHub Actions](https://atlasgo.io/integrations/github-actions)
- [Atlas Pricing](https://atlasgo.io/pricing)
- [Atlas v0.38 - PII Detection, Analyzers](https://atlasgo.io/blog/2025/10/28/v038-analyzers-pii-and-migration-hooks)
- [Atlas Copilot](https://atlasgo.io/blog/2025/05/12/v033-atlas-copilot)
- [pglinter - GitHub](https://github.com/pmpetit/pglinter)
- [strong_migrations - GitHub](https://github.com/ankane/strong_migrations)
- [safe-pg-migrations - GitHub](https://github.com/doctolib/safe-pg-migrations)
- [Deliveroo migratelint - GitHub](https://github.com/deliveroo/migratelint)
- [Bytebase SQL Review Rules](https://www.bytebase.com/docs/sql-review/review-rules/)
- [PostgreSQL 18 Release Notes](https://www.postgresql.org/docs/current/release-18.html)
- [PostgreSQL 17 Release Notes](https://www.postgresql.org/docs/17/release-17.html)
- [PostgreSQL 18 NOT NULL NOT VALID](https://neon.com/postgresql/postgresql-18/not-null-as-not-valid)
- [Zero-downtime Postgres migrations - lock_timeout and retries](https://postgres.ai/blog/20210923-zero-downtime-postgres-schema-migrations-lock-timeout-and-retries)
- [Top 7 PostgreSQL Migration Mistakes](https://www.techbuddies.io/2025/12/14/top-7-postgresql-migration-mistakes-developers-regret-later/)
- [Ask HN: What's wrong/right with Postgres migrations?](https://news.ycombinator.com/item?id=39627941)
- [Applying migrations safely - Squawk](https://squawkhq.com/docs/safe_migrations)
- [Running safe database migration using Postgres - Retool](https://retool.com/blog/running-safe-database-migrations-using-postgres)
- [PostgreSQL and the Lock Queue - Handshake](https://joinhandshake.com/blog/our-team/postgresql-and-lock-queue/)
- [Xata: Schema changes and the Postgres lock queue](https://xata.io/blog/migrations-and-exclusive-locks)
