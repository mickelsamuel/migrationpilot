# Mutation Testing: Test the Guardrail Itself

> **Experimental.** Operators, output and exit codes may change between minor versions.

`migrationpilot analyze` answers "is this migration safe?". `migrationpilot mutation-test` answers a different question:

**If this migration had been dangerous, would my config have caught it?**

That's not the same thing. A config that passes every migration you've ever written might be passing them because the migrations are good, or because the guardrail isn't looking. From the outside, a green build looks identical either way.

## How It Works

Point it at migrations that already pass. For each one it:

1. Analyses the file as-is, so it knows the baseline.
2. Rewrites individual statements into dangerous near-neighbours — the version someone writes at 6pm on a Friday. `CREATE INDEX CONCURRENTLY` loses its `CONCURRENTLY`. A `NOT VALID` foreign key becomes a validating one. The `SET lock_timeout` guard disappears.
3. Re-analyses every mutant through the same pipeline `analyze` uses, with **your** resolved config: your rule set, your severity overrides, your `failOn`.
4. Reports which mutants your config would have let through.

A mutant is **caught** when the mutation introduces at least one *new* violation that meets your `failOn` threshold. Comparing against the baseline matters — if a file already trips a rule, that pre-existing violation would otherwise mark every mutant as caught and hide the real holes.

Anything not caught is one of two things:

- **A hole.** Some rule would have reported it, but your config didn't fail the build. The report says which knob: a disabled rule, a downgraded severity, or a `failOn` that doesn't fail on warnings.
- **Not covered.** No built-in rule reports it at all. No config change fixes that, so these are listed separately and never affect the exit code.

## Usage

```bash
# A whole migrations directory
migrationpilot mutation-test ./migrations

# One file
migrationpilot mutation-test migrations/003_add_index.sql

# Non-standard layout
migrationpilot mutation-test ./db --pattern "V*.sql"

# For CI dashboards
migrationpilot mutation-test ./migrations --format json

# Report holes without failing the build
migrationpilot mutation-test ./migrations --no-fail-on-holes
```

### Options

| Flag | Default | What it does |
|---|---|---|
| `--pattern <glob>` | `**/*.sql` | Which files to pick up when the target is a directory |
| `--pg-version <n>` | config, else 17 | Target PostgreSQL version — some rules are version-gated |
| `--format <text\|json>` | `text` | Output format |
| `--fail-on-holes` | on | Exit 1 when your config would allow a dangerous mutant |
| `--no-fail-on-holes` | — | Report holes but always exit 0 |
| `--exclude <rules>` | — | Drop rules before the run, to see what excluding them costs you |
| `--license-key <key>` | — | Include Pro rules in the run |
| `--no-config` | — | Ignore the config file and run against defaults |

Exit codes: `0` clean (or `--no-fail-on-holes`), `1` holes found.

### Sample output

```
  ✗ MigrationPilot Mutation Test — experimental
  ──────────────────────────────
  9 files · 36 dangerous mutants · 77 rules · failOn: critical

  Your config would ALLOW:

  ⚠ [strip-not-valid-fk] in migrations/003_add_fk.sql:5
      the FK validates the whole table under ACCESS EXCLUSIVE and takes a lock on the referenced table too
      MP005 is disabled or excluded, so nothing reports this
      - …EFERENCES orders (id) DEFERRABLE INITIALLY DEFERRED NOT VALID
      + …EFERENCES orders (id) DEFERRABLE INITIALLY DEFERRED

  ⚠ [strip-concurrently-create-index] in migrations/001_add_indexes.sql:5
      the index build holds ACCESS EXCLUSIVE on the table, blocking every read and write until it finishes
      MP001 was downgraded to warning, below your failOn: critical
      - CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_id ON orders (customer_id)
      + CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders (customer_id)

  Guardrail caught 17/36 dangerous mutants.
  17 mutants slipped through your config (17 distinct holes)
```

## Reading the Results

The diagnosis on each hole tells you what to change:

| Reason | Meaning | Fix |
|---|---|---|
| `rule-disabled` | The rule that catches this is off, or excluded on the command line | Re-enable it, or accept the risk knowingly |
| `severity-downgraded` | The rule fired, but you overrode it to a severity below `failOn` | Restore the severity, or lower `failOn` |
| `fail-on-threshold` | The rule fired at its normal severity and `failOn` doesn't fail on it | `failOn: warning` closes most of these |
| `not-covered` | Nothing in the rule set reports this change | Nothing to configure — open an issue |

Holes repeat per file. Five `CREATE INDEX CONCURRENTLY` statements in one file give five mutants but one grouped hole in the text report; the JSON keeps them all.

## Operators

Twenty-three operators. Applicability is always driven by the parsed AST — an operator only fires when the parse tree proves the pattern is there. The rewrite is either rebuilt from AST fields (`ast`) or applied as an anchored text edit on the statement (`string`), which is what you want for things like dropping a `CONCURRENTLY` keyword: an AST round-trip would mean re-printing arbitrary expressions with no gain. Every string edit is verified — if the anchor doesn't match, the operator declines instead of producing a broken mutant.

| Operator | Mutation | Caught by | Transform |
|---|---|---|---|
| `strip-concurrently-create-index` | Turns CREATE INDEX CONCURRENTLY into a plain CREATE INDEX. | MP001 | string |
| `strip-concurrently-drop-index` | Turns DROP INDEX CONCURRENTLY into a plain DROP INDEX. | MP009 | string |
| `strip-concurrently-reindex` | Turns REINDEX ... CONCURRENTLY into a blocking REINDEX. | MP021 | string |
| `strip-concurrently-detach-partition` | Turns DETACH PARTITION CONCURRENTLY into a blocking detach. | MP046 | string |
| `strip-not-valid-check` | Turns ADD CONSTRAINT ... CHECK (...) NOT VALID into an immediately validated CHECK. | MP030 | string |
| `strip-not-valid-fk` | Turns ADD CONSTRAINT ... FOREIGN KEY ... NOT VALID into an immediately validated FK. | MP005 | string |
| `remove-lock-timeout` | Deletes the SET lock_timeout guard that precedes the DDL. | MP004 | ast |
| `remove-statement-timeout` | Deletes the SET statement_timeout guard that precedes the DDL. | MP020 | ast |
| `add-volatile-default` | Gives a newly added timestamp/date column a DEFAULT now(). | MP003 | string |
| `add-column-not-null` | Adds NOT NULL to a newly added column that has no default. | — | string |
| `add-drop-cascade` | Turns a restricted DROP into DROP ... CASCADE. | MP022 | string |
| `add-truncate-cascade` | Turns TRUNCATE into TRUNCATE ... CASCADE. | MP036 | string |
| `unique-constraint-drop-using-index` | Rewrites ADD CONSTRAINT ... UNIQUE USING INDEX into a direct UNIQUE (columns) constraint, using the columns of the referenced index. | MP027 | ast |
| `wrap-concurrently-in-transaction` | Puts an explicit transaction block around a CONCURRENTLY statement. | MP025 | ast |
| `strip-if-not-exists` | Removes IF NOT EXISTS from CREATE TABLE / CREATE INDEX. | MP023 | string |
| `narrow-bigint-to-int` | Changes a BIGINT primary or foreign key column in CREATE TABLE to INTEGER. | MP038 | string |
| `narrow-text-to-varchar` | Changes a TEXT column in CREATE TABLE or ADD COLUMN to VARCHAR(255). | MP037 | string |
| `strip-where-update` | Turns a filtered UPDATE into a full-table UPDATE. | MP011 | string |
| `strip-where-delete` | Turns a filtered DELETE into a full-table DELETE. | MP067 | string |
| `rename-instead-of-add-column` | Replaces an expand-style ADD COLUMN with the RENAME COLUMN shortcut. | MP010 | ast |
| `collapse-check-to-set-not-null` | Deletes the CHECK (col IS NOT NULL) NOT VALID and VALIDATE CONSTRAINT steps, leaving a bare SET NOT NULL. | MP002, MP018 | ast |
| `vacuum-to-vacuum-full` | Adds the FULL option to a plain VACUUM. | MP006 | string |
| `grant-select-to-grant-all` | Replaces a specific privilege list with ALL PRIVILEGES. | — | string |

The two operators with no rule in the "Caught by" column are there on purpose. `ADD COLUMN ... NOT NULL` with no default aborts on any non-empty table, and widening `GRANT SELECT` to `GRANT ALL` is a privilege escalation nobody reviews. No built-in rule reports either one, so they show up under "Not covered by any rule" on every config, strict or not. They're a gap in the rule set, not in your config, which is why they don't fail the build.

## What It Deliberately Doesn't Do

**Mutants that don't parse are dropped.** SQL PostgreSQL would reject can't reach production, so a mutant that fails to parse tells you nothing about your guardrail.

**Operators decline rather than guess.** `strip-where-update` skips any UPDATE with a second `WHERE` inside a subquery, because chopping at the first match would mangle the statement. `unique-constraint-drop-using-index` skips expression indexes, whose columns can't be recovered from the index definition. Fewer, correct mutants beat more, noisy ones.

**Operators check that the mutation is dangerous *here*.** Dropping `SET lock_timeout` only produces a mutant when a later statement actually takes a heavy lock; dropping `SET statement_timeout` only when something later can actually run long. Otherwise you'd get a wall of "holes" for changes that don't matter.

**A dirty baseline is called out, not silently handled.** If an input file already fails your config, the report says so. Fix the file first — the whole premise is mutating migrations that pass.

## In CI

```yaml
- name: Check migrations
  run: migrationpilot check ./migrations

- name: Check the guardrail
  run: migrationpilot mutation-test ./migrations
```

Two useful ways to run it: on every PR that touches `.migrationpilotrc.yml`, so loosening a rule has to be justified; or on a schedule, so config drift shows up before an incident does.
