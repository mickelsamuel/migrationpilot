/**
 * The facets each rule is filed under, and the prose that answers the questions
 * a rule page has to answer before it is useful: what fires it, what does not,
 * what the lock really does, and where the rule stops being able to tell.
 *
 * Every entry was derived by reading that rule's implementation in src/rules/
 * and its doc in docs/rules/. Where a rule matches on raw text rather than on
 * the parse tree, or only looks at earlier statements in the same file, the
 * prose says so — the boundary is the useful part, not the headline.
 *
 * Additive: nothing here changes what the engine does. It is how the catalogue
 * is described.
 */

/** What the statement acts on — the first question an engineer actually asks. */
export type RuleOperation =
  | 'table'
  | 'column'
  | 'index'
  | 'constraint'
  | 'partition'
  | 'type'
  | 'enum'
  | 'view'
  | 'sequence'
  | 'schema'
  | 'trigger'
  | 'privileges'
  | 'backfill'
  | 'transaction'
  | 'session'
  | 'extension';

export const operationOrder: RuleOperation[] = [
  'table', 'column', 'index', 'constraint', 'partition', 'type', 'enum', 'view',
  'sequence', 'schema', 'trigger', 'privileges', 'backfill', 'transaction',
  'session', 'extension',
];

export const operationLabels: Record<RuleOperation, string> = {
  table: 'Tables',
  column: 'Columns',
  index: 'Indexes',
  constraint: 'Constraints',
  partition: 'Partitions',
  type: 'Types and domains',
  enum: 'Enums',
  view: 'Views',
  sequence: 'Sequences',
  schema: 'Schemas',
  trigger: 'Triggers',
  privileges: 'Privileges and RLS',
  backfill: 'Backfills and DML',
  transaction: 'Transactions',
  session: 'Session settings',
  extension: 'Extensions',
};

/** What the operation does to a database that is serving traffic. */
export type RuleImpact =
  | 'blocks-reads'
  | 'blocks-writes'
  | 'table-rewrite'
  | 'full-scan'
  | 'queue-risk'
  | 'data-loss'
  | 'replication'
  | 'deploy-incompat';

export const impactOrder: RuleImpact[] = [
  'blocks-reads', 'blocks-writes', 'table-rewrite', 'full-scan', 'queue-risk',
  'data-loss', 'replication', 'deploy-incompat',
];

export const impactLabels: Record<RuleImpact, string> = {
  'blocks-reads': 'Blocks reads',
  'blocks-writes': 'Blocks writes',
  'table-rewrite': 'Rewrites the table',
  'full-scan': 'Scans every row',
  'queue-risk': 'Can stall the lock queue',
  'data-loss': 'Can lose data',
  replication: 'Breaks replication',
  'deploy-incompat': 'Breaks a rolling deploy',
};

/**
 * The heaviest lock the flagged operation takes, strongest first. `none` is not
 * "no lock at all" — it is "no table lock is the point of this rule", which is
 * true of every portability, correctness and bookkeeping rule in the set.
 */
export type RuleLock =
  | 'ACCESS EXCLUSIVE'
  | 'SHARE ROW EXCLUSIVE'
  | 'SHARE'
  | 'ROW EXCLUSIVE'
  | 'none';

export const lockOrder: RuleLock[] = [
  'ACCESS EXCLUSIVE', 'SHARE ROW EXCLUSIVE', 'SHARE', 'ROW EXCLUSIVE', 'none',
];

/** How much of the fix the tool can do for you. */
export type RuleRemediation = 'auto-fix' | 'multi-step' | 'manual' | 'informational';

export const remediationOrder: RuleRemediation[] = [
  'auto-fix', 'multi-step', 'manual', 'informational',
];

export const remediationLabels: Record<RuleRemediation, string> = {
  'auto-fix': 'Fixed by --fix',
  'multi-step': 'Multi-step plan',
  manual: 'Manual rewrite',
  informational: 'Informational',
};

export interface RuleFacets {
  operation: RuleOperation;
  impacts: RuleImpact[];
  lock: RuleLock;
  remediation: RuleRemediation;
  /** SQL a reader would search for to land on this rule. */
  triggerKeywords: string[];
  triggersOn: string;
  doesNotTriggerOn: string;
  lockDetail: string;
  assumptions: string;
  /** Set only where the rule genuinely depends on the server version. */
  pgMin?: number;
  pgMax?: number;
  /** Set only where the rule fires solely on one extension's objects. */
  extension?: string;
  applicabilityNote?: string;
  deployNote?: string;
}

export const facetsByRuleId: Record<string, RuleFacets> = {
  MP001: {
    operation: 'index',
    impacts: ['blocks-reads', 'blocks-writes', 'queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'auto-fix',
    triggerKeywords: ['CREATE INDEX', 'CREATE UNIQUE INDEX', 'CONCURRENTLY'],
    triggersOn:
      'Any `CREATE INDEX` or `CREATE UNIQUE INDEX` statement whose `concurrent` flag is not set — the rule matches the `IndexStmt` parse node and checks that one field.',
    doesNotTriggerOn:
      '`CREATE INDEX CONCURRENTLY`. The rule returns as soon as it sees the concurrent flag, so the table, the index type and the column list never enter into it.',
    lockDetail:
      'A plain index build holds ACCESS EXCLUSIVE on the table for the whole build, which conflicts with every other lock mode — readers and writers both wait.',
    assumptions:
      'The rule fires on every table regardless of size, so an index on a small or empty table is flagged the same as one on a large table. Without `--database-url` it has no way to tell them apart.',
  },
  MP002: {
    operation: 'column',
    impacts: ['blocks-reads', 'blocks-writes', 'full-scan'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'multi-step',
    triggerKeywords: ['SET NOT NULL', 'ALTER COLUMN', 'CHECK', 'NOT VALID', 'VALIDATE CONSTRAINT'],
    triggersOn:
      "Fires on the `AT_SetNotNull` subtype inside `AlterTableStmt.cmds` — a plain `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` — unless a matching CHECK constraint already covers the column.",
    doesNotTriggerOn:
      "Skips any `AlterTableStmt` with no commands, or commands that aren't `AT_SetNotNull`. On PG 12+ it also stands down if an earlier statement in the same file added a `CHECK` constraint whose serialized expression text contains the column name — a text match, not a check that the constraint was actually validated.",
    lockDetail:
      'ACCESS EXCLUSIVE blocks all reads and writes, and PostgreSQL holds it for as long as the full-table scan that verifies no existing NULLs takes — proportional to table size, not a fixed catalog-only cost.',
    assumptions:
      "The CHECK-constraint lookback only scans earlier statements in the same file for a constraint whose raw expression text contains the column name, so a CHECK added in an earlier migration file, or one phrased differently, won't be recognized and the rule still fires. It also assumes the table is big enough for a full scan to matter.",
    applicabilityNote:
      'PG 18+ replaces the CHECK-constraint workaround with a native `NOT NULL ... NOT VALID` constraint, validated the same way; the CHECK-based pattern is still what applies on PG 12–17, and the preceding-CHECK suppression only activates on PG 12+.',
    deployNote:
      'The CHECK → VALIDATE → SET NOT NULL → DROP CHECK sequence (or, on PG18+, NOT NULL NOT VALID → VALIDATE) needs each step run as its own statement — the first step must stay brief under ACCESS EXCLUSIVE, and the scan has to happen separately under the weaker SHARE UPDATE EXCLUSIVE lock.',
  },
  MP003: {
    operation: 'column',
    impacts: ['blocks-reads', 'blocks-writes', 'table-rewrite'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['ADD COLUMN', 'DEFAULT', 'gen_random_uuid()', 'random()', 'nextval()'],
    triggersOn:
      "Fires when an `AT_AddColumn` command's `DEFAULT` expression contains a call to a function PostgreSQL marks VOLATILE — `gen_random_uuid()`, `random()`, `clock_timestamp()`, `timeofday()`, `nextval()`, or a uuid-ossp generator — found by walking the parsed default expression tree rather than matching the rendered SQL text.",
    doesNotTriggerOn:
      "A `DEFAULT` that's a plain constant with no function call never fires on PostgreSQL 11+, since the missing-value fast path applies and no rewrite happens. It also returns immediately for any statement that isn't `AlterTableStmt`, has no commands, or has an `AT_AddColumn` with no `DEFAULT` clause at all.",
    lockDetail:
      "PostgreSQL can't store a per-row volatile value in `pg_attribute.attmissingval`, so it writes a fresh copy of the table and every index on it, holding ACCESS EXCLUSIVE for the whole rewrite — blocking all reads and writes and needing enough free disk for a second copy of the table.",
    assumptions:
      'The rule cannot tell whether the table is empty or has a billion rows — a volatile default on a brand-new, still-empty table is effectively instant, but gets flagged identically to one on a huge production table.',
    applicabilityNote:
      "On PostgreSQL versions before 11 there is no missing-value fast path at all, so the rule's separate `pgVersion < 11` branch flags any function-based default — even the normally-stable ones like `now()` — since neither kind can use `attmissingval` on that version.",
    deployNote:
      "The safe fix splits into three separate steps — add the column with no default, batch-backfill the value, then attach the default for future rows — and the doc notes the backfill batches have to run outside the migration's own transaction.",
  },
  MP004: {
    operation: 'session',
    impacts: ['queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'auto-fix',
    triggerKeywords: ['lock_timeout', 'SET lock_timeout', 'RESET lock_timeout'],
    triggersOn:
      'Fires on any DDL statement whose computed lock type is ACCESS EXCLUSIVE or SHARE when no preceding statement in the migration set `lock_timeout` — checked both via a `VariableSetStmt` named `lock_timeout` and, as a fallback, by searching the raw SQL text of earlier statements.',
    doesNotTriggerOn:
      "Skips statements that don't take ACCESS EXCLUSIVE or SHARE, `SET`/`RESET`/`SHOW`/transaction-control statements themselves (`VariableSetStmt`, `VariableShowStmt`, `TransactionStmt`), and plain `CREATE TABLE` — a new table has no contention to wait on. It also stands down once any earlier statement in the file already set `lock_timeout`.",
    lockDetail:
      "This rule isn't really about the lock the DDL takes — it's about what happens while it waits to get it: without `lock_timeout`, a blocked DDL statement queues indefinitely behind whatever holds the lock, and every later query on that table queues behind the DDL in turn.",
    assumptions:
      "The lock_timeout lookback only checks earlier statements in the same migration file — a `lock_timeout` set at the role or database level, or by a wrapper script before the migration runs, won't be seen, so the rule can flag a statement that's already covered outside the file it's analyzing.",
  },
  MP005: {
    operation: 'constraint',
    impacts: ['blocks-reads', 'blocks-writes', 'full-scan'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'auto-fix',
    triggerKeywords: ['ADD CONSTRAINT', 'FOREIGN KEY', 'REFERENCES', 'NOT VALID', 'VALIDATE CONSTRAINT'],
    triggersOn:
      'Fires on an `AT_AddConstraint` command whose `Constraint.contype` is `CONSTR_FOREIGN` and whose `skip_validation` flag is not set — `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ...` written without `NOT VALID`.',
    doesNotTriggerOn:
      '`skip_validation: true` — meaning the constraint was written with `NOT VALID` — makes it return immediately. Non-foreign-key constraints (`CHECK`, `UNIQUE`, `PRIMARY KEY`), `AlterTableStmt`s with no commands, and non-`AlterTableStmt` statements are skipped too.',
    lockDetail:
      'Adding the FK without NOT VALID makes PostgreSQL scan the whole table to verify every existing row while holding ACCESS EXCLUSIVE, blocking all reads and writes for however long that scan takes.',
    assumptions:
      "On a small or empty referencing table the validation scan is effectively instant, but the rule doesn't check row counts — a genuinely low-risk FK on a tiny table is flagged identically to one on a huge table.",
  },
  MP006: {
    operation: 'table',
    impacts: ['blocks-reads', 'blocks-writes', 'table-rewrite'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['VACUUM FULL', 'VACUUM', 'pg_repack'],
    triggersOn:
      "Fires on any `VacuumStmt` whose `options` array contains a `DefElem` named `full` — `VACUUM FULL`, with or without an explicit table list.",
    doesNotTriggerOn:
      'Plain `VACUUM` or `VACUUM (ANALYZE)` without the FULL option never matches — the rule only looks for the `full` `DefElem`. Non-`VacuumStmt` statements return immediately too.',
    lockDetail:
      'VACUUM FULL rewrites the table to a new file under ACCESS EXCLUSIVE for the entire operation, blocking every read and write until it finishes — the doc notes this can take hours on a large table.',
    assumptions:
      'The rule fires regardless of table size or actual bloat level, so a VACUUM FULL on a small or already-compact table is flagged the same as one on a huge bloated table where the lock genuinely matters.',
  },
  MP007: {
    operation: 'type',
    impacts: ['blocks-reads', 'blocks-writes', 'table-rewrite'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'multi-step',
    triggerKeywords: ['ALTER COLUMN TYPE', 'ALTER TABLE', 'TYPE'],
    triggersOn:
      'Fires on the `AT_AlterColumnType` subtype inside `AlterTableStmt.cmds` — any `ALTER TABLE ... ALTER COLUMN ... TYPE ...`.',
    doesNotTriggerOn:
      "Any `AlterTableStmt` whose commands don't include `AT_AlterColumnType` — plain `ADD COLUMN` or `DROP COLUMN` alterations, for instance — is skipped, as is any statement that isn't an `AlterTableStmt` at all.",
    lockDetail:
      "PostgreSQL rewrites the whole table to change a column's on-disk representation, holding ACCESS EXCLUSIVE for the entire rewrite — reads and writes are blocked until it completes, which on a large table can take hours.",
    assumptions:
      'The rule flags every `ALTER COLUMN TYPE` the same way regardless of table size, so a type change on a small or empty table — where the rewrite is effectively instant — is flagged identically to one on a table with a hundred million rows.',
    deployNote:
      'The expand-contract fix adds a new column, backfills it, syncs writes with a trigger, then swaps — the swap step means application code has to be pointed at the new column, so the full sequence spans more than one deploy.',
  },
  MP008: {
    operation: 'transaction',
    impacts: ['queue-risk'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['BEGIN', 'COMMIT', 'ROLLBACK', 'ALTER TABLE'],
    triggersOn:
      'Fires on the second (or later) DDL statement inside an open `BEGIN...COMMIT` block, once `isInsideTransaction` finds an enclosing `BEGIN` and `findPrecedingDDLInTransaction` finds an earlier DDL statement in that same block.',
    doesNotTriggerOn:
      "The first statement in a file (`statementIndex === 0`) never fires, since nothing precedes it. It also stands down for statements outside any transaction block, non-DDL statements (per `isDDL`), and the first DDL statement inside a transaction block — only the second and later ones are flagged.",
    lockDetail:
      "The rule doesn't check `ctx.lock` at all — it's about accumulation, not a specific lock mode. Whatever locks the individual DDL statements take are held until the transaction's final COMMIT, so the total blocked time is the sum of every statement's hold time rather than just the slowest one.",
    assumptions:
      "Transaction-boundary detection walks the parsed statement list for `BEGIN`/`COMMIT`/`ROLLBACK`, not comment text, so a comment merely mentioning BEGIN is correctly ignored — but a transaction opened implicitly by a migration framework outside the analyzed file won't be seen either.",
  },
  MP009: {
    operation: 'index',
    impacts: ['blocks-reads', 'blocks-writes'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'auto-fix',
    triggerKeywords: ['DROP INDEX', 'CONCURRENTLY', 'IF EXISTS'],
    triggersOn:
      'Fires on a `DropStmt` whose `removeType` is `OBJECT_INDEX` and whose `concurrent` flag is not set — `DROP INDEX` (optionally with `IF EXISTS`) written without `CONCURRENTLY`.',
    doesNotTriggerOn:
      '`DROP INDEX CONCURRENTLY` returns immediately once the concurrent flag is seen. Every other `DropStmt` variant — `DROP TABLE`, `DROP TYPE`, `DROP TRIGGER`, and so on — is skipped too, since only `OBJECT_INDEX` is checked.',
    lockDetail:
      'A plain `DROP INDEX` takes ACCESS EXCLUSIVE on the table for the duration of the drop, blocking all reads and writes; `CONCURRENTLY` avoids that with a multi-phase drop that only briefly locks the table.',
    assumptions:
      "The rule fires the same way whether the index is on a tiny lookup table or a busy hot table — it doesn't check size or query volume, so a drop that's genuinely low-risk is flagged identically to a dangerous one.",
  },
  MP010: {
    operation: 'column',
    impacts: ['deploy-incompat', 'blocks-reads', 'blocks-writes'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'multi-step',
    triggerKeywords: ['RENAME COLUMN', 'ALTER TABLE', 'RENAME TO'],
    triggersOn:
      'Fires on a `RenameStmt` whose `renameType` is `OBJECT_COLUMN` — any `ALTER TABLE ... RENAME COLUMN ... TO ...`.',
    doesNotTriggerOn:
      'Any other `RenameStmt` variant — renaming a table, index, constraint, or schema — is skipped, since only `OBJECT_COLUMN` is checked. Non-`RenameStmt` statements return immediately too.',
    lockDetail:
      'The rename itself is a fast catalog-only change under ACCESS EXCLUSIVE, so the lock window is brief — the real damage is instant and permanent: any query, view, or function still using the old column name starts erroring the moment the rename commits.',
    assumptions:
      "The rule can't see whether anything still references the old column name — it flags every column rename the same way, including one where every caller has already been migrated to the new name and the rename is genuinely safe.",
    deployNote:
      'The doc frames the safe fix as expand-contract across app releases: add the new column, backfill, update application code to read/write it, then drop the old column only once nothing references it — a multi-deploy sequence, not a single migration.',
  },
  MP011: {
    operation: 'backfill',
    impacts: ['blocks-writes', 'replication', 'queue-risk'],
    lock: 'ROW EXCLUSIVE',
    remediation: 'multi-step',
    triggerKeywords: ['UPDATE', 'SET', 'WHERE', 'LIMIT'],
    triggersOn:
      'Fires on any `UpdateStmt` with no `whereClause` at all — an `UPDATE table SET ...` with no filtering condition of any kind.',
    doesNotTriggerOn:
      "Any `UPDATE` that has a `WHERE` clause is skipped outright — the rule only checks whether `whereClause` is present, not what it contains, so a `WHERE` that matches effectively every row (`WHERE 1=1`, `WHERE id > 0`) still passes through unflagged.",
    lockDetail:
      "A full-table UPDATE takes ROW EXCLUSIVE, which doesn't block reads but does conflict with other writers touching the same rows; the bigger cost is the single long-running transaction — massive WAL generation, table bloat, and replication lag while it holds a lock and an open transaction ID for the entire duration.",
    assumptions:
      'The check is row-count agnostic: an `UPDATE` with no `WHERE` on a hundred-row table is flagged exactly the same as one on a hundred-million-row table, even though only the latter genuinely risks the WAL, bloat, and replication problems the rule describes.',
    deployNote:
      "The batched-loop replacement commits each batch separately with a short pause between them, rather than running as one long transaction — there's no application-code deploy involved, just breaking the single UPDATE into many small, independently-committed ones.",
  },
  MP012: {
    operation: 'enum',
    impacts: ['blocks-reads', 'blocks-writes'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'auto-fix',
    triggerKeywords: ['ALTER TYPE', 'ADD VALUE', 'BEGIN', 'COMMIT'],
    triggersOn:
      'Fires on any `AlterEnumStmt` (`ALTER TYPE ... ADD VALUE ...`) found inside a transaction block, as determined by walking backward for an enclosing `BEGIN`.',
    doesNotTriggerOn:
      'An `AlterEnumStmt` running outside any transaction block (in autocommit) never fires, on any PostgreSQL version — the rule only cares whether the statement sits inside `BEGIN...COMMIT`. Non-`AlterEnumStmt` statements are skipped too.',
    lockDetail:
      'On PG 12+, where this can actually run inside a transaction, PostgreSQL takes ACCESS EXCLUSIVE on the enum type for the duration — short, but enough to block concurrent queries referencing the type. On PG < 12 the statement never gets that far: it raises a runtime error and aborts the transaction instead.',
    assumptions:
      "The rule trusts `ctx.pgVersion` to reflect the target database's real major version; if that's misconfigured, a migration flagged as an instant PG-12+ lock concern could actually be one that hard-fails at deploy time on an older server, or the reverse.",
    applicabilityNote:
      'Behavior genuinely differs by version: before PG 12, `ADD VALUE` inside a transaction raises a runtime error and fails the migration outright; from PG 12 on it is allowed but still takes ACCESS EXCLUSIVE on the type for the statement.',
    deployNote:
      'The auto-fix only lifts the statement out of its `BEGIN`/`COMMIT` block when it is the first, last, or only statement in it — if other statements in that block must stay transactional, the migration needs restructuring into more than one step.',
  },
  MP013: {
    operation: 'table',
    impacts: ['queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['ALTER TABLE', 'CREATE INDEX', 'DROP INDEX', 'lock_timeout'],
    triggersOn:
      'Fires when production context includes `affectedQueries` for the target table, the statement is DDL with a lock stronger than ACCESS SHARE, and the summed `calls` across all affected queries meets the 10,000-call threshold.',
    doesNotTriggerOn:
      "Returns immediately with no `--database-url`-sourced `affectedQueries`, on non-DDL statements, on DDL that only takes ACCESS SHARE, and whenever the summed query-call count across affected queries is under the 10,000 threshold.",
    lockDetail:
      "The specific lock varies by statement — anything stronger than ACCESS SHARE qualifies — but the danger isn't the lock mode alone: even a brief lock causes a pile-up when thousands of queries per second are already hitting the table, since each one queues behind the DDL.",
    assumptions:
      "The 10,000-call threshold is a fixed constant applied to whatever window `pg_stat_statements` happens to cover, so it doesn't distinguish 10,000 calls over a minute from 10,000 over a week — and the rule is silent entirely without `--database-url` supplying `affectedQueries`.",
  },
  MP014: {
    operation: 'table',
    impacts: ['blocks-writes', 'queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['ALTER TABLE', 'ALTER COLUMN TYPE', 'CREATE INDEX', 'lock_timeout'],
    triggersOn:
      'Fires when production `tableStats` are available, `ctx.lock.longHeld` is true for the statement, and the table row count meets the 1,000,000-row threshold.',
    doesNotTriggerOn:
      "Returns immediately with no `--database-url`-sourced `tableStats`, on statements whose lock isn't flagged as long-held, and on tables under the 1,000,000-row threshold regardless of lock type.",
    lockDetail:
      'The exact lock mode comes from the underlying statement (ACCESS EXCLUSIVE for most flagged DDL); what the rule adds is that duration scales with table size, and whether it blocks reads too — not just writes — depends on `ctx.lock.blocksReads` for that lock.',
    assumptions:
      'The 1,000,000-row cutoff is a single fixed number with no notion of index count, row width, or disk type, so a 1M-row table of small integers and a 1M-row table of large JSONB blobs are treated identically even though their rewrite times differ enormously — and, like MP013, the rule says nothing without `--database-url`.',
  },
  MP015: {
    operation: 'column',
    impacts: ['table-rewrite'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['ADD COLUMN', 'SERIAL', 'BIGSERIAL', 'GENERATED ALWAYS AS IDENTITY'],
    triggersOn:
      'Fires on any `AT_AddColumn` command whose parsed `typeName.names` includes `serial`, `bigserial`, `smallserial`, or one of their `serialN` aliases (`serial2`/`serial4`/`serial8`) — checked against the type name list, not the raw SQL text.',
    doesNotTriggerOn:
      "Any `ADD COLUMN` using a plain type — `integer`, `bigint`, or an explicit `GENERATED ALWAYS AS IDENTITY` column — never matches, since none of those produce a SERIAL-family type name. `AlterTableStmt`s with no commands, and non-`AlterTableStmt` statements, are skipped too. The check itself carries no PostgreSQL-version gate; only the recommended fix text changes with `ctx.pgVersion`.",
    lockDetail:
      'SERIAL/BIGSERIAL implicitly creates a sequence and a DEFAULT tied to it; the risk the doc describes is the table rewrite that default can force, held under ACCESS EXCLUSIVE for however long the rewrite takes.',
    assumptions:
      'The rule flags SERIAL identically on every PostgreSQL version and every table size, even though the rewrite risk the doc describes is tied to older server versions — it has no way to check the real target version or row count from the static AST alone.',
    applicabilityNote:
      'The recommended fix differs by version: PG 10+ gets `GENERATED ALWAYS AS IDENTITY` as a drop-in replacement; earlier versions get a three-step manual sequence plus a `nextval()` default instead.',
  },
  MP016: {
    operation: 'index',
    impacts: ['blocks-writes', 'queue-risk'],
    lock: 'SHARE',
    remediation: 'manual',
    triggerKeywords: ['FOREIGN KEY', 'REFERENCES', 'CREATE INDEX', 'ADD CONSTRAINT'],
    triggersOn:
      'Fires on an `AT_AddConstraint` command whose `Constraint.contype` is `CONSTR_FOREIGN` and whose `fk_attrs` column list is non-empty, unless a `CREATE INDEX` statement elsewhere in the same migration targets the same table and covers every one of those FK columns.',
    doesNotTriggerOn:
      "Stands down as soon as it finds an `IndexStmt` anywhere in the migration — not only before this statement — on the same table whose indexed columns are a superset of the FK's columns. It also skips constraints with no `fk_attrs`, non-foreign-key constraints, and non-`AlterTableStmt` statements.",
    lockDetail:
      "This isn't the lock the `ADD CONSTRAINT` statement itself takes — it's the doc's description of the consequence: without an index, cascading UPDATEs or DELETEs force a sequential scan and the doc reports this as causing long-held SHARE locks on the parent table for however long that scan runs.",
    assumptions:
      "The index-coverage check only looks at statements inside the migration being analyzed — an index that already exists in the live database from an earlier migration won't be seen, so the rule can flag an FK that's already covered. It also can't tell whether the parent table is ever actually updated or deleted from, which is what would make the missing index matter.",
  },
  MP017: {
    operation: 'column',
    impacts: ['deploy-incompat', 'blocks-reads', 'blocks-writes'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['DROP COLUMN', 'ALTER TABLE', 'lock_timeout'],
    triggersOn:
      'Fires on an `AT_DropColumn` command inside `AlterTableStmt.cmds` — any `ALTER TABLE ... DROP COLUMN ...`.',
    doesNotTriggerOn:
      "Any `AlterTableStmt` whose commands don't include `AT_DropColumn` — `ADD COLUMN`, `ALTER COLUMN TYPE`, and so on — is skipped, as is any statement that isn't an `AlterTableStmt`.",
    lockDetail:
      "The catalog update itself is brief under ACCESS EXCLUSIVE, but any application code still selecting, inserting, or updating that column starts failing the instant it commits — that's the real hazard, not the lock duration.",
    assumptions:
      "The rule can't see whether application code has actually stopped referencing the column — it flags every DROP COLUMN identically, including one where a prior deploy already removed every reference and the drop is genuinely safe.",
    deployNote:
      'The safe sequence is two separate application deploys: one that removes every code reference to the column, then a later deploy that runs the DROP COLUMN — dropping it in the same deploy as the code change risks a window where old code instances still reference the now-dropped column.',
  },
  MP018: {
    operation: 'column',
    impacts: ['blocks-reads', 'blocks-writes', 'full-scan'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'multi-step',
    triggerKeywords: ['SET NOT NULL', 'ALTER COLUMN', 'CHECK', 'NOT VALID'],
    triggersOn:
      'Fires on an `AT_SetNotNull` command unless, on PG 12+, an earlier statement in the same migration added a CHECK constraint on that table whose raw SQL text contains both the column name and the phrase "is not null".',
    doesNotTriggerOn:
      "Skips `AlterTableStmt`s with no commands and commands that aren't `AT_SetNotNull`. On PG 12+ it also stands down when it finds a preceding `AT_AddConstraint`/`CONSTR_CHECK` command on the same table whose original SQL text case-insensitively matches both the column name and \"is not null\" — a raw-text check, not a semantic read of the constraint's expression.",
    lockDetail:
      'SET NOT NULL scans every row under ACCESS EXCLUSIVE to confirm none are NULL, so both the lock and the scan it performs are held for the same duration, which grows with table size.',
    assumptions:
      "The preceding-CHECK detection is a text search for the column name plus the literal phrase \"is not null\" in an earlier statement's raw SQL — a constraint expressing the same rule with different wording (a function call, a CASE expression, different phrasing) won't be recognized, so the rule can still fire even though a validated CHECK already exists.",
    applicabilityNote:
      'PG 18+ gets a native `NOT NULL ... NOT VALID` constraint instead of the CHECK-constraint workaround; the preceding-CHECK suppression itself only activates on PG 12+, and below PG 12 the rule falls back to a plain lock_timeout-guarded SET NOT NULL since there is no NOT VALID mechanism for NOT NULL at all pre-12.',
    deployNote:
      'Same choreography as MP002: the CHECK/NOT NULL, VALIDATE, and final SET NOT NULL steps need to run as separate statements so the exclusive lock stays brief and the scan happens under the weaker SHARE UPDATE EXCLUSIVE lock.',
  },
  MP019: {
    operation: 'table',
    impacts: ['blocks-reads', 'blocks-writes', 'queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['ALTER TABLE', 'CREATE INDEX', 'DROP', 'RENAME'],
    triggersOn:
      'Fires when production context includes `activeConnections` at or above the 20-connection threshold and the statement’s computed lock type is exactly ACCESS EXCLUSIVE — covering `AlterTableStmt`, `IndexStmt`, `DropStmt`, and `RenameStmt`.',
    doesNotTriggerOn:
      'Returns immediately when `activeConnections` was never supplied or is under the 20-connection threshold, when the lock type isn’t ACCESS EXCLUSIVE, and on plain `CreateStmt` (`CREATE TABLE`) — a brand-new table has no existing connections referencing it.',
    lockDetail:
      "ACCESS EXCLUSIVE blocks every reader and writer; with many active connections already open, each one queues behind the lock the instant it's acquired, so a lock that's a non-issue with five connections becomes a cascading pile-up with fifty.",
    assumptions:
      "The 20-connection threshold is a single fixed number, not scaled to the database's configured `max_connections` or the table's actual traffic pattern — twenty idle connections and twenty mid-query connections are treated the same, and the rule has nothing to say without `--database-url` supplying `activeConnections`.",
  },
  MP020: {
    operation: 'session',
    impacts: ['queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'auto-fix',
    triggerKeywords: ['SET statement_timeout', 'CREATE INDEX', 'REINDEX', 'VACUUM FULL', 'CLUSTER', 'VALIDATE CONSTRAINT'],
    triggersOn:
      'Fires when `isLongRunningCandidate` matches: VACUUM (FULL), any `ClusterStmt`, any `ReindexStmt`, a non-concurrent `CREATE INDEX`, or the `AT_ValidateConstraint`, `AT_SetNotNull`, or `AT_AlterColumnType` subcommand of `ALTER TABLE` — and no earlier statement in the file already sets `statement_timeout`.',
    doesNotTriggerOn:
      'Statements not classified as long-running (for example `CREATE INDEX CONCURRENTLY`, a plain `ADD COLUMN`) never reach the check, and the rule returns as soon as it finds `statement_timeout` — as a `VariableSetStmt` or just the raw substring — in any earlier statement in the file, even one unrelated to this operation.',
    lockDetail:
      'Lock type depends on the underlying statement: ACCESS EXCLUSIVE for CLUSTER, VACUUM FULL, non-concurrent CREATE INDEX, and column type changes or SET NOT NULL; SHARE or ACCESS EXCLUSIVE for REINDEX. Without a timeout, a stalled operation holds that lock indefinitely instead of failing fast, queuing everything behind it.',
    assumptions:
      'Detection is purely textual: it looks for the string `statement_timeout` anywhere in an earlier statement in the file, so it cannot confirm the timeout actually applies before this statement runs or is set to a sane value; an unrelated `SET statement_timeout` earlier in the file is enough to silence the warning.',
  },
  MP021: {
    operation: 'index',
    impacts: ['blocks-reads', 'blocks-writes', 'queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'auto-fix',
    triggerKeywords: ['REINDEX', 'REINDEX TABLE', 'REINDEX INDEX', 'CONCURRENTLY', 'REINDEX SCHEMA'],
    triggersOn:
      'Fires on any `ReindexStmt` (REINDEX TABLE/INDEX/SCHEMA/DATABASE) once `ctx.pgVersion` is 12 or higher, as long as it is not `REINDEX_OBJECT_SYSTEM` and does not already carry the `concurrently` DefElem in its params.',
    doesNotTriggerOn:
      'Non-`ReindexStmt` nodes are skipped outright. It also returns null when `ctx.pgVersion` is below 12 (CONCURRENTLY did not exist yet), when the target is `REINDEX SYSTEM` (which PostgreSQL will not run CONCURRENTLY), and when the statement already sets `concurrently`.',
    lockDetail:
      'REINDEX TABLE holds ACCESS EXCLUSIVE on the whole table for the rebuild; REINDEX INDEX holds SHARE, which still blocks writes. Either way the block lasts as long as the index build takes, scaling with table size.',
    assumptions:
      'The rule fires on syntax and PostgreSQL version alone, with no size or traffic signal, so a REINDEX on a tiny or idle table is flagged the same as one on a huge, hot one.',
    pgMin: 12,
    applicabilityNote:
      'REINDEX CONCURRENTLY requires PostgreSQL 12 or later; on older versions the rule does not fire at all since there is no safe CONCURRENTLY form to suggest.',
    deployNote:
      'REINDEX CONCURRENTLY carries the same restriction as CREATE INDEX CONCURRENTLY (see MP025): it cannot run inside a transaction block, so it needs to be the only statement in its deploy step rather than batched with other DDL.',
  },
  MP022: {
    operation: 'table',
    impacts: ['data-loss', 'deploy-incompat'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['DROP CASCADE', 'DROP TABLE CASCADE', 'CASCADE', 'DROP TYPE CASCADE'],
    triggersOn:
      'Fires on any `DropStmt` whose `behavior` is `DROP_CASCADE` — the check does not branch on `removeType`, so it covers `DROP TABLE/TYPE/VIEW/... CASCADE` uniformly.',
    doesNotTriggerOn:
      'A `DROP` without the CASCADE keyword returns null immediately, since the rule only compares `drop.behavior` against `DROP_CASCADE`; the default (RESTRICT-like) drop behavior never reaches the message.',
    lockDetail:
      'The rule does not evaluate lock behavior at all. Its concern is that CASCADE removes every dependent object — views, foreign keys, policies, triggers — in one statement, with nothing in the migration file listing what is about to go.',
    assumptions:
      'It cannot tell a deliberate, well-understood CASCADE (say, dropping a genuinely orphaned staging table) from an accidental one — it flags `DROP_CASCADE` every time, regardless of what actually depends on the object.',
  },
  MP023: {
    operation: 'table',
    impacts: [],
    lock: 'none',
    remediation: 'auto-fix',
    triggerKeywords: ['CREATE TABLE', 'CREATE INDEX', 'IF NOT EXISTS', 'CREATE UNIQUE INDEX'],
    triggersOn:
      'Fires on a `CreateStmt` (CREATE TABLE) with `if_not_exists` unset on a non-temp table, or an `IndexStmt` (CREATE INDEX, including UNIQUE and CONCURRENTLY variants) with `if_not_exists` unset.',
    doesNotTriggerOn:
      'Temporary tables (`CREATE TEMP TABLE`) are skipped outright since they are ephemeral and do not need idempotency, and any `CREATE TABLE`/`CREATE INDEX` that already sets `IF NOT EXISTS` returns null immediately.',
    lockDetail:
      'No lock concern here — this is about migration idempotency. Re-running a `CREATE TABLE`/`CREATE INDEX` that already succeeded fails with a plain SQL error, not a locking problem.',
    assumptions:
      'Assumes idempotent migrations are always wanted; some teams deliberately want a hard failure on re-run as a guard against applying the same migration twice, in which case this warning does not apply.',
  },
  MP024: {
    operation: 'enum',
    impacts: ['data-loss'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['DROP TYPE', 'ALTER TYPE', 'ADD VALUE', 'ENUM'],
    triggersOn:
      'Fires on any `DropStmt` whose `removeType` is `OBJECT_TYPE` — that is, any `DROP TYPE` statement.',
    doesNotTriggerOn:
      'Any statement that is not a `DropStmt`, or a `DropStmt` targeting something other than `OBJECT_TYPE` (tables, indexes, views, and so on), returns null immediately.',
    lockDetail:
      'The DROP TYPE statement itself is not characterized by a lock in this check — PostgreSQL simply refuses to drop a type still referenced by a column. ACCESS EXCLUSIVE only enters the picture in the safe alternative, at the `ALTER COLUMN ... TYPE` step that migrates each table to the recreated type.',
    assumptions:
      'The check only tests whether `removeType` equals `OBJECT_TYPE` — it does not confirm the dropped type is actually an enum, so `DROP TYPE` on a composite type or domain triggers the same enum-recreation guidance, which does not really apply there.',
  },
  MP025: {
    operation: 'transaction',
    impacts: [],
    lock: 'none',
    remediation: 'auto-fix',
    triggerKeywords: ['CONCURRENTLY', 'BEGIN', 'COMMIT', 'CREATE INDEX CONCURRENTLY', 'REINDEX CONCURRENTLY', 'DROP INDEX CONCURRENTLY'],
    triggersOn:
      'Fires when `checkConcurrent` finds `concurrent: true` on an `IndexStmt` or `DropStmt`, or a `concurrently` DefElem on a `ReindexStmt` params list, and `isInsideTransaction(ctx)` reports the statement sits inside a BEGIN/COMMIT block in the migration file.',
    doesNotTriggerOn:
      'Any CREATE INDEX, DROP INDEX, or REINDEX that is not CONCURRENTLY never reaches the transaction check. A CONCURRENTLY statement that is not inside a BEGIN/COMMIT block — the normal case for a standalone migration statement — also returns null.',
    lockDetail:
      'Not a lock issue: CONCURRENTLY operations manage their own multi-step internal locking, which is exactly why PostgreSQL refuses to run them inside a caller-supplied transaction block and raises a hard runtime ERROR instead.',
    assumptions:
      'Transaction detection relies on `isInsideTransaction(ctx)`, meaning the BEGIN/COMMIT structure visible in the migration file text. If a migration runner wraps every file in an implicit transaction that never appears as SQL, the rule cannot see that and would miss it.',
    deployNote:
      'CONCURRENTLY statements must run outside any BEGIN/COMMIT block in the migration file. The auto-fix lifts the statement out of its surrounding transaction only when it is the first, last, or only statement in that block — anything more tangled needs a manual split into a separate deploy step.',
  },
  MP026: {
    operation: 'table',
    impacts: ['data-loss'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['DROP TABLE', 'DROP TABLE CASCADE', 'DROP TABLE IF EXISTS'],
    triggersOn:
      'Fires on any `DropStmt` whose `removeType` is `OBJECT_TABLE` — that is, `DROP TABLE`, with or without CASCADE.',
    doesNotTriggerOn:
      'Any DROP statement that is not a `DropStmt`, or one that does not target `OBJECT_TABLE` (DROP INDEX, DROP TYPE, DROP VIEW, and so on), returns null before the message is built.',
    lockDetail:
      'DROP TABLE takes ACCESS EXCLUSIVE for the duration of the drop. On a normal table this is typically fast, metadata-level work — the real danger is not lock duration, it is that the drop is instant and unrecoverable without a backup.',
    assumptions:
      'Fires on every DROP TABLE unconditionally, including drops of genuinely obsolete or empty tables in a controlled cleanup migration — it has no way to distinguish those from an accidental drop of a live table.',
  },
  MP027: {
    operation: 'constraint',
    impacts: ['blocks-reads', 'blocks-writes', 'full-scan', 'queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'multi-step',
    triggerKeywords: ['ADD CONSTRAINT', 'UNIQUE', 'ALTER TABLE ADD CONSTRAINT', 'USING INDEX', 'CREATE UNIQUE INDEX CONCURRENTLY'],
    triggersOn:
      'Fires on the `AT_AddConstraint` subcommand of `ALTER TABLE` when the constraint `contype` is `CONSTR_UNIQUE` and it has no `indexname` set — a UNIQUE constraint being built from scratch rather than attached to a pre-built index.',
    doesNotTriggerOn:
      'Non-`ALTER TABLE` statements and `ALTER TABLE` statements with no `cmds` are skipped, as are `ADD CONSTRAINT` commands whose type is not `CONSTR_UNIQUE`. It also skips a UNIQUE constraint that already references a pre-built index via USING INDEX, since `indexname` is set on that constraint.',
    lockDetail:
      'ADD CONSTRAINT UNIQUE holds ACCESS EXCLUSIVE for as long as the implicit unique index build takes, blocking every read and write on the table for the whole scan — the same cost as a non-concurrent CREATE INDEX, just less visible in the SQL.',
    assumptions:
      'Assumes the table holds enough rows for the scan to matter; on a small or newly created table, ADD CONSTRAINT UNIQUE is effectively instant and the two-step CONCURRENTLY workaround is unneeded overhead.',
    deployNote:
      'The safe fix is two statements that cannot share a transaction: CREATE UNIQUE INDEX CONCURRENTLY, then ADD CONSTRAINT ... USING INDEX. They need to ship as separate deploy steps rather than one migration file run atomically.',
  },
  MP028: {
    operation: 'table',
    impacts: ['deploy-incompat'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['RENAME TABLE', 'ALTER TABLE RENAME TO', 'RENAME TO'],
    triggersOn:
      'Fires on a `RenameStmt` whose `renameType` is `OBJECT_TABLE` — that is, `ALTER TABLE ... RENAME TO ...`.',
    doesNotTriggerOn:
      'Any RENAME that targets something other than the table itself — a column, index, constraint, or sequence rename — carries a different `renameType` and returns null.',
    lockDetail:
      'ACCESS EXCLUSIVE is held only briefly for the catalog rename. The danger is not lock duration — it is that every query, view, function, and foreign key referencing the old name breaks the instant the rename commits, with no fallback.',
    assumptions:
      'Assumes application code, views, or functions actually reference the table by its old name; a table not yet referenced anywhere, such as one added and renamed within the same release, can be renamed safely despite the warning.',
  },
  MP029: {
    operation: 'column',
    impacts: ['deploy-incompat'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['DROP NOT NULL', 'ALTER COLUMN DROP NOT NULL'],
    triggersOn:
      'Fires on the `AT_DropNotNull` subcommand of `ALTER TABLE` — that is, `ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL`.',
    doesNotTriggerOn:
      'Non-`ALTER TABLE` statements and any `ALTER TABLE` whose commands do not include an `AT_DropNotNull` subcommand — SET NOT NULL, ADD COLUMN, DROP COLUMN, and so on — pass through untouched.',
    lockDetail:
      'DROP NOT NULL is a fast, catalog-only change under a brief ACCESS EXCLUSIVE lock. This rule is not about lock duration — it is about the column silently starting to accept NULLs after the migration runs.',
    assumptions:
      'Assumes downstream code actually depends on the column being non-null; if the constraint was overly strict to begin with, or nothing reads that column yet, dropping NOT NULL is safe despite the warning.',
  },
  MP030: {
    operation: 'constraint',
    impacts: ['blocks-reads', 'blocks-writes', 'full-scan', 'queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'auto-fix',
    triggerKeywords: ['ADD CONSTRAINT', 'CHECK', 'NOT VALID', 'VALIDATE CONSTRAINT'],
    triggersOn:
      'Fires on the `AT_AddConstraint` subcommand of `ALTER TABLE` when the constraint `contype` is `CONSTR_CHECK` and `skip_validation` (NOT VALID) is not set.',
    doesNotTriggerOn:
      'Skips anything that is not an `ADD CONSTRAINT` of type `CONSTR_CHECK`, and skips a CHECK constraint that already has NOT VALID set, since `skip_validation` being true is exactly the safe form.',
    lockDetail:
      'ADD CONSTRAINT CHECK without NOT VALID holds ACCESS EXCLUSIVE for the full validation scan across every existing row, blocking all reads and writes until it finishes, proportional to table size.',
    assumptions:
      'Assumes the table already holds rows worth scanning; on an empty or newly created table the validation is instant either way, so the NOT VALID split does not save much.',
  },
  MP031: {
    operation: 'constraint',
    impacts: ['blocks-reads', 'blocks-writes', 'full-scan', 'queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['ADD CONSTRAINT', 'EXCLUDE', 'EXCLUSION', 'USING GIST'],
    triggersOn:
      'Fires on the `AT_AddConstraint` subcommand of `ALTER TABLE` when the constraint `contype` is `CONSTR_EXCLUSION` — that is, `ADD CONSTRAINT ... EXCLUDE USING ...`.',
    doesNotTriggerOn:
      'Skips anything that is not an `ADD CONSTRAINT` of type `CONSTR_EXCLUSION` — UNIQUE, CHECK, FOREIGN KEY, and PRIMARY KEY constraints are handled by other rules and never reach this check.',
    lockDetail:
      'The GiST index build and the row scan happen together under one ACCESS EXCLUSIVE lock. There is no NOT VALID escape hatch for exclusion constraints, so the whole table is blocked for reads and writes until both finish.',
    assumptions:
      'Assumes the table is large enough for the scan and index build to take meaningful time; on a small table this is effectively instant, and the rule cannot tell the difference since it fires on syntax alone.',
  },
  MP032: {
    operation: 'table',
    impacts: ['blocks-reads', 'blocks-writes', 'table-rewrite', 'queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['CLUSTER', 'CLUSTER ON'],
    triggersOn:
      'Fires on any `ClusterStmt` — every CLUSTER statement, with or without an explicit USING index target.',
    doesNotTriggerOn:
      'Only non-`ClusterStmt` statements are skipped. There are no further conditions: every CLUSTER statement is flagged.',
    lockDetail:
      'CLUSTER rewrites the physical storage of the table in index order, holding ACCESS EXCLUSIVE for the entire rewrite — every reader and writer is blocked until the last row is copied and the old storage is swapped in.',
    assumptions:
      'Assumes the table is large enough that the rewrite duration matters; on a small table CLUSTER finishes almost instantly, and the rule has no size signal to distinguish that case.',
  },
  MP033: {
    operation: 'view',
    impacts: ['blocks-reads'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'auto-fix',
    triggerKeywords: ['REFRESH MATERIALIZED VIEW', 'CONCURRENTLY', 'MATERIALIZED VIEW'],
    triggersOn:
      'Fires on a `RefreshMatViewStmt` where `concurrent` is not set and `skipData` (WITH NO DATA) is not set — a plain REFRESH that actually recomputes data.',
    doesNotTriggerOn:
      'REFRESH MATERIALIZED VIEW CONCURRENTLY returns null immediately since it is already safe, and so does REFRESH MATERIALIZED VIEW ... WITH NO DATA, which just marks the view unscannable rather than locking for a real refresh.',
    lockDetail:
      'A plain REFRESH holds ACCESS EXCLUSIVE on the materialized view for the whole query that recomputes it, blocking every SELECT against the view until it commits. CONCURRENTLY avoids this by building into a new copy and swapping.',
    assumptions:
      'REFRESH CONCURRENTLY requires a UNIQUE index on the materialized view; a matview without one cannot switch to CONCURRENTLY, even though the rule does not check for that prerequisite before suggesting the fix.',
  },
  MP034: {
    operation: 'schema',
    impacts: ['data-loss'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['DROP DATABASE', 'DROP DATABASE IF EXISTS'],
    triggersOn:
      'Fires on any `DropdbStmt` — every DROP DATABASE statement, unconditionally.',
    doesNotTriggerOn:
      'Only non-`DropdbStmt` nodes are skipped; there is no other condition, so a DROP DATABASE statement is always flagged regardless of `missing_ok` or the database name.',
    lockDetail:
      'The rule does not characterize this by lock behavior. DROP DATABASE sits outside the normal table-locking model (PostgreSQL simply refuses if other sessions are connected to that database). The real risk is that there is no undo.',
    assumptions:
      'Assumes any DROP DATABASE in a migration file is a mistake, which holds for essentially all application migrations; it cannot distinguish that from a deliberate administrative script that happens to be checked in alongside migrations.',
  },
  MP035: {
    operation: 'schema',
    impacts: ['data-loss'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['DROP SCHEMA', 'DROP SCHEMA CASCADE'],
    triggersOn:
      'Fires on any `DropStmt` whose `removeType` is `OBJECT_SCHEMA` — that is, `DROP SCHEMA`, with or without CASCADE.',
    doesNotTriggerOn:
      'Any DROP that is not a `DropStmt`, or one whose `removeType` is not `OBJECT_SCHEMA` (DROP TABLE, DROP TYPE, and so on), returns null. Unlike MP022, this rule fires regardless of whether CASCADE is present.',
    lockDetail:
      'DROP SCHEMA takes ACCESS EXCLUSIVE, but as a catalog-level operation the lock itself is typically brief. The real cost is that CASCADE can take every object in the schema with it, unrecoverable without a backup.',
    assumptions:
      'Fires on every DROP SCHEMA regardless of whether the schema is actually empty or already deprecated; it cannot inspect the real contents, so a safe cleanup of a genuinely empty schema is flagged the same as a destructive one.',
  },
  MP036: {
    operation: 'table',
    impacts: ['data-loss'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['TRUNCATE', 'TRUNCATE CASCADE', 'CASCADE'],
    triggersOn:
      'Fires on a `TruncateStmt` whose `behavior` is `DROP_CASCADE` — that is, `TRUNCATE ... CASCADE`.',
    doesNotTriggerOn:
      'A plain TRUNCATE without CASCADE returns null — only the `DROP_CASCADE` behavior is flagged, so truncating a table with no dependent foreign keys never triggers this rule.',
    lockDetail:
      'The rule does not evaluate lock behavior. Its concern is the CASCADE fan-out: every table with a foreign key pointing at the truncated table gets emptied too, recursively, with nothing in the statement listing which tables that includes.',
    assumptions:
      'Assumes the foreign-key graph is wide enough that CASCADE reaches unintended tables; on a target with no incoming foreign keys, TRUNCATE CASCADE behaves identically to a plain TRUNCATE and the warning does not really apply.',
  },
  MP037: {
    operation: 'column',
    impacts: [],
    lock: 'none',
    remediation: 'auto-fix',
    triggerKeywords: ['VARCHAR', 'CHARACTER VARYING', 'TEXT'],
    triggersOn:
      'Fires when a `ColumnDef` type name is `varchar` or `character varying`, checked across every column in a `CreateStmt` `tableElts` list and every `AT_AddColumn` command in an `AlterTableStmt`.',
    doesNotTriggerOn:
      'Non-VARCHAR column types pass straight through. For ALTER TABLE, only `AT_AddColumn` commands are inspected — ALTER COLUMN TYPE, DROP COLUMN, and other subcommands are ignored, so an existing VARCHAR column being altered some other way is not flagged by this rule.',
    lockDetail:
      'No lock concern — TEXT and VARCHAR(n) use identical storage in PostgreSQL, so this is a schema-design preference, not a locking or performance issue.',
    assumptions:
      'Assumes future length changes are likely; if the maximum length is genuinely fixed forever, such as a two-letter country code, VARCHAR(n) documents that intent and the future-rewrite concern never materializes.',
  },
  MP038: {
    operation: 'column',
    impacts: [],
    lock: 'none',
    remediation: 'auto-fix',
    triggerKeywords: ['INT', 'INTEGER', 'BIGINT', 'PRIMARY KEY', 'FOREIGN KEY', 'SERIAL'],
    triggersOn:
      'Fires on a `CreateStmt` column whose `ColumnDef` carries a `CONSTR_PRIMARY` or `CONSTR_FOREIGN` constraint and whose type name is `int2`, `int4`, `integer`, or `smallint`.',
    doesNotTriggerOn:
      'Only `CreateStmt` is checked — `ALTER TABLE ADD COLUMN` or `ALTER COLUMN TYPE` on an existing table never trigger it. Temp tables are skipped, and a column is only flagged when it carries a PRIMARY KEY or FOREIGN KEY constraint and its type is smallint/integer — a plain INT column with no key constraint passes through untouched.',
    lockDetail:
      'No lock concern for the flagged statement — this is a brand-new CREATE TABLE, so there is no existing data to rewrite yet. The ACCESS EXCLUSIVE table rewrite only happens later, if the table grows past the range of INT and has to be migrated to BIGINT after the fact.',
    assumptions:
      'Assumes the table will grow large enough to approach 2.1 billion rows; for genuinely small or bounded tables, such as lookup tables, INT is fine forever and the extra 4 bytes per row from BIGINT is pure waste.',
  },
  MP039: {
    operation: 'column',
    impacts: ['deploy-incompat'],
    lock: 'none',
    remediation: 'auto-fix',
    pgMin: 10,
    triggerKeywords: ['CREATE TABLE', 'SERIAL', 'BIGSERIAL', 'SMALLSERIAL', 'GENERATED AS IDENTITY'],
    triggersOn:
      'A `CreateStmt` whose `tableElts` hold a `ColumnDef` whose `typeName.names[].String.sval` is one of `serial`, `bigserial`, `smallserial`, `serial2`, `serial4`, `serial8`. The comparison is against the exact lowered type name in the parse tree, not the SQL text. The loop returns on the first match, so a `CREATE TABLE` with four SERIAL columns reports one violation.',
    doesNotTriggerOn:
      'Anything under `ctx.pgVersion < 10` — that guard returns null before the statement is even inspected. Any node that is not a `CreateStmt`: `ALTER TABLE ... ADD COLUMN id SERIAL` parses as `AlterTableStmt` and is MP015 territory, and `CREATE TABLE ... AS SELECT` parses as `CreateTableAsStmt`. A `CreateStmt` with no `tableElts` (a `CREATE TABLE c PARTITION OF p ...` child) returns null. `GENERATED ALWAYS AS IDENTITY` carries the underlying type name (`int8`, `int4`), so it never matches.',
    lockDetail:
      'No table lock is in play. `CREATE TABLE` takes ACCESS EXCLUSIVE on a relation nobody can reference yet, so nothing queues behind it. What the rule is really about is the object SERIAL creates on the side: an implicit sequence with its own owner and its own GRANTs, which `DROP COLUMN` does not remove and which a role holding INSERT on the table may still be unable to call `nextval` on.',
    assumptions:
      'The rule sees only the literal type name written in this statement. A column typed through a domain that wraps `serial`, or inherited via `LIKE other_table INCLUDING DEFAULTS`, is invisible to it. It cannot tell a deliberate SERIAL — one whose sequence grants are managed on purpose — from an accidental one. And because it returns on the first SERIAL column, the violation count understates how much of the table is affected.',
  },
  MP040: {
    operation: 'column',
    impacts: ['data-loss'],
    lock: 'none',
    remediation: 'auto-fix',
    triggerKeywords: ['CREATE TABLE', 'ADD COLUMN', 'TIMESTAMP', 'TIMESTAMPTZ', 'WITHOUT TIME ZONE'],
    triggersOn:
      'Two node shapes feed the same helper. A `CreateStmt`, over every `tableElts[].ColumnDef`; and an `AlterTableStmt` whose `cmds[].AlterTableCmd.subtype` is `AT_AddColumn`, over `def.ColumnDef`. The test is `typeName.names[].String.sval` containing `timestamp` and not containing `timestamptz`. Precision survives: `TIMESTAMP(3)` still parses to `[pg_catalog, timestamp]` and fires.',
    doesNotTriggerOn:
      '`TIMESTAMPTZ` and `TIMESTAMP WITH TIME ZONE`, both of which the parser lowers to `timestamptz`. `ALTER TABLE ... ALTER COLUMN ... TYPE timestamp` — only the `AT_AddColumn` subtype is read, so converting an existing column the wrong way is not caught. `date`, `time`, `interval`. `CREATE TABLE AS` and `SELECT INTO`, which are not `CreateStmt`. In the `CreateStmt` path a missing `tableElts` returns null for the whole check.',
    lockDetail:
      'Nothing about locking. On `CREATE TABLE` the relation is new; on `ADD COLUMN` a bare type declaration with no default is a catalog-only change on PG 11+. The rule is a correctness rule about what the value means: `timestamp` stores a wall-clock reading with no zone attached, so the instant it referred to cannot be recovered once the server, the session `TimeZone`, or the writer moves.',
    assumptions:
      'It flags every `timestamp` column, including the cases where wall-clock time is the right model — a recurring local appointment, a business calendar date-time, a legally fixed local deadline. It has no way to ask what the column means. It also returns on the first offending column, so a table with six `TIMESTAMP` columns yields one violation, and it never inspects `ALTER COLUMN ... TYPE`, so a migration that converts `timestamptz` back down to `timestamp` passes clean.',
  },
  MP041: {
    operation: 'column',
    impacts: ['data-loss'],
    lock: 'none',
    remediation: 'auto-fix',
    triggerKeywords: ['CREATE TABLE', 'ADD COLUMN', 'CHAR', 'CHARACTER', 'BPCHAR'],
    triggersOn:
      'The same two entry points as MP040 — `CreateStmt.tableElts[].ColumnDef`, and `AlterTableStmt` commands with subtype `AT_AddColumn`. A column matches when `typeName.names[].String.sval` contains `bpchar` or `char` and does not contain `varying`. `CHAR(2)` and `CHARACTER(2)` both lower to `[pg_catalog, bpchar]`.',
    doesNotTriggerOn:
      '`VARCHAR(n)` and `CHARACTER VARYING(n)`, which lower to `[pg_catalog, varchar]` and so fail the `bpchar`/`char` test outright — MP037 owns those. `TEXT`. Any statement that is not a `CreateStmt` or an `ADD COLUMN`. Note that the `!typeNames.some(n => n === "varying")` guard is vestigial: the parser never emits `varying` as a name component, so that clause never changes the outcome.',
    lockDetail:
      'No lock consequence. This is a storage and comparison-semantics rule. `bpchar` blank-pads every value out to the declared width and strips trailing blanks again on comparison and on cast, so a value whose trailing whitespace was meaningful does not come back the way it went in, and `LIKE` against a padded value behaves differently from `=`.',
    assumptions:
      'The type name `char` on its own is PostgreSQL internal `"char"` — a one-byte type that is not `bpchar` and does not blank-pad — and the rule flags it anyway, because it matches the name list. That is a false positive the fixer cannot even act on, since `fixMP041` only rewrites `CHAR(n)` / `CHARACTER(n)` forms with an explicit width. As with MP040, it returns on the first matching column, and a domain built over `char(n)` is invisible.',
  },
  MP042: {
    operation: 'index',
    impacts: ['deploy-incompat'],
    lock: 'none',
    remediation: 'auto-fix',
    triggerKeywords: ['CREATE INDEX', 'CREATE UNIQUE INDEX', 'DROP INDEX', 'REINDEX'],
    triggersOn:
      'An `IndexStmt` whose `idxname` is absent or empty. That is the entire condition — the rule reads `relation.relname` only to build the message. It fires the same way on `CONCURRENTLY`, on `UNIQUE`, on any `accessMethod`, and on partial or expression indexes.',
    doesNotTriggerOn:
      'Any `IndexStmt` that carries an `idxname`, which includes every `CREATE INDEX IF NOT EXISTS ...` form since the grammar requires a name there. `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE` and `ADD PRIMARY KEY` build an index but parse as a `Constraint` inside `AlterTableStmt`, never as an `IndexStmt`, so they are outside the rule. Inline `UNIQUE` in `CREATE TABLE` likewise.',
    lockDetail:
      'Naming does not change the lock. A plain `CREATE INDEX` takes SHARE on the table and a `CONCURRENTLY` one takes SHARE UPDATE EXCLUSIVE, and this rule is indifferent to which — MP001 is the rule that cares. What the missing name costs you is later: `DROP INDEX`, `REINDEX`, `ALTER TABLE ... ADD CONSTRAINT ... USING INDEX` and `pg_stat_user_indexes` all need a name you can write down.',
    assumptions:
      'The rule cannot know whether the name PostgreSQL would generate is already taken, so it cannot distinguish a harmless auto-name from one that will collide and get a numeric suffix. It also cannot verify that the name the fixer writes matches what the server would have chosen for anything but a plain column list — `fixMP042` deliberately skips expression indexes, because PostgreSQL names those `<table>_expr_idx` with a collision counter that is not derivable from the file.',
  },
  MP043: {
    operation: 'constraint',
    impacts: ['full-scan', 'blocks-writes'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['CREATE DOMAIN', 'ALTER DOMAIN', 'ADD CONSTRAINT', 'CHECK', 'VALUE'],
    triggersOn:
      'Two branches. First, a `CreateDomainStmt` whose `constraints[].Constraint.contype` is `CONSTR_CHECK`. Second, an `AlterDomainStmt` whose `subtype` is the single character `C`, which is what the grammar uses for ADD CONSTRAINT — `AlterDomainStmt.subtype` is a bare char, not one of the `AT_*` enum names `AlterTableCmd` carries, and libpg-query passes it through as written. Both branches were probed against the bundled parser. Adding a `NOT NULL` constraint to a domain goes through the same `C` path and is flagged too, since it validates existing values the same way.',
    doesNotTriggerOn:
      '`ALTER DOMAIN ... ADD CONSTRAINT ... NOT VALID`, which arrives as `C` with `skip_validation: true` — nothing is scanned until a later `VALIDATE CONSTRAINT`, and that form is what this rule recommends. `CREATE DOMAIN` carrying only `NOT NULL` (`CONSTR_NOTNULL`) or only a `DEFAULT`, since neither is `CONSTR_CHECK`. `ALTER DOMAIN ... SET DEFAULT` / `DROP DEFAULT` (`subtype "T"`), `DROP CONSTRAINT` (`X`), and `SET NOT NULL` / `DROP NOT NULL` (`O` / `N`) — none of them validate existing values. Ordinary table-level `CHECK` constraints, which are MP030.',
    lockDetail:
      '`ALTER DOMAIN ... ADD CONSTRAINT` takes ACCESS EXCLUSIVE on every table that has a column of that domain and validates the predicate against all of them, so a domain used by twenty tables produces twenty simultaneous blocking full scans. `CREATE DOMAIN` is the cheaper half of the rule: it touches no table and takes no table lock, and is flagged because it fixes the constraint every future column of that domain inherits, and because changing it later is the expensive statement above.',
    assumptions:
      'With no catalog access the rule cannot know how many columns use the domain, so it cannot distinguish a brand-new domain nothing references from one wired through half the schema — and it warns identically either way. Nothing in the code reads `ctx.cluster`, `ctx.tableStats`, or any other production field, so `--database-url` does not change its behaviour. Earlier releases read `subtype "T"` as ADD CONSTRAINT, which inverted the rule into a false positive on default changes and a false negative on the scan it is named for; the trigger set above is the corrected one.',
  },
  MP044: {
    operation: 'column',
    impacts: ['data-loss', 'table-rewrite', 'blocks-reads', 'blocks-writes'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'multi-step',
    triggerKeywords: ['ALTER TABLE', 'ALTER COLUMN', 'TYPE', 'INTEGER', 'SMALLINT', 'REAL'],
    triggersOn:
      'An `AlterTableStmt` with a command of subtype `AT_AlterColumnType` whose `def.ColumnDef.typeName.names[].String.sval` includes any of `int2`, `smallint`, `int4`, `integer`, `float4`, `real`. In practice only `int2`, `int4` and `float4` ever match, because the parser normalises the spelled-out names — `TYPE integer` arrives as `[pg_catalog, int4]`. The remaining three entries in the list are reachable only through a user-defined type that happens to be named `integer`, `smallint` or `real`.',
    doesNotTriggerOn:
      'Every narrowing that is not to one of those six names: `TEXT` to `VARCHAR(50)`, `NUMERIC(20,4)` to `NUMERIC(5,2)`, `TIMESTAMP(6)` to `TIMESTAMP(0)`, `BIGINT` to `NUMERIC`. All are genuine data-loss narrowings and all pass clean, even though the doc uses `TEXT` to `VARCHAR(50)` as its own example. Also any `ALTER TABLE` without an `AT_AlterColumnType` command, and any `AT_AlterColumnType` whose `def.ColumnDef.typeName.names` is missing.',
    lockDetail:
      '`ALTER COLUMN ... TYPE` holds ACCESS EXCLUSIVE for the whole operation and rewrites every row of the table plus every index on it, so reads and writes are blocked for the full rewrite, not momentarily. Any query already running keeps the DDL waiting, and everything that arrives behind the DDL queues behind it too.',
    assumptions:
      'The rule knows the destination type and nothing else. It cannot see the source type, so `SMALLINT` widened to `INTEGER` — safe, no possible overflow — is flagged exactly like `BIGINT` narrowed to `INTEGER`. It cannot see the data either: it has no idea whether any row exceeds the new range, and it never reads `ctx.tableStats` or any other production field, so passing `--database-url` does not sharpen it. The `SELECT COUNT(*)` pre-flight it suggests is something the operator has to run.',
    deployNote:
      'There is no single-statement safe form, which is why the fixer classifies this `plan-only` rather than mechanical. The documented path is the MP007 expand-contract: prove no row overflows, add the narrower column, dual-write, backfill in batches, swap reads, then drop — spanning at least two deploys because the application has to be reading the new column before the old one goes.',
  },
  MP045: {
    operation: 'table',
    impacts: ['replication'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['CREATE TABLE', 'PRIMARY KEY', 'REPLICA IDENTITY', 'IDENTITY'],
    triggersOn:
      'A `CreateStmt` that survives three guards — `relation.relpersistence` is not `t`, `inhRelations` is empty or absent, and `tableElts` is present — and in which no element carries a primary key. Both placements are checked: a column-level `ColumnDef.constraints[].Constraint.contype === "CONSTR_PRIMARY"`, and a table-level `Constraint.contype === "CONSTR_PRIMARY"`.',
    doesNotTriggerOn:
      'Temporary tables, via the `relpersistence === "t"` check. Anything with a non-empty `inhRelations`, which covers both legacy `INHERITS (parent)` and declarative `CREATE TABLE c PARTITION OF p ...` — verified, the partition child form does populate `inhRelations`. `CREATE TABLE AS` and `SELECT INTO`, which are different node types. A `CreateStmt` with no `tableElts` at all.',
    lockDetail:
      'No lock story. The table does not exist until this statement runs, so its ACCESS EXCLUSIVE lock has no one to block. The rule is about the row-identity consequence: with no primary key the default `REPLICA IDENTITY` has nothing to point at, so logical replication cannot ship `UPDATE` or `DELETE` for the table, and `UPDATE`/`DELETE` against duplicate rows is ambiguous.',
    assumptions:
      'There is no lookahead of any kind. `CREATE TABLE t (...); ALTER TABLE t ADD PRIMARY KEY (id);` in the same file still produces a violation, because the rule only ever looks at the one statement it was handed. `UNLOGGED` tables are not exempted — only `relpersistence === "t"` is — so scratch and staging tables get flagged. A `UNIQUE NOT NULL` column, which can serve as `REPLICA IDENTITY USING INDEX`, is not accepted as a substitute. And a table built with `LIKE parent INCLUDING ALL` is flagged, because a `TableLikeClause` element is neither a `ColumnDef` nor a `Constraint` and the rule sees no key in it.',
  },
  MP046: {
    operation: 'partition',
    impacts: ['blocks-reads', 'blocks-writes', 'queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'auto-fix',
    pgMin: 14,
    triggerKeywords: ['ALTER TABLE', 'DETACH PARTITION', 'CONCURRENTLY', 'PARTITION BY'],
    triggersOn:
      'An `AlterTableStmt` command whose subtype is `AT_DetachPartition` and whose `def.PartitionCmd.concurrent` is falsy. `CONCURRENTLY` shows up in the tree as `concurrent: true` on the `PartitionCmd`, which is what the rule tests — it does not scan the SQL text for the keyword.',
    doesNotTriggerOn:
      'Anything below the `ctx.pgVersion < 14` gate, since `DETACH PARTITION CONCURRENTLY` did not exist before then and the rule would be recommending invalid syntax. `DETACH PARTITION ... CONCURRENTLY` itself. `DETACH PARTITION ... FINALIZE`, which parses to the separate subtype `AT_DetachPartitionFinalize` and is never matched — verified against the bundled parser, so the completion half of a two-phase detach does not get flagged. `ATTACH PARTITION`, which is `AT_AttachPartition`.',
    lockDetail:
      'A plain `DETACH PARTITION` takes ACCESS EXCLUSIVE on the partitioned parent and holds it for the whole operation, which blocks every read and every write against every partition, not just the one being detached. Because ACCESS EXCLUSIVE conflicts with the ACCESS SHARE that a plain `SELECT` takes, one long-running query in front of it parks the DDL and then everything else parks behind the DDL. The `CONCURRENTLY` form splits the work so the parent is only locked briefly at each end.',
    assumptions:
      'The rule cannot tell how long the detach will take or how busy the parent is — it never reads `ctx.tableStats`, `ctx.activeConnections`, or `ctx.tableFacts` — so a detach on an idle table at 3am is reported the same as one at peak. It also cannot see whether the migration runner will wrap the file in a transaction, which is what decides whether the fixed statement is even legal.',
    deployNote:
      '`DETACH PARTITION CONCURRENTLY` cannot run inside a transaction block, so applying the fix under a runner that wraps each migration file in `BEGIN`/`COMMIT` will make the statement fail outright. The concurrent detach also has to be able to reach a point where no transaction still sees the partition attached, and it leaves the partition in a pending state that a follow-up `FINALIZE` closes if the session is interrupted.',
  },
  MP047: {
    operation: 'table',
    impacts: ['table-rewrite', 'blocks-reads', 'blocks-writes', 'data-loss'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['ALTER TABLE', 'SET LOGGED', 'SET UNLOGGED', 'UNLOGGED'],
    triggersOn:
      'An `AlterTableStmt` with a command whose subtype is `AT_SetLogged` or `AT_SetUnLogged`. That is the whole test — no other field is read, and the direction is used only to pick the wording and to append the crash-loss sentence for the UNLOGGED case.',
    doesNotTriggerOn:
      '`CREATE UNLOGGED TABLE`, which is a `CreateStmt` with `relpersistence: "u"` and never reaches this rule — creating a table unlogged is free, it is the conversion that is expensive. Any `ALTER TABLE` whose commands are all some other subtype. Temporary tables, which cannot be set logged in the first place.',
    lockDetail:
      'Both directions rewrite the entire heap under ACCESS EXCLUSIVE, held for the whole rewrite. LOGGED to UNLOGGED has to write out a fresh unlogged copy; UNLOGGED to LOGGED has to write the whole table through WAL, which on a large table is both the slowest direction and the one that can fill an archive. Reads and writes are blocked throughout, and peak disk is roughly double the table size while both copies exist.',
    assumptions:
      'The rule has no idea how big the table is — it never touches `ctx.tableStats` — so a ten-row lookup table and a two-terabyte fact table produce the identical critical violation. It also cannot know the intent: converting a freshly loaded staging table to LOGGED before it is exposed is a normal and safe pattern, and the rule flags it the same as flipping a live table. The `data-loss` impact applies to the UNLOGGED direction only: unlogged contents do not survive a crash or an unclean restart.',
  },
  MP048: {
    operation: 'column',
    impacts: ['deploy-incompat'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['ALTER COLUMN', 'SET DEFAULT', 'NOW()', 'GEN_RANDOM_UUID', 'NEXTVAL'],
    triggersOn:
      'An `AlterTableStmt` command with subtype `AT_ColumnDefault` whose `def` contains a real call to one of `now`, `random`, `gen_random_uuid`, `uuid_generate_v4`, `clock_timestamp`, `statement_timestamp`, `timeofday`, `txid_current`, `nextval`, or the keyword spellings `CURRENT_TIMESTAMP`, `CURRENT_DATE`, `CURRENT_TIME`, `LOCALTIMESTAMP`, `LOCALTIME`. Detection walks the parsed expression for a `FuncCall` — matching the last element of `funcname`, so a schema-qualified `pg_catalog.gen_random_uuid()` counts — or a `SQLValueFunction`, which is how the keyword forms arrive. The walk reaches nested calls, so `now() + interval \'7 days\'` is caught. It shares its tree walk with MP003.',
    doesNotTriggerOn:
      '`ALTER COLUMN ... DROP DEFAULT`, which is also `AT_ColumnDefault` but arrives with no `def` at all. Constant defaults, including string literals that merely contain one of those names: `SET DEFAULT \'nowhere\'` is an `A_Const` and is not flagged, and neither is a bare column reference named `now`. `CURRENT_USER` and the other non-temporal `SQLValueFunction` ops. `ADD COLUMN ... DEFAULT now()`, which is `AT_AddColumn` and belongs to MP003 and MP015. Any non-`AlterTableStmt` node.',
    lockDetail:
      'This is not a lock rule. `ALTER COLUMN ... SET DEFAULT` takes ACCESS EXCLUSIVE, but only momentarily: it writes one catalog row, touches no heap page, and rewrites nothing. What the rule is really about is a semantic gap — the default applies to future `INSERT`s only, so the existing rows the author assumed would be filled stay exactly as they were.',
    assumptions:
      'The list of names is fixed, so a user-defined volatile function with an unrelated name passes silently — there is no catalog lookup to ask PostgreSQL what a function\'s volatility actually is. The rule also cannot tell whether a backfill is wanted: setting a default purely for rows written from here on is a legitimate thing to do, and gets flagged anyway. Earlier releases decided this by searching the serialised parse node for substrings, which reported `SET DEFAULT \'nowhere\'` as a volatile default because the literal contains `now`; walking the tree for actual call nodes is what removed that.',
  },
  MP049: {
    operation: 'partition',
    impacts: ['deploy-incompat'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['CREATE TABLE', 'PARTITION BY', 'PRIMARY KEY', 'PARTITION BY HASH', 'PARTITION BY RANGE'],
    triggersOn:
      'A `CreateStmt` that has a non-empty `partspec.partParams`, has `tableElts`, declares a primary key somewhere in those elements, and whose partition key columns are not all present in that key. Partition keys come from `partParams[].PartitionElem.name`; primary key columns come from column-level `CONSTR_PRIMARY` constraints (contributing that column name) and table-level `Constraint.keys[].String.sval`. The comparison is a plain case-sensitive `Array.includes` between the two name lists.',
    doesNotTriggerOn:
      'Non-partitioned `CREATE TABLE`, which has no `partspec`. A partitioned table with no primary key at all — the `hasPK` flag stays false and the rule stands down, leaving that case to MP045. A partition key made entirely of expressions, for example `PARTITION BY RANGE ((a + b))`, because a `PartitionElem` holding an `expr` has no `name` and gets filtered out, emptying the key list. `ALTER TABLE ... ADD PRIMARY KEY` on an existing partitioned table, which is not a `CreateStmt`.',
    lockDetail:
      'There is nothing to lock. This is a hard-error rule: PostgreSQL rejects the statement at parse-analysis time with "unique constraint on partitioned table must include all partitioning columns", so the migration fails on the spot rather than doing damage. The value of catching it statically is that it fails in CI instead of mid-deploy.',
    assumptions:
      'Only the primary key is checked. PostgreSQL applies the identical requirement to every `UNIQUE` constraint on a partitioned table, and `whyItMatters` even says so, but `CONSTR_UNIQUE` is never inspected — so a partitioned table with a bad `UNIQUE` and a good PK passes clean and then fails at deploy. Name matching is exact and case-sensitive, so a quoted mixed-case partition key compared against an unquoted key column can produce a spurious "missing" report. Mixed expression-and-column partition keys are partly checked: the expression components are silently dropped from the comparison.',
  },
  MP050: {
    operation: 'index',
    impacts: ['full-scan'],
    lock: 'none',
    remediation: 'manual',
    extension: 'pgvector',
    triggerKeywords: ['CREATE INDEX', 'USING IVFFLAT', 'IVFFLAT', 'HNSW', 'VECTOR_COSINE_OPS'],
    triggersOn:
      'An `IndexStmt` whose `accessMethod` is exactly the string `ivfflat`. Nothing else is examined — not the opclass, not the `WITH (lists = ...)` options, not the column type. Case is handled by the parser rather than the rule: an unquoted `USING IVFFLAT` arrives lowered to `ivfflat`, verified against the bundled parser.',
    doesNotTriggerOn:
      '`USING hnsw`, or any other access method. Any non-`IndexStmt` node. A quoted access method that preserves case, `USING "IVFFlat"`, would fail the exact-string comparison, though PostgreSQL would not resolve that name anyway.',
    lockDetail:
      'The rule is silent on locking, and deliberately so — MP001 covers whether the `CREATE INDEX` should be `CONCURRENTLY`. The concern here is index quality over time: IVFFlat builds its cluster centroids from whatever rows exist at build time, so recall decays as the vector distribution drifts and the only remedy is a `REINDEX`, which is itself a heavy operation you now have to schedule forever.',
    assumptions:
      'It cannot check whether the recommendation is right for this workload. IVFFlat is a legitimate choice when build time and index size matter more than recall, and the rule has no view of either the vector count or the recall target — the fixer classification says as much, which is why it is unfixable. It also does not verify that `pgvector` is installed or at a version that has HNSW (added in pgvector 0.5.0); it infers everything from the access-method name alone.',
  },
  MP051: {
    operation: 'index',
    impacts: ['full-scan'],
    lock: 'none',
    remediation: 'manual',
    applicabilityNote:
      '`geometry` and `geography` come from PostGIS, but `point`, `line`, `lseg`, `box`, `path`, `polygon` and `circle` are core PostgreSQL geometric types. The rule fires on a plain PostgreSQL schema that has never installed PostGIS, and does not check whether the extension is present.',
    triggerKeywords: ['CREATE TABLE', 'GEOMETRY', 'GEOGRAPHY', 'USING GIST', 'USING SPGIST', 'POLYGON'],
    triggersOn:
      'A `CreateStmt` with at least one `ColumnDef` whose `typeName.names[].String.sval`, lowercased, is in the set `geometry`, `geography`, `point`, `line`, `lseg`, `box`, `path`, `polygon`, `circle` — and for which no later statement looks like a matching spatial index. That second half is a raw text scan, not AST inspection: it walks `ctx.allStatements` from `statementIndex + 1` forward and stands down if any statement uppercased contains `USING GIST` or `USING SPGIST` and, separately, if that statement raw text contains one of the spatial column names as a case-sensitive substring.',
    doesNotTriggerOn:
      'A `CreateStmt` followed anywhere later in the same file by a statement satisfying that two-part text test. Tables with no spatial columns. `ALTER TABLE ... ADD COLUMN geom geometry`, which is an `AlterTableStmt` and is never inspected, so a spatial column added to an existing table is never checked for an index.',
    lockDetail:
      'The rule takes no position on locking — it is about a missing index and the sequential scans that follow. It is worth noting the lookback direction implies the opposite of a lock concern: the whole point of catching this at `CREATE TABLE` time is that the table is empty, so the index can be built immediately without the `CONCURRENTLY` dance a later `ALTER` would require.',
    assumptions:
      'The suppression check is text matching and inherits every text-matching weakness. An index written in a different migration file, or in an earlier statement of this file, is invisible — the scan only runs forward. `USING  GIST` with two spaces still matches because the test is `includes`, but the column-name half is case-sensitive against un-uppercased SQL, so a quoted or differently-cased column name can miss. Worse in the other direction: a GIST index on a completely different table that happens to mention a column with the same name suppresses the warning. The rule also cannot know whether the spatial column is ever queried spatially.',
  },
  MP052: {
    operation: 'column',
    impacts: ['deploy-incompat'],
    lock: 'none',
    remediation: 'informational',
    triggerKeywords: ['ALTER TABLE', 'DROP COLUMN', 'ALTER COLUMN TYPE', 'RENAME COLUMN', 'PG_DEPEND'],
    triggersOn:
      'Either of two node shapes. A `RenameStmt` whose `renameType` is `"OBJECT_COLUMN"` — the parser emits the enum name, not its ordinal — which is how `ALTER TABLE ... RENAME COLUMN` arrives; it is checked before anything else, because a column rename is never an `AlterTableStmt`. Or an `AlterTableStmt` with a command of subtype `AT_DropColumn` or `AT_AlterColumnType`; that loop returns on the first such command. The three produce differently worded messages, and the drop case ships a `pg_depend` query in `safeAlternative` that names the specific table and column.',
    doesNotTriggerOn:
      'Renaming anything that is not a column: `ALTER TABLE ... RENAME TO` is `OBJECT_TABLE` and belongs to MP028, a constraint rename is `OBJECT_TABCONSTRAINT`, and an index rename is `OBJECT_INDEX`. `ADD COLUMN`, `SET NOT NULL`, and every other `AlterTableCmd` subtype are outside the rule. Renaming a column of a view or a materialized view is `OBJECT_COLUMN` too, and is flagged — dependents break there in exactly the same way.',
    lockDetail:
      'Not a lock rule. `DROP COLUMN` takes a brief ACCESS EXCLUSIVE for a catalog-only change and `ALTER COLUMN ... TYPE` holds ACCESS EXCLUSIVE through a full rewrite, but MP017 and MP007 own those stories. This rule is about failures that happen after the migration succeeds: a view, function, or trigger body that still references the column errors at query time, on the next request, not during deployment.',
    assumptions:
      'It cannot enumerate dependents. Without a catalog connection there is no way to know whether any view or function references the column, so the rule fires unconditionally on every drop, rename and type change — including on a column nothing has ever referenced. Nothing in the code reads `ctx.cluster` or `ctx.production`, so `--database-url` does not upgrade it to a real dependency check; the `pg_depend` query it emits is something the operator runs by hand. Its output is a prompt to go look, which is why remediation is informational rather than a rewrite. The rename path was dead until recently — gated behind an `AlterTableStmt` check a `RenameStmt` can never satisfy — so a migration linted by an older release was only ever checked for drops and type changes.',
  },
  MP053: {
    operation: 'transaction',
    impacts: ['queue-risk', 'blocks-writes'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['BEGIN', 'COMMIT', 'ROLLBACK', 'START TRANSACTION', 'END'],
    triggersOn:
      'Only the last statement of the file — `ctx.statementIndex !== ctx.allStatements.length - 1` returns null for everything else. On that last statement it counts a depth over every statement in the file, incrementing on `isTransactionBegin` and decrementing on `isTransactionEnd`, and reports when the depth ends above zero. Both predicates read `TransactionStmt.kind` from the parse tree first (`TRANS_STMT_BEGIN` / `TRANS_STMT_START`, `TRANS_STMT_COMMIT` / `TRANS_STMT_ROLLBACK`), falling back to comment-stripped text only when there is no parse tree.',
    doesNotTriggerOn:
      'Any statement that is not the last one in the file, regardless of what it is. A file whose `BEGIN`s and `COMMIT`s balance. A file with a stray `COMMIT` and no `BEGIN`, which drives the depth negative and so never satisfies `depth > 0` — the `whyItMatters` calls that a structural problem but the rule does not report it. `SAVEPOINT` and `RELEASE SAVEPOINT`, which are not counted at all.',
    lockDetail:
      'The rule holds no lock of its own and names no lock level. It is about lock duration: whatever the statements inside the block acquired stays acquired, because an uncommitted transaction never releases. That is the queue-risk case — one open transaction holding ACCESS EXCLUSIVE on a hot table parks every subsequent query behind it, indefinitely, until someone kills the session.',
    assumptions:
      'It has no idea what the migration runner does. golang-migrate, Flyway and Rails wrap each file in their own transaction, in which case a bare `BEGIN` opens a nested block rather than a dangling one and the report is a false positive; a runner that streams the file to `psql` in autocommit makes it a genuine defect. The rule cannot distinguish the two. Because depth is a simple counter, `BEGIN; BEGIN; COMMIT;` nets to depth 1 and reports, even though PostgreSQL would have warned on the second `BEGIN` and treated the `COMMIT` as closing the one real transaction. The violation is reported at the line of the last statement, not at the unmatched `BEGIN`.',
  },
  MP054: {
    operation: 'enum',
    impacts: ['deploy-incompat'],
    lock: 'none',
    remediation: 'manual',
    applicabilityNote:
      'The failure mode changes by version. Before PG 12, `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block at all — MP012 covers that. From PG 12 the statement is allowed in a transaction but the new label is invisible to the rest of it, and the offending `INSERT`/`UPDATE` fails with "unsafe use of new value". The rule has no version gate and reports the PG 12+ wording either way.',
    triggerKeywords: ['ALTER TYPE', 'ADD VALUE', 'BEGIN', 'COMMIT', 'INSERT', 'UPDATE'],
    triggersOn:
      'An `InsertStmt` or `UpdateStmt` that is preceded, within the same explicit transaction, by at least one `AlterEnumStmt`. The rule replays statements `0..statementIndex-1`, flipping an `inTransaction` flag on `isTransactionBegin` / `isTransactionEnd` (both of which read `TransactionStmt.kind` from the parse tree, not the leading keyword) and pushing every `AlterEnumStmt` seen while the flag is set. It fires when the flag is still set and the list is non-empty.',
    doesNotTriggerOn:
      'Any file with no explicit `BEGIN`. `inTransaction` starts false and is only ever set by an actual `TransactionStmt`, so a migration whose runner supplies the transaction — which is most of them — never fires, no matter how the statements are ordered. `DELETE` and `SELECT`, since only `InsertStmt` and `UpdateStmt` are considered. An `INSERT` that comes before the `ALTER TYPE`, or after a `COMMIT` that clears the list.',
    lockDetail:
      'No table lock is the subject. `ALTER TYPE ... ADD VALUE` takes a lock on the type, not on tables using it, and the rule reports a visibility rule rather than a contention one: within the adding transaction the new label has no committed catalog row that other statements can resolve, so the statement errors instead of blocking.',
    assumptions:
      'It never checks whether the `INSERT` or `UPDATE` actually references the new enum label. Any DML after any `ALTER TYPE ... ADD VALUE` in the same explicit transaction is flagged, so an unrelated `INSERT INTO audit_log` in that block is a false positive. Combined with the implicit-transaction blind spot above, this is a rule that misses the common shape and over-reports the uncommon one. The `line` it records for the tracked `ADD VALUE` is the statement index plus one, not a file line number, though that value never reaches the message.',
    deployNote:
      'The fix is a transaction boundary, which usually means a deploy boundary. `ALTER TYPE ... ADD VALUE` has to commit before anything can read the new label, so the `ADD VALUE` and its first use belong in two separate migrations, and where to cut is the author decision the fixer refuses to make.',
  },
  MP055: {
    operation: 'constraint',
    impacts: ['replication'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['ALTER TABLE', 'DROP CONSTRAINT', 'REPLICA IDENTITY', 'PRIMARY KEY', 'PKEY'],
    triggersOn:
      'An `AlterTableStmt` command of subtype `AT_DropConstraint` whose `name` either ends in `_pkey` or, lowercased, contains the substring `pk` anywhere — and for which no statement in the file satisfies a suppression text scan. That scan lowercases each statement in `ctx.allStatements` and requires it to contain both `replica identity` and the target table name as substrings.',
    doesNotTriggerOn:
      'A `DROP CONSTRAINT` whose name matches neither pattern. A file where any statement, in any position, mentions `replica identity` together with the table name. Any `ALTER TABLE` with no `AT_DropConstraint` command, and any non-`AlterTableStmt` node — `DROP INDEX` on the index backing a PK is not seen.',
    lockDetail:
      'The rule does not lead with locking, though `ALTER TABLE ... DROP CONSTRAINT` does take ACCESS EXCLUSIVE briefly and also drops the unique index underneath the key. The real subject is downstream: the default `REPLICA IDENTITY` is the primary key, so removing it leaves the table with nothing to identify rows by. The publisher keeps accepting `UPDATE` and `DELETE`; the subscriber is what fails, which is why the breakage shows up somewhere other than where the migration ran.',
    assumptions:
      'Whether a constraint is the primary key is decided by name pattern, not by the catalog. A constraint named `orders_pkg_check` contains `pk` and is flagged; a primary key named `users_primary_key` contains neither `_pkey` nor `pk` and is missed entirely. The suppression side is equally loose: it is satisfied by a `REPLICA IDENTITY NOTHING` statement, which does not help at all, and by a statement that mentions the table name only in passing. The rule also cannot tell whether the table is actually part of a publication — nothing reads `ctx.cluster`, so a database with no logical replication configured gets the same critical violation.',
  },
  MP056: {
    operation: 'index',
    impacts: ['full-scan'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['CREATE INDEX', 'USING GIN', 'JSONB', 'JSONB_PATH_OPS', 'JSONB_OPS'],
    triggersOn:
      'An `IndexStmt` whose `accessMethod` lowercased is `gin`, with at least one `indexParams[].IndexElem` that has a `name` and no `expr` — a bare column reference rather than an expression. One extra gate is text, not AST: `ctx.originalSql.toLowerCase().includes("jsonb_path_ops")` makes the rule stand down.',
    doesNotTriggerOn:
      'A GIN index whose keys are all expressions, since those `IndexElem`s carry `expr` and no `name`. Any statement whose text contains `jsonb_path_ops` anywhere, including inside a comment on the same statement — the check is a raw substring test over the whole statement. Non-GIN access methods. `ALTER TABLE ... ADD CONSTRAINT`, which is not an `IndexStmt`.',
    lockDetail:
      'Nothing to do with locks; MP001 handles whether the index build should be `CONCURRENTLY`. The point is that the index will exist, will be maintained on every write, and still will not be used by the queries the author had in mind: default `jsonb_ops` GIN answers `@>`, `?`, `?|` and `?&`, and the `->>` extraction that most ORMs generate falls back to a sequential scan.',
    assumptions:
      'The rule cannot see column types. It has no catalog access and never reads `ctx.existingIndexes` or `ctx.cluster`, so it does not actually know the column is `jsonb` — it fires on any GIN index over any bare column. That makes a `USING GIN (tags)` on a `text[]`, a `tsvector` full-text index, and a trigram index written as `USING GIN (name gin_trgm_ops)` all false positives, since the opclass is never inspected and only the literal string `jsonb_path_ops` suppresses it. It also cannot know which operators the application actually uses, which is exactly why the fixer classifies it unfixable.',
  },
  MP057: {
    operation: 'privileges',
    impacts: ['deploy-incompat'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['ROW LEVEL SECURITY', 'ENABLE ROW LEVEL SECURITY', 'CREATE POLICY', 'RLS', 'USING'],
    triggersOn:
      'An `AlterTableStmt` with a command of subtype `AT_EnableRowSecurity`, where no statement in `ctx.allStatements` passes a text test. That test lowercases each statement and requires it to contain both `create policy` and the target table name as substrings — it does not parse `CreatePolicyStmt` or compare the policy target table.',
    doesNotTriggerOn:
      '`FORCE ROW LEVEL SECURITY`, which parses to the separate subtype `AT_ForceRowSecurity` and is never checked — verified against the bundled parser. `DISABLE ROW LEVEL SECURITY`. Any file where some statement contains both magic substrings, including a policy written in a comment, since the scan is over raw text.',
    lockDetail:
      'Not a lock rule. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` takes ACCESS EXCLUSIVE for a moment to flip one catalog flag and touches no data. The hazard is what happens after it commits: with RLS on and zero policies the default is deny-all, so every query from a non-superuser, non-owner role returns zero rows with no error at all. The application sees an empty table, not a permission failure.',
    assumptions:
      'Policy detection is substring matching in both halves, and both halves are wrong in a useful way. Table matching is a substring test, so a `CREATE POLICY` on `users_archive` satisfies the check for table `users` and suppresses a real violation. Cross-file state is invisible: a policy created in an earlier migration, or already present in the database, is not visible to the scan, so enabling RLS in its own migration file always reports even when the policies exist. The rule reads no catalog — nothing touches `ctx.cluster` — so `--database-url` does not let it confirm what policies the table already has.',
  },
  MP058: {
    operation: 'table',
    impacts: ['blocks-reads', 'blocks-writes', 'queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['ALTER TABLE', 'ADD COLUMN', 'ADD CONSTRAINT', 'ALTER COLUMN', 'SET NOT NULL'],
    triggersOn:
      "Two or more `ALTER TABLE` statements on the same table inside the same transaction block (or each its own autocommit statement) where merging their subcommands into one statement would cost nothing. The rule collects every `AlterTableStmt` targeting the table in the enclosing block and reports once, on the first member, when more than one exists and `isMergeFree` finds none of the split-on-purpose shapes.",
    doesNotTriggerOn:
      "A group where any member carries an `AT_ValidateConstraint` subtype, or where `AT_SetNotNull` and `AT_DropConstraint` appear together — both patterns the handbook says to keep split. Also stands down when a constraint added `NOT VALID` in the group is dropped later, or when a statement between two members reads or writes the table and would have its position moved by a merge. A table with only one `ALTER TABLE` statement never reaches the check.",
    lockDetail:
      "Each separate ALTER TABLE acquires ACCESS EXCLUSIVE independently, so N statements mean N lock/unlock cycles, each queueing behind whatever holds the lock and blocking every reader and writer that arrives after it. Merging the mergeable subcommands into one statement cuts that to a single cycle.",
    assumptions:
      "The rule assumes a merge is free once the three split-on-purpose shapes are ruled out, but its only check for an ordering dependency is whether an intervening statement literally names the table — a subtler dependency wouldn't be caught. It also has no idea how contended the table's lock actually is, so on a quiet table the extra cycles may not matter in practice.",
  },
  MP059: {
    operation: 'backfill',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['INSERT INTO', 'setval', 'ALTER SEQUENCE', 'RESTART', 'nextval'],
    triggersOn:
      "An `InsertStmt` whose raw SQL text has an integer literal as the very first value in the `VALUES` list — `VALUES (123, ...)` — matched with the AST node rather than a leading-keyword scan, so a comment above the statement doesn't throw it off. It also fires only when no statement anywhere else in the migration calls `setval()` or `ALTER SEQUENCE ... RESTART` mentioning the same table name.",
    doesNotTriggerOn:
      "INSERTs where the first VALUES element isn't a bare integer literal — a UUID, a text id, or an integer id that isn't the first column all pass through untouched — and any INSERT where another statement in the same migration calls `setval()` or `ALTER SEQUENCE ... RESTART` with that table's name. The reset search is a same-migration text scan, not a check across every file in the deploy.",
    lockDetail:
      "No lock is involved — this is a data-integrity check, not a locking one. The rule flags a sequence counter left stale after seeding rows with hand-picked ids, nothing held during the statement itself.",
    assumptions:
      "Detection is a regex match on the SQL text, so a multi-row INSERT whose first VALUES tuple doesn't start with the id column, or a sequence reset issued from a separate migration file, would both be missed. It also assumes the inserted ids are below the sequence's current value, which isn't always true.",
  },
  MP060: {
    operation: 'enum',
    impacts: ['replication'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['ALTER TYPE', 'RENAME VALUE', 'ADD VALUE', 'enum'],
    triggersOn:
      "`ALTER TYPE ... RENAME VALUE` on an `AlterEnumStmt` node, detected by checking that the statement's lowercased original SQL text contains the literal phrase `rename value` — the AST shape for rename versus add differs across libpg-query versions, so the rule leans on the text match instead.",
    doesNotTriggerOn:
      "Any other `AlterEnumStmt` form, most notably `ADD VALUE`, whose SQL text doesn't contain `rename value`. Since detection is entirely text-based, nothing else about the statement is inspected once that phrase is absent.",
    lockDetail:
      "No lock is named in the source — the danger isn't blocking, it's that `RENAME VALUE` edits the `pg_enum` catalog entry in place, and logical replication never ships catalog changes to subscribers at all.",
    assumptions:
      "The rule assumes a subscriber exists that cares about the old value name — a read replica, a CDC pipeline, a branched database. On a database with no logical replication downstream, a rename is harmless. It also can't tell whether any row actually uses the renamed value, so it fires even on a value nothing currently references.",
  },
  MP061: {
    operation: 'column',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['CREATE TABLE', 'JSONB', 'TEXT', 'BYTEA', 'VARCHAR'],
    triggersOn:
      "A `CreateStmt` with 3 or more columns where at least one variable-length type (anything not in the rule's hardcoded fixed-size set — text, varchar, jsonb, bytea, etc.) is declared before a fixed-size type (int, bigint, timestamp, uuid, and others) that appears later in the column list.",
    doesNotTriggerOn:
      "Tables with fewer than 3 columns, tables where every fixed-size column already precedes the variable-length ones, and tables that are all one kind (all fixed or all variable) — `firstFixedAfterVar` never gets set and the check returns null.",
    lockDetail:
      "No lock applies — this is a `CREATE TABLE`, so there's no existing table being altered. The concern is on-disk storage layout on the new table, not locking.",
    assumptions:
      "The rule only recognizes its own hardcoded list of fixed-size type names, so a custom domain or an enum wrapping a fixed-size value would be treated as variable-length and could produce a false positive. It also assumes the padding waste matters, which only holds once the table accumulates enough rows for a few bytes each to add up.",
  },
  MP062: {
    operation: 'column',
    impacts: ['blocks-reads', 'blocks-writes', 'table-rewrite'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['ADD COLUMN', 'GENERATED ALWAYS AS', 'STORED', 'ALTER TABLE'],
    triggersOn:
      "The `AT_AddColumn` subtype of `ALTER TABLE` where the new column's constraint list contains a `CONSTR_GENERATED` constraint — i.e. `ADD COLUMN ... GENERATED ALWAYS AS (...) STORED`.",
    doesNotTriggerOn:
      "Any `AlterTableCmd` subtype other than `AT_AddColumn` (ALTER COLUMN, DROP COLUMN, ADD CONSTRAINT, and so on) is skipped before the generated-column check ever runs, and a plain `ADD COLUMN` whose constraint list has no `CONSTR_GENERATED` entry never matches.",
    lockDetail:
      "ACCESS EXCLUSIVE for the whole rewrite: every existing row is read and rewritten to compute and store the generated expression, and the lock blocks all reads and writes on the table for that duration.",
    assumptions:
      "The rule fires identically regardless of table size, so a small or empty table is flagged the same as one with millions of rows, even though the rewrite cost — and the real risk — scales with row count.",
  },
  MP063: {
    operation: 'table',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['DO $$ ... $$', 'ALTER TABLE', 'CREATE INDEX', 'DROP TABLE', 'TRUNCATE'],
    triggersOn:
      "A `DoStmt` whose `as` argument (the PL/pgSQL body string) matches one of eleven hardcoded regex patterns for DDL keywords — `ALTER TABLE`, `CREATE INDEX`, `CREATE TABLE`, `DROP TABLE`, `DROP INDEX`, `DROP COLUMN`, `ADD COLUMN`, `ADD CONSTRAINT`, `DROP CONSTRAINT`, `RENAME`, or `TRUNCATE` — found anywhere in the block's text.",
    doesNotTriggerOn:
      "A `DoStmt` with no `as` argument in its `args` list, where body extraction returns null, or a DO block body whose text matches none of the eleven DDL keyword patterns — for example a block that only runs DML or calls functions.",
    lockDetail:
      "No lock is named — that's the point of the rule. Whatever DDL runs inside the block takes the same lock it would if written directly, but because the body executes as opaque PL/pgSQL, static analysis can't identify which lock that is.",
    assumptions:
      "Detection is a keyword regex against the block's text, so it misses DDL assembled dynamically (e.g. via `EXECUTE format(...)` built from variables) and can false-positive on a keyword that only appears in a comment or string literal inside the block, since the matcher never parses the PL/pgSQL body.",
  },
  MP064: {
    operation: 'trigger',
    impacts: ['replication'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['ALTER TABLE', 'DISABLE TRIGGER ALL', 'DISABLE TRIGGER USER'],
    triggersOn:
      "The `AT_DisableTrigAll` or `AT_DisableTrigUser` subtype of `ALTER TABLE` — `ALTER TABLE ... DISABLE TRIGGER ALL` or `... DISABLE TRIGGER USER`.",
    doesNotTriggerOn:
      "`ALTER TABLE ... DISABLE TRIGGER <name>` targeting one specific trigger by name produces neither subtype and passes through, as does any `AlterTableStmt` with no `cmds` or no `relation.relname`, or any table alteration that doesn't touch triggers at all.",
    lockDetail:
      "No lock is named in the source — the danger isn't blocking, it's that once triggers are off, logical replication (which relies on triggers internally), audit logging, and foreign-key enforcement all silently stop working until something re-enables them.",
    assumptions:
      "The rule assumes the table has triggers whose loss matters — replication, audit, FK enforcement — which won't be true for every table. It also can't tell whether the same session re-enables triggers later; it flags the disable unconditionally.",
  },
  MP065: {
    operation: 'table',
    impacts: ['blocks-reads', 'blocks-writes', 'queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['LOCK TABLE', 'IN ACCESS EXCLUSIVE MODE', 'IN SHARE MODE', 'IN EXCLUSIVE MODE'],
    triggersOn:
      "Any explicit `LockStmt` — a `LOCK TABLE` statement naming one or more relations — regardless of mode. The rule reads `lockStmt.mode` only to report which of PostgreSQL's lock modes was requested.",
    doesNotTriggerOn:
      "The only guard is `!lockStmt?.relations`, so the rule fires on every `LOCK TABLE` the parser produces. There's no negative case beyond a statement that isn't a `LockStmt` at all.",
    lockDetail:
      "Whatever mode the statement names, from ACCESS SHARE up through ACCESS EXCLUSIVE — the rule reports the specific mode from `lockStmt.mode`, defaulting the message to ACCESS EXCLUSIVE only when that field is missing. At the high end, ACCESS EXCLUSIVE blocks every other lock mode, including plain reads.",
    assumptions:
      "The rule treats every explicit `LOCK TABLE` as suspect, but there are legitimate uses — deliberately serializing access to a small table, for instance — where an explicit lock is the right tool and PostgreSQL's automatic DDL locking doesn't apply.",
  },
  MP066: {
    operation: 'table',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['autovacuum_enabled', 'WITH (autovacuum_enabled = false)', 'CREATE TABLE', 'ALTER TABLE'],
    triggersOn:
      "A `CreateStmt` with a `WITH (autovacuum_enabled = false)` storage option, or the `AT_SetRelOptions` subtype of `ALTER TABLE ... SET (autovacuum_enabled = false)` — both checked by scanning the option list's `DefElem` entries for `defname === 'autovacuum_enabled'` with a string value of `'false'`.",
    doesNotTriggerOn:
      "`CREATE TABLE` or `ALTER TABLE ... SET` with any other storage option, or with `autovacuum_enabled` set to `true` or anything other than the literal string `'false'`, and any `AlterTableCmd` subtype other than `AT_SetRelOptions`.",
    lockDetail:
      "No lock is named in the source — the concern isn't blocking, it's what happens after: without autovacuum, dead tuples build up and the table's transaction id counter stops advancing, pushing it toward a wraparound shutdown over time.",
    assumptions:
      "The rule fires the same way whether this is a permanent production table or a short-lived staging table for a bulk load, where disabling autovacuum temporarily is a common, legitimate optimization — it only sees that the option was set, not the table's purpose.",
  },
  MP067: {
    operation: 'backfill',
    impacts: ['blocks-writes', 'replication'],
    lock: 'ROW EXCLUSIVE',
    remediation: 'multi-step',
    triggerKeywords: ['DELETE FROM', 'TRUNCATE', 'WHERE'],
    triggersOn:
      "A `DeleteStmt` with no `whereClause` at all — a bare `DELETE FROM <table>` that removes every row.",
    doesNotTriggerOn:
      "Any `DELETE` that has a `WHERE` clause, no matter how broad — the check is only `if (del.whereClause) return null`, so it never evaluates whether that clause is actually selective.",
    lockDetail:
      "A full-table DELETE holds ROW EXCLUSIVE for the whole run, which blocks other writers and any DDL wanting a conflicting lock, and it generates a WAL entry per deleted row rather than the near-instant metadata-only operation TRUNCATE performs.",
    assumptions:
      "The rule assumes deleting every row was accidental or should have been batched; on a genuinely small table, or when the whole table really is meant to go, a single unbatched DELETE — or better, TRUNCATE — can be entirely appropriate, and the warning is just noise.",
  },
  MP068: {
    operation: 'sequence',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['CREATE SEQUENCE', 'AS integer', 'AS smallint', 'bigint'],
    triggersOn:
      "`CREATE SEQUENCE ... AS <type>` where the `as` option's type name is `int4`, `int2`, `integer`, or `smallint`, read from the option list's `DefElem` with `defname === 'as'`.",
    doesNotTriggerOn:
      "`CREATE SEQUENCE` with no explicit `AS` type (new sequences default to bigint), or an explicit `AS bigint`/`AS int8`. The rule only inspects `CreateSeqStmt`, so a `SERIAL` column — which PostgreSQL expands into an int4 sequence during semantic analysis, after the raw parse tree this rule sees — isn't caught by this check.",
    lockDetail:
      "No lock applies to the flagged statement itself — creating a new sequence takes no meaningful lock. The lock concern the rule warns about is deferred: converting an already-in-use int4 sequence, and the column it feeds, to bigint later requires ACCESS EXCLUSIVE and a full table rewrite.",
    assumptions:
      "The rule assumes any explicit small-integer sequence will eventually see enough inserts to overflow, which may not hold for a low-traffic table. It has no way to measure current insert rate, so it flags every explicit `AS integer`/`AS smallint` sequence the same whether overflow is decades away or imminent.",
  },
  MP069: {
    operation: 'constraint',
    impacts: ['blocks-writes', 'full-scan'],
    lock: 'SHARE ROW EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['ADD CONSTRAINT', 'FOREIGN KEY', 'REFERENCES', 'NOT VALID', 'VALIDATE CONSTRAINT'],
    triggersOn:
      "The `AT_AddConstraint` subtype of `ALTER TABLE` where the constraint's `contype` is `CONSTR_FOREIGN` — any `ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES ...`, regardless of whether `NOT VALID` is present.",
    doesNotTriggerOn:
      "Any `AlterTableCmd` whose subtype isn't `AT_AddConstraint`, an `AT_AddConstraint` whose `contype` isn't `CONSTR_FOREIGN` (adding a CHECK or UNIQUE constraint, for instance), and any `AlterTableStmt` with no `cmds` array at all.",
    lockDetail:
      "SHARE ROW EXCLUSIVE on the table gaining the constraint, and SHARE on the referenced table, both held for the full validation scan, which reads every row in the referencing table. Both locks block writes to their respective table for that whole duration.",
    assumptions:
      "The rule fires whether or not `NOT VALID` is present, since the dual-table locking happens the moment the constraint is added either way — but the long validation-scan duration it's really warning about only applies when validation runs inline as part of that same statement.",
    deployNote:
      "Add the constraint with `NOT VALID`, then run `VALIDATE CONSTRAINT` in its own, separate transaction. Combining them into one statement runs the validation scan under the same locks that are already blocking both tables, so splitting only helps if the two statements land in different transactions.",
  },
  MP070: {
    operation: 'index',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['CREATE INDEX CONCURRENTLY', 'DROP INDEX CONCURRENTLY', 'IF EXISTS', 'REINDEX INDEX CONCURRENTLY'],
    triggersOn:
      "`CREATE INDEX CONCURRENTLY` with an explicit index name and no `IF NOT EXISTS`, where no earlier statement in the migration is a `DROP INDEX IF EXISTS` naming that same index — checked by scanning `ctx.allStatements` before the current statement for the text `drop index`, `if exists`, and the index name together.",
    doesNotTriggerOn:
      "Non-concurrent `CREATE INDEX`, a concurrent create with `IF NOT EXISTS`, one preceded earlier in the migration by a matching `DROP INDEX IF EXISTS`, or one whose index name is — or will become — owned by a UNIQUE or PRIMARY KEY constraint. `adoptedLaterInMigration` or `constraintOwning` finding an owner stands the rule down, since `DROP INDEX ... IF EXISTS` on a constraint-backed index is rejected by PostgreSQL outright.",
    lockDetail:
      "No lock is named — the danger isn't blocking, it's that a failed `CREATE INDEX CONCURRENTLY` leaves an invalid index behind, and retrying without dropping it first fails with \"relation already exists,\" turning a transient failure into a stuck migration.",
    assumptions:
      "The rule assumes a retry will happen and that the migration file is the unit of idempotency — it only searches earlier statements in the same file for the matching drop, so a drop issued from a separate cleanup script or an earlier migration file wouldn't be seen.",
  },
  MP071: {
    operation: 'column',
    impacts: ['deploy-incompat'],
    lock: 'none',
    remediation: 'multi-step',
    triggerKeywords: ['RENAME COLUMN', 'ALTER TABLE', 'RENAME TO'],
    triggersOn:
      "A `RenameStmt` whose `renameType` is `OBJECT_COLUMN` (libpg-query returns this as the string `'OBJECT_COLUMN'`, or numerically `7`) — `ALTER TABLE ... RENAME COLUMN ... TO ...`.",
    doesNotTriggerOn:
      "Any other `RenameStmt` target (renaming a table, index, or constraint uses a different `renameType`), and any column rename where another statement in the same migration is a `CREATE OR REPLACE VIEW` or `CREATE OR REPLACE FUNCTION` whose SQL text mentions the new column name — the rule takes that as evidence the dependents were updated in the same migration.",
    lockDetail:
      "No lock is named in the source — the danger here isn't blocking, it's that views, functions, triggers, and policies referencing the old column name keep compiling against a name that no longer exists and fail the moment they're invoked.",
    assumptions:
      "The dependents check is a same-migration text search for the new name inside a `CREATE OR REPLACE VIEW`/`FUNCTION` statement — it can't see application code, so a rename with no view or function update in the migration is flagged even when the app is genuinely unaffected, and a coincidental text match could just as easily suppress a real warning.",
    deployNote:
      "Same expand-contract shape as MP010: add the new column, backfill data, deploy the application change that reads and writes the new name, and only then drop the old column in a later migration. The app deploy has to land between the backfill and the drop.",
  },
  MP072: {
    operation: 'partition',
    impacts: ['blocks-reads', 'blocks-writes', 'full-scan'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['ATTACH PARTITION', 'ALTER TABLE', 'DEFAULT PARTITION', 'FOR VALUES'],
    triggersOn:
      "The `AT_AttachPartition` subtype of `ALTER TABLE` — any `ALTER TABLE <parent> ATTACH PARTITION <name> FOR VALUES ...` — matched unconditionally whenever that subtype appears among the statement's `cmds`.",
    doesNotTriggerOn:
      "Any `AlterTableCmd` subtype other than `AT_AttachPartition`, and any `AlterTableStmt` with no `cmds` array. The rule has no check for whether a DEFAULT partition actually exists on the parent — it fires on every ATTACH PARTITION regardless.",
    lockDetail:
      "ACCESS EXCLUSIVE, held for as long as the DEFAULT partition scan takes. PostgreSQL must verify no default-partition row belongs in the new partition's range before allowing the attach, and that scan runs under the same lock blocking every other read and write.",
    assumptions:
      "The rule fires on every `ATTACH PARTITION` even when the parent has no DEFAULT partition at all — in that case there's no scan and no risk, but the source never checks for a DEFAULT partition's existence, so it can't distinguish the two cases.",
  },
  MP073: {
    operation: 'privileges',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['ALTER SYSTEM', 'CREATE ROLE', 'SUPERUSER', 'ALTER ROLE'],
    triggersOn:
      "Any `AlterSystemStmt` node (`ALTER SYSTEM SET ...`), a `CreateRoleStmt` whose options include a `superuser` `DefElem` with a true boolean or integer value — or the bare `SUPERUSER` keyword, which defaults to true when no `arg` is present — or an `AlterRoleStmt` with the same `superuser` option.",
    doesNotTriggerOn:
      "`CREATE ROLE` or `ALTER ROLE` without a `superuser` option, or with it explicitly set false (a `Boolean` arg that isn't `true`, or an `Integer` arg that isn't `1`). The rule only checks the `superuser` option name, so `NOSUPERUSER` and every other role attribute pass through untouched.",
    lockDetail:
      "No lock applies — this is a privilege check, not a locking concern. The rule flags the statement because it requires cluster-wide superuser privileges the migration shouldn't have, not because of anything it holds or blocks.",
    assumptions:
      "The rule assumes the migration shouldn't run with superuser access; on a self-hosted cluster where the deploy pipeline genuinely does have and need superuser, some of these statements may be intentional and safe, and the rule can't tell that apart from an over-privileged migration role by design.",
  },
  MP074: {
    operation: 'constraint',
    impacts: [],
    lock: 'none',
    remediation: 'auto-fix',
    triggerKeywords: ['FOREIGN KEY', 'REFERENCES', 'DEFERRABLE', 'ADD CONSTRAINT', 'INITIALLY DEFERRED'],
    triggersOn:
      "A foreign key constraint — via `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` (`AT_AddConstraint` with `contype: 'CONSTR_FOREIGN'`) or an inline table-level or column-level FK inside `CREATE TABLE` — whose `Constraint.deferrable` field is falsy.",
    doesNotTriggerOn:
      "Any foreign key constraint whose `deferrable` field is already true, and any non-foreign-key constraint, since `contype` is checked explicitly. `ALTER TABLE` statements with no `cmds`, and `CREATE TABLE` statements with no `tableElts`, also return null before the FK check runs.",
    lockDetail:
      "No lock is named — DEFERRABLE is a constraint-timing property, not a locking concern. The rule is about when the FK check runs, per-row during the statement versus at COMMIT, not about anything held on the table.",
    assumptions:
      "The rule flags every non-deferrable FK regardless of whether the table ever does bulk loads or has circular references — most FKs on straightforward parent/child tables never need to defer their check, so this can produce noise on tables where per-row checking was never actually a problem.",
  },
  MP075: {
    operation: 'backfill',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['UPDATE', 'jsonb_set', 'JSONB', 'BYTEA', 'TOAST'],
    triggersOn:
      "An `UpdateStmt` whose SQL text either calls one of a fixed list of JSON/JSONB/binary functions (`jsonb_set`, `to_jsonb`, `encode`, and others) or assigns, in its `SET` clause, to a column whose name matches one of a fixed list of typically TOAST-eligible names (`metadata`, `payload`, `body`, `content`, `data`, and more).",
    doesNotTriggerOn:
      "`UPDATE` statements whose `SET` clause neither calls a matched TOAST-related function nor assigns to a column on the hardcoded name list — updating an `id` or `status` column, for instance, or updating an unlisted text column with plain string concatenation.",
    lockDetail:
      "No lock is named — the rule isn't about locking, it's about storage. Each UPDATE to a TOAST-stored column writes a new TOAST chunk and marks the old one dead, and dead chunks are only reclaimed by VACUUM, not automatically.",
    assumptions:
      "Detection depends entirely on the column matching one of a fixed list of common names or the SET clause calling a listed function — a TOAST-eligible column with an unlisted name (say, `bio`) updated with plain assignment would be missed entirely, while a short `text` column that's never actually TOASTed could still match the name pattern and produce a false positive.",
  },
  MP076: {
    operation: 'transaction',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['SAVEPOINT', 'ROLLBACK TO', 'RELEASE SAVEPOINT'],
    triggersOn:
      "A `TransactionStmt` whose `kind` is `TRANS_STMT_SAVEPOINT` (returned as that string, or numerically `3`) — any `SAVEPOINT <name>` statement.",
    doesNotTriggerOn:
      "Any other `TransactionStmt` kind — `BEGIN`, `COMMIT`, `ROLLBACK`, `RELEASE SAVEPOINT`, `ROLLBACK TO SAVEPOINT` — and any statement that isn't a `TransactionStmt` at all. The check is a single equality test against one kind value.",
    lockDetail:
      "No lock applies — SAVEPOINT doesn't take a table lock. The cost the rule warns about is a consumed transaction id and a subtransaction holding its snapshot open, not anything blocking other sessions.",
    assumptions:
      "The rule flags every SAVEPOINT regardless of how many appear in the migration or how high-throughput the database actually is — a single SAVEPOINT in an otherwise ordinary migration is unlikely to meaningfully affect wraparound timing, and the rule can't distinguish a one-off from a retry loop issuing thousands.",
  },
  MP077: {
    operation: 'column',
    impacts: [],
    lock: 'none',
    remediation: 'auto-fix',
    pgMin: 14,
    triggerKeywords: ['SET COMPRESSION', 'pglz', 'lz4', 'default_toast_compression'],
    triggersOn:
      '`ALTER TABLE ... ALTER COLUMN ... SET COMPRESSION pglz` (the `AT_SetCompression` subcommand with a `pglz` value), or `SET default_toast_compression = \'pglz\'` as a `VariableSetStmt` — checked only when `ctx.pgVersion` is 14 or higher.',
    doesNotTriggerOn:
      'Any migration targeting PostgreSQL below 14 returns immediately, before the statement is inspected. `SET COMPRESSION lz4` (or anything other than `pglz`) is skipped by the loop, as is `SET default_toast_compression` to anything other than `\'pglz\'`, and `ALTER TABLE` statements with no commands.',
    lockDetail:
      'None named — this is a metadata-only change. `SET COMPRESSION` doesn\'t rewrite existing TOASTed values, it only changes which algorithm is used for values written from here on, so there\'s nothing to block.',
    assumptions:
      'Assumes the column actually stores TOAST-heavy data worth compressing — lz4 vs pglz makes no practical difference on a column that rarely stores values over the TOAST threshold, and the rule fires the same way regardless of column size or write volume.',
  },
  MP078: {
    operation: 'extension',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['CREATE EXTENSION', 'VERSION', 'IF NOT EXISTS'],
    triggersOn:
      '`CREATE EXTENSION` where the `CreateExtensionStmt` options don\'t include a `new_version` `DefElem` — i.e. no `VERSION` clause.',
    doesNotTriggerOn:
      'Statements with no extension name (`ext?.extname` missing), and any `CREATE EXTENSION` that already specifies `VERSION \'...\'`.',
    lockDetail:
      'None — this isn\'t about locking, it\'s about the migration installing a different extension version depending on which server it runs against.',
    assumptions:
      'Assumes the extension\'s version matters for correctness — for an extension your team never upgrades, or where every environment runs from the same base image, the default and the pinned version are the same thing anyway. It flags every `CREATE EXTENSION` the same way regardless of whether that extension has ever shipped a breaking version bump.',
  },
  MP079: {
    operation: 'privileges',
    impacts: ['data-loss'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['ENABLE ROW LEVEL SECURITY', 'CREATE POLICY', 'FOR ALL', 'FOR SELECT', 'FOR INSERT'],
    triggersOn:
      'The `AT_EnableRowSecurity` subcommand of `ALTER TABLE`, when the migration\'s own `CREATE POLICY` statements for that table (found by scanning `originalSql` for the table name) cover some but not all of `SELECT`/`INSERT`/`UPDATE`/`DELETE`, and none of them uses `FOR ALL`.',
    doesNotTriggerOn:
      'Non-`AlterTableStmt` statements, and `ALTER TABLE` statements that don\'t enable RLS. A policy anywhere in the migration written `FOR ALL` clears the whole table. If the migration enables RLS but adds no policies at all, this rule stays quiet on purpose — that case is MP057\'s job.',
    lockDetail:
      'None — the risk here isn\'t a lock, it\'s that PostgreSQL denies uncovered operations silently instead of raising an error.',
    assumptions:
      'Assumes every policy for the table lives in this same migration file — a policy created earlier, in a different file, won\'t be seen, so a table that\'s actually fully covered can still get flagged. Coverage detection is also a text match on `create policy` plus the table name, not a structural link between policy and table, so it can misjudge coverage in an unusual layout.',
  },
  MP080: {
    operation: 'backfill',
    impacts: ['queue-risk'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['INSERT INTO', 'UPDATE', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE'],
    triggersOn:
      'Any `InsertStmt`, `UpdateStmt`, or `DeleteStmt` in a migration file where at least one other statement in `ctx.allStatements` is DDL (per the `isDDL` helper).',
    doesNotTriggerOn:
      'DML in a file that contains no DDL at all — a migration that\'s purely a data backfill is left alone, since there\'s nothing to separate it from.',
    lockDetail:
      'None named for the DML itself — the concern is that it runs inside the same file, and often the same transaction, as DDL holding a much stronger lock, so the DML\'s own runtime adds directly to how long that lock is held.',
    assumptions:
      'Assumes any DML riding alongside DDL is worth splitting out, whether it\'s a large backfill or a single-row seed insert — the rule can\'t distinguish the two, so a trivial `INSERT` next to a fast `ALTER TABLE` gets flagged the same as an unbounded `UPDATE`.',
  },
  MP081: {
    operation: 'constraint',
    impacts: [],
    lock: 'none',
    remediation: 'multi-step',
    pgMin: 18,
    applicabilityNote:
      'On PG17 and earlier the CHECK-based workaround is still the only safe way to add NOT NULL to a populated table; this rule only fires once the target is PG18+, where it\'s no longer necessary.',
    deployNote:
      'The ADD CONSTRAINT ... NOT NULL ... NOT VALID step and the VALIDATE CONSTRAINT step are two separate statements — `plan-fix` documents the lock and deploy boundary between them so validation doesn\'t happen in the same transaction as the addition.',
    triggerKeywords: ['CHECK', 'NOT VALID', 'IS NOT NULL', 'ADD CONSTRAINT', 'VALIDATE CONSTRAINT'],
    triggersOn:
      'The `AT_AddConstraint` subcommand of `ALTER TABLE` when the added constraint is a `CONSTR_CHECK` with `skip_validation` set (i.e. `NOT VALID`) whose expression structurally matches an `IS NOT NULL` test on one column — only checked once `ctx.pgVersion` is 18 or higher.',
    doesNotTriggerOn:
      'Any migration targeting PostgreSQL below 18 returns before the statement is even parsed for a constraint. `ALTER TABLE` statements with no commands, CHECK constraints that aren\'t `NOT VALID`, and CHECK expressions that don\'t structurally match a NOT NULL test are all skipped.',
    lockDetail:
      'None — both the old workaround and the PG18 native form use `NOT VALID` plus `VALIDATE CONSTRAINT`, so the locking is the same either way. This rule is about statement count, not lock behavior.',
    assumptions:
      'Assumes `ctx.pgVersion` reflects the real target server — on a fleet running mixed major versions, the rule can suggest simplifying a workaround that\'s still required on servers not yet upgraded to 18. The structural NOT-NULL match also only recognizes one expression shape, so a differently-written but equivalent CHECK could be missed.',
  },
  MP082: {
    operation: 'constraint',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    pgMin: 18,
    triggerKeywords: ['NOT ENFORCED', 'ADD CONSTRAINT', 'ALTER TABLE', 'CREATE TABLE'],
    triggersOn:
      'A regex match for `NOT\\s+ENFORCED` against the statement\'s raw `originalSql` text, checked only when `ctx.pgVersion` is 18 or higher.',
    doesNotTriggerOn:
      'Any migration targeting PostgreSQL below 18 returns immediately, and any statement whose SQL text doesn\'t contain the literal phrase `NOT ENFORCED`.',
    lockDetail:
      'None — `NOT ENFORCED` constraints exist purely as catalog metadata, so there\'s no lock behavior for this rule to describe.',
    assumptions:
      'Assumes `NOT ENFORCED` is worth flagging every time, but it\'s a legitimate tool for documenting an invariant the application already guarantees, or for staging a constraint mid-migration — the rule can\'t tell that deliberate use apart from an accidental one. The match is also on raw text rather than the constraint\'s own AST node, so it doesn\'t distinguish the clause on a real constraint from the same phrase inside a comment.',
  },
  MP083: {
    operation: 'constraint',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    pgMin: 18,
    applicabilityNote:
      'A non-deterministic collation on an FK column was already ambiguous before PG18 — rows could match incorrectly. PG18 changes what happens next: it rejects the constraint outright at creation time instead of accepting it silently.',
    triggerKeywords: ['FOREIGN KEY', 'REFERENCES', 'COLLATE', 'und-x-icu'],
    triggersOn:
      'A foreign key constraint being added — `AT_AddConstraint` with `CONSTR_FOREIGN` in `ALTER TABLE`, or an inline `FOREIGN KEY`/`REFERENCES` in `CREATE TABLE` — where the migration\'s SQL also matches a non-deterministic ICU collation pattern (`und-x-icu` and similar). Checked only when `ctx.pgVersion` is 18 or higher.',
    doesNotTriggerOn:
      'Migrations targeting PostgreSQL below 18. For the `ALTER TABLE` path, an FK constraint where no statement anywhere in the migration matches the non-deterministic-collation pattern. For `CREATE TABLE`, a statement with no `FOREIGN KEY`/`REFERENCES` text, or one where the collation pattern doesn\'t appear in that same statement.',
    lockDetail:
      'None — the risk is a rejected statement or an ambiguous match, not lock contention.',
    assumptions:
      'For the `ALTER TABLE` path, it scans the whole migration\'s SQL text for a non-deterministic collation rather than tracing which column the FK actually references — an unrelated ICU column elsewhere in the same file can trigger a false positive on an FK that has nothing to do with it.',
  },
  MP084: {
    operation: 'column',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['ADD COLUMN', 'NOT NULL', 'DEFAULT', 'ALTER TABLE'],
    triggersOn:
      'The `AT_AddColumn` subcommand of `ALTER TABLE` when the new column\'s constraints include `CONSTR_NOTNULL` but none of `CONSTR_DEFAULT`, `CONSTR_IDENTITY`, or `CONSTR_GENERATED`, and the column type isn\'t one of the `SERIAL`/`BIGSERIAL`/`SMALLSERIAL` pseudo-types.',
    doesNotTriggerOn:
      'Non-`AlterTableStmt` statements, `ALTER TABLE` with no commands, `ADD COLUMN` without `NOT NULL`, and any `NOT NULL` column that supplies its own value — `DEFAULT`, `GENERATED ALWAYS AS IDENTITY`, `GENERATED ALWAYS AS (...) STORED`, or a `SERIAL`-family type.',
    lockDetail:
      'None named — the danger here isn\'t a lock, it\'s that the statement aborts outright on any table with existing rows, rolling back the whole migration.',
    assumptions:
      'Assumes the table has rows in the environment that matters. An empty table, or one seeded fresh in every environment including production, accepts the identical statement without complaint — the rule has no way to check row count without `--database-url`, so it flags the statement the same way regardless.',
  },
  MP085: {
    operation: 'privileges',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['GRANT', 'TO PUBLIC', 'GRANT ALL', 'ALL TABLES IN SCHEMA'],
    triggersOn:
      'A `GrantStmt` where `is_grant` is true and at least one of: the grantees include the `PUBLIC` pseudo-role (`ROLESPEC_PUBLIC`), the privileges list is empty (the parser\'s representation of `ALL PRIVILEGES`), or the target type is `ACL_TARGET_ALL_IN_SCHEMA`.',
    doesNotTriggerOn:
      'Non-`GrantStmt` statements, `REVOKE` (`is_grant !== true` — narrowing access is never flagged), and any `GRANT` that names specific privileges to a specific non-`PUBLIC` role or object, where none of the three widening conditions hold.',
    lockDetail:
      'None — this is about privilege scope, not locking.',
    assumptions:
      'Assumes broad grants are always accidental, but `PUBLIC` access, `ALL PRIVILEGES`, or a schema-wide grant are sometimes exactly what\'s intended — an admin role or a deliberately world-readable reporting schema looks identical to an oversight to this rule, so both get flagged the same way.',
  },
  MP086: {
    operation: 'constraint',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['FOREIGN KEY', 'REFERENCES', 'ON DELETE', 'NO ACTION', 'CASCADE'],
    triggersOn:
      'A foreign key constraint (`AT_AddConstraint` with `CONSTR_FOREIGN` in `ALTER TABLE`, or inline/table-level in `CREATE TABLE`) whose `fk_del_action` is the default `NO ACTION` (`\'a\'`) and whose statement text contains no `ON DELETE` clause at all — the text check is what tells a silent default apart from an explicit `ON DELETE NO ACTION`, since the AST records both identically.',
    doesNotTriggerOn:
      'Any statement whose SQL text contains `ON DELETE` anywhere, including an explicit `ON DELETE NO ACTION` — the author made a choice, so it\'s left alone. Statements with no foreign key constraint at all are skipped too.',
    lockDetail:
      'None — this isn\'t a locking rule, it\'s about making an inherited default visible in review.',
    assumptions:
      'Assumes the literal substring `ON DELETE` appearing anywhere in the statement means this specific FK\'s behavior was chosen deliberately — a comment containing the phrase, or a second, unrelated FK in the same multi-constraint statement that does specify it, would also suppress the warning for this one.',
  },
  MP087: {
    operation: 'constraint',
    impacts: ['data-loss'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['CHECK', 'now()', 'random()', 'CURRENT_TIMESTAMP', 'gen_random_uuid'],
    triggersOn:
      'A `CHECK` constraint (`CONSTR_CHECK`, from `AT_AddConstraint` in `ALTER TABLE` or inline/table-level in `CREATE TABLE`) whose parsed expression tree contains a `FuncCall` to a known volatile function (`now`, `random`, `nextval`, `clock_timestamp`, `gen_random_uuid`, and others in a fixed list) or a bare `SQLValueFunction` such as `CURRENT_TIMESTAMP`/`CURRENT_DATE`/`LOCALTIME` — found by walking the actual expression tree.',
    doesNotTriggerOn:
      'CHECK constraints whose expression tree contains none of the recognized volatile calls. Because detection walks the parsed `FuncCall`/`SQLValueFunction` nodes rather than scanning text, a column merely named `random_seed` or `now_utc` doesn\'t trip it.',
    lockDetail:
      'None — the danger isn\'t locking, it\'s that a CHECK is evaluated once at write time and never re-checked.',
    assumptions:
      'Assumes any match against the fixed `VOLATILE_FUNCTIONS` list is a mistake. A volatile function outside that list — a custom or extension-provided one — would be missed entirely, and a check genuinely meant to be true only at insert time is flagged the same as an accidental one.',
  },
  MP088: {
    operation: 'backfill',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['UPDATE', 'INSERT INTO', 'SELECT', 'ANALYZE', 'VACUUM ANALYZE'],
    triggersOn:
      'A bulk `UpdateStmt`, or an `InsertStmt` whose select has a `fromClause` rather than a literal `valuesLists` (i.e. `INSERT ... SELECT`, not `INSERT ... VALUES`), when no later statement in the same migration runs `ANALYZE` (bare, or naming that table, or `VACUUM ANALYZE`) covering it.',
    doesNotTriggerOn:
      '`INSERT ... VALUES` with a literal values list, treated as seeding rather than a backfill. An `INSERT` with neither a `fromClause` nor a values list. When a later statement backfills the same table again, only that later one is checked — the earlier one is skipped so the table is reported once, not per statement. And when a later `ANALYZE`, targeted `ANALYZE table`, or `VACUUM ANALYZE` follows the backfill.',
    lockDetail:
      'None — the failure mode is stale planner statistics, not a blocked lock.',
    assumptions:
      'Assumes the migration file itself is where the follow-up `ANALYZE` would appear. An `ANALYZE` run separately — by deploy tooling, a scheduled job, or autovacuum finishing before anyone notices — satisfies the real requirement but isn\'t visible to a rule that only reads statements in this file, so it can flag a backfill that\'s actually fine in practice.',
  },
  MP089: {
    operation: 'type',
    impacts: ['blocks-reads', 'blocks-writes', 'table-rewrite'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['ALTER COLUMN', 'TYPE', 'COLLATE', 'SET DATA TYPE'],
    triggersOn:
      'The `AT_AlterColumnType` subcommand of `ALTER TABLE ... ALTER COLUMN ... TYPE` (or `SET DATA TYPE`, which parses to the same subtype) when the new column definition carries a `collClause` — an explicit `COLLATE`.',
    doesNotTriggerOn:
      'Non-`AlterTableStmt` statements, and any `ALTER COLUMN TYPE` with no `collClause` on the new definition — a type change that doesn\'t touch collation is left to MP007.',
    lockDetail:
      'ACCESS EXCLUSIVE — the same lock the type-change rewrite already holds, so the collation-driven index rebuilds happen inside it rather than as separate work you could schedule. Both reads and writes are blocked for the whole rewrite plus every index rebuild.',
    assumptions:
      'Assumes any explicit `COLLATE` on an `ALTER COLUMN TYPE` is a meaningful sort-order change worth flagging. It only checks for the clause\'s presence, not whether the new collation actually differs from the column\'s current one, so a redundant no-op `COLLATE` gets flagged the same as a real change.',
  },
  MP090: {
    operation: 'trigger',
    impacts: ['blocks-writes', 'queue-risk'],
    lock: 'SHARE ROW EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['CREATE TRIGGER', 'FOR EACH ROW', 'FOR EACH STATEMENT', 'AFTER INSERT', 'AFTER UPDATE'],
    triggersOn:
      '`CREATE TRIGGER` where `row === true` — the parser\'s marker for `FOR EACH ROW`, as opposed to statement-level.',
    doesNotTriggerOn:
      'Statement-level triggers (`FOR EACH STATEMENT`, the default when `row` is omitted). Also the sync trigger of an expand/contract migration on the same table, recognized when all three hold: the migration adds a column to the trigger\'s own table earlier in the file, the trigger fires on both `INSERT` and `UPDATE`, and either the trigger\'s own function — if defined in this migration — references the added column, or a later statement backfills that column on the same table.',
    lockDetail:
      'SHARE ROW EXCLUSIVE while the trigger is created — self-conflicting and blocks writes and other DDL, but not reads. On a busy table it can queue behind an existing long transaction. The lasting cost is separate from this lock: the trigger body then runs once per affected row inside every future writing transaction on the table.',
    assumptions:
      'Assumes a row-level trigger is meaningfully expensive, but a trivial function on a low-write table costs almost nothing — the rule only sees that it runs per row, not what it does. The expand/contract exemption also depends on all three signals lining up in this exact migration file; a sync trigger split across separate migrations, or backed by a function defined outside the migration, won\'t be recognized and gets flagged like any other trigger.',
  },
  MP091: {
    operation: 'privileges',
    impacts: [],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['GRANT', 'REVOKE', 'GRANT ROLE', 'ALTER TABLE', 'CREATE TABLE'],
    triggersOn:
      'A `GrantStmt` or `GrantRoleStmt` in a migration file where at least one other statement is DDL (per `isDDL`), reported once — on the first privilege statement in the file, found by checking that no earlier statement in `ctx.allStatements` was itself a `GrantStmt`/`GrantRoleStmt`.',
    doesNotTriggerOn:
      'Non-privilege statements. A migration containing only `GRANT`/`REVOKE` with no DDL at all. A migration containing only DDL with no privilege statements. And every privilege statement after the first one in the same file — those don\'t generate a second violation.',
    lockDetail:
      'None — the concern is auditability, not locking.',
    assumptions:
      'Assumes any privilege statement sharing a file with DDL is worth separating, regardless of how small either side is — a single narrowly-scoped `GRANT` next to a trivial schema tweak is flagged the same as a sweeping access change buried in a large migration.',
  },
  MP092: {
    operation: 'index',
    impacts: ['blocks-reads', 'blocks-writes', 'queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['CREATE INDEX', 'CONCURRENTLY', 'ON ONLY', 'PARTITION BY', 'ATTACH PARTITION'],
    triggersOn:
      '`CREATE INDEX` (`IndexStmt`) targeting a table this migration itself establishes as a partitioned parent — via `CREATE TABLE ... PARTITION BY`, a child\'s `PARTITION OF` naming it, or an `ATTACH PARTITION` onto it — in either of two shapes: `CONCURRENTLY` is set, or the index targets the table recursively (no `ONLY`) without `CONCURRENTLY`.',
    doesNotTriggerOn:
      '`CREATE INDEX` on a table the rule can\'t identify as a partitioned parent from this migration\'s own statements — it only reads what the file itself declares, not the database. And `CREATE INDEX ... ON ONLY parent` without `CONCURRENTLY` is explicitly exempt — that\'s the recommended first step, not the problem.',
    lockDetail:
      'ACCESS EXCLUSIVE — the same lock a plain `CREATE INDEX` takes on an ordinary table, except here it\'s held across every partition built by the same statement, not released between them, so the whole hierarchy is unavailable until the last partition\'s index finishes.',
    assumptions:
      'Assumes the migration file is the only source of truth for whether a table is a partitioned parent. A table partitioned in an earlier, separate migration isn\'t recognized, so an unsafe `CREATE INDEX` on it can pass silently, while the same operation on a table partitioned in this file gets caught correctly.',
  },
  MP093: {
    operation: 'partition',
    impacts: ['full-scan'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['PARTITION OF', 'DEFAULT', 'CREATE TABLE', 'ATTACH PARTITION'],
    triggersOn:
      '`CREATE TABLE ... PARTITION OF ... DEFAULT` — detected via `partbound.is_default === true` on the `CreateStmt`.',
    doesNotTriggerOn:
      'Non-`CreateStmt` statements. Bounded `PARTITION OF ... FOR VALUES` partitions and partitioned-parent declarations (`PARTITION BY`) don\'t set `is_default`, so they\'re left alone.',
    lockDetail:
      'None for the statement this rule flags — creating an empty default partition is fast. The lock lands later: attaching the partition those absorbed rows should have gone to forces PostgreSQL to prove none of them overlap the new bound, under ACCESS EXCLUSIVE on both the default partition and the parent, and that ATTACH fails outright if any row does overlap.',
    assumptions:
      'Assumes creating a DEFAULT partition is risky regardless of how it\'s operated — a default partition that\'s actively monitored and kept near-empty, which the rule\'s own guidance treats as reasonable, is flagged the same as one nobody is watching, since the rule sees the DDL, not runtime row counts.',
  },
  MP094: {
    operation: 'partition',
    impacts: ['blocks-reads', 'blocks-writes', 'full-scan'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['ATTACH PARTITION', 'CHECK', 'NOT VALID', 'VALIDATE CONSTRAINT'],
    triggersOn:
      'The `AT_AttachPartition` subcommand of `ALTER TABLE` when the partition being attached has no `CHECK` constraint added earlier in the same migration — via `ALTER TABLE ... ADD CONSTRAINT` or inline in its own `CREATE TABLE`.',
    doesNotTriggerOn:
      'Non-`AlterTableStmt` statements, or ones without an `AT_AttachPartition` command. An attach where the incoming table already has a `CHECK` constraint added earlier in the file — `hasCheckConstraintOn` only requires a `CONSTR_CHECK` constraint to exist, not that its expression actually implies the partition bound.',
    lockDetail:
      'ACCESS EXCLUSIVE, held on both the incoming table and the parent for the whole validation scan — the entire partitioned table, every partition, is unavailable while PostgreSQL proves the incoming rows fit the bound.',
    assumptions:
      'Assumes any `CHECK` constraint on the incoming table means PostgreSQL will skip the scan, but it only checks that a `CONSTR_CHECK` exists, not that the expression matches the partition bound. A CHECK that doesn\'t actually imply the bound satisfies this rule while PostgreSQL still performs the full scan at ATTACH time.',
  },
  MP095: {
    operation: 'table',
    impacts: ['blocks-reads', 'blocks-writes', 'table-rewrite'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['SET TABLESPACE', 'ALTER TABLE', 'ALTER INDEX'],
    triggersOn:
      'The `AT_SetTableSpace` subcommand of `ALTER TABLE ... SET TABLESPACE` or `ALTER INDEX ... SET TABLESPACE` — both parse as `AlterTableStmt`, distinguished by `objtype`.',
    doesNotTriggerOn:
      'Non-`AlterTableStmt` statements, and `ALTER TABLE`/`ALTER INDEX` statements whose commands don\'t include an `AT_SetTableSpace` subtype.',
    lockDetail:
      'ACCESS EXCLUSIVE, held from the first byte copied to the last — the relation is unavailable for reads and writes for the entire copy, and duration scales with size and disk throughput rather than anything the migration can bound.',
    assumptions:
      'Assumes the relation is large enough for the copy to matter. On a small table or index the same statement finishes in milliseconds, and without `--database-url` the rule has no way to check size, so it flags a tablespace move on an empty table the same as one on a 500 GB table.',
  },
  MP096: {
    operation: 'view',
    impacts: ['blocks-writes'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['CREATE MATERIALIZED VIEW', 'WITH DATA', 'WITH NO DATA', 'REFRESH MATERIALIZED VIEW'],
    triggersOn:
      'A `CreateTableAsStmt` node whose `objtype` is `OBJECT_MATVIEW` and whose `into.skipData` is not `true`. `skipData` is set only by an explicit `WITH NO DATA`, so its absence is read as the `WITH DATA` default — which means the rule fires on the ordinary case where the migration wrote no data clause at all.',
    doesNotTriggerOn:
      '`CREATE TABLE ... AS`, which parses to the same `CreateTableAsStmt` node but carries an `objtype` other than `OBJECT_MATVIEW`. `WITH NO DATA` sets `into.skipData === true` and returns null. Nothing else stands it down: no catalog is consulted, no size threshold is applied, and there is no dependency on `--database-url`.',
    lockDetail:
      'The new matview is held at ACCESS EXCLUSIVE for the whole build, but nothing can contend for an object that did not exist a moment ago. The lock that matters is on the other side: the view query holds ACCESS SHARE on every source table until it completes, and the migration transaction stays open for that entire time, extending every lock it already holds and pinning `xmin` so vacuum cannot clean up dead rows anywhere in the database.',
    assumptions:
      'The rule has no idea how expensive the query is. It reads no table stats and applies no threshold, so a matview over a ten-row lookup table produces the same finding as an aggregate over a billion-row fact table. It also cannot distinguish a deliberate `WITH DATA` from an omitted data clause — both parse identically — so it cannot tell a considered choice from an accident.',
    deployNote:
      'The suggested `WITH NO DATA` form leaves the view unqueryable until something refreshes it (`materialized view ... has not been populated`), and that first `REFRESH` cannot use `CONCURRENTLY`. The refresh therefore has to be sequenced before anything reads the view, which is a change to whatever runs next, not just to this statement.',
  },
  MP097: {
    operation: 'constraint',
    impacts: ['data-loss', 'deploy-incompat'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    triggerKeywords: ['DROP INDEX', 'DROP CONSTRAINT', 'CASCADE', 'PRIMARY KEY', 'UNIQUE', 'USING INDEX'],
    triggersOn:
      'Two shapes. First, a `DropStmt` with `removeType` `OBJECT_INDEX` whose index name ends in `_pkey`, `_key`, `_unique` or `_uniq` AND for which `constraintOwning()` returns an owner — either an `ExistingIndex` in the live catalog with `isConstraintBacked` true (`pg_constraint.conindid` points at it), or an `AT_AddConstraint` earlier in the same migration whose `Constraint.indexname` or `Constraint.conname` matches. Second, an `AlterTableStmt` carrying an `AT_DropConstraint` whose `name` ends in `_key`, `_unique` or `_uniq`. `drop.behavior === DROP_CASCADE` only changes which message is emitted.',
    doesNotTriggerOn:
      'A `DROP INDEX` whose name carries none of the four suffixes, and — the case the rule was rewritten for — a suffixed name that nothing actually owns: a plain `CREATE UNIQUE INDEX projects_slug_key` has no `pg_constraint` row, so with no catalog and no in-file `ADD CONSTRAINT` the rule stays silent and the drop is left alone. `DROP CONSTRAINT` on a name ending `_pkey` is skipped and handed to MP055. Catalog-sourced ownership needs `--database-url`; without it only an `ADD CONSTRAINT` in the file can establish it.',
    lockDetail:
      'Both branches take ACCESS EXCLUSIVE on the table — `DROP INDEX` without `CONCURRENTLY` and `ALTER TABLE ... DROP CONSTRAINT` alike. For the `DROP INDEX` branch the lock is beside the point: the statement is predicted to fail with `cannot drop index ... because constraint ... requires it`, so the migration aborts there with everything before it already applied. The `DROP CONSTRAINT` branch really does hold the lock, but only for a catalog update; the cost is what stops being guaranteed afterwards.',
    assumptions:
      'The suffix test gates everything and runs before the ownership lookup, so a constraint-owned index named outside the `_pkey`/`_key`/`_unique`/`_uniq` convention is a false negative on both branches. The `DROP CONSTRAINT` branch is pure name matching with no ownership check at all — `DROP CONSTRAINT orders_status_key` fires even when that name belongs to a `CHECK` constraint, and a unique constraint named `unique_email` is missed entirely. Catalog ownership is only as current as the connected database: an index adopted into a constraint by a migration not yet applied there reads as unowned.',
    deployNote:
      'The index-swap alternative needs `CREATE UNIQUE INDEX CONCURRENTLY` first, which cannot run inside a transaction block, and only then the combined `DROP CONSTRAINT` / `ADD CONSTRAINT ... USING INDEX` — so it is at least two migrations, not one statement.',
  },
  MP098: {
    operation: 'schema',
    impacts: ['deploy-incompat'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'multi-step',
    triggerKeywords: ['SET SCHEMA', 'ALTER TABLE', 'ALTER FUNCTION', 'ALTER SEQUENCE', 'SEARCH_PATH'],
    triggersOn:
      'Any `AlterObjectSchemaStmt` node, with no further condition. `objectType` is read only to label the message (`OBJECT_TABLE`, `OBJECT_VIEW`, `OBJECT_MATVIEW`, `OBJECT_SEQUENCE`, `OBJECT_FUNCTION`, `OBJECT_PROCEDURE`, `OBJECT_TYPE`, `OBJECT_DOMAIN`, `OBJECT_FOREIGN_TABLE`, falling back to `Object`), and the name comes from `relation.relname` or, for non-relations, from `object` via `List`, `ObjectWithArgs.objname`, or `String`.',
    doesNotTriggerOn:
      'Nothing. There is no early return past the node check, no catalog lookup, no size or traffic gate — every `SET SCHEMA` in the file is reported, including a move of a table created three statements earlier in the same migration.',
    lockDetail:
      '`ALTER ... SET SCHEMA` takes ACCESS EXCLUSIVE on the object, but only long enough to update `pg_class.relnamespace`. It rewrites nothing and is over in milliseconds, so the lock is not the risk. The risk is that the old schema-qualified path stops resolving at the instant of commit, with no overlap window on either side.',
    assumptions:
      'The rule cannot see whether anything references the object by its old qualified name, so moving a brand-new table nothing has ever queried draws the same finding as moving `public.users`. It also cannot know any role\'s `search_path`, which is what decides whether unqualified references survive — that is per-role and per-session, so the migration user\'s path says nothing about the application user\'s, and testing the move by hand in `psql` can be actively misleading.',
    deployNote:
      'The old path and the new one are never both valid, so a rolling deploy where old and new application versions overlap has no safe instant. The compatibility view in the safe alternative is what creates the window, and removing it is a separate later migration.',
  },
  MP099: {
    operation: 'privileges',
    impacts: ['data-loss'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['SECURITY DEFINER', 'SET search_path', 'CREATE FUNCTION', 'CREATE PROCEDURE', 'REVOKE EXECUTE'],
    triggersOn:
      'A `CreateFunctionStmt` whose `options` contain a `DefElem` with `defname` `security` and `arg.Boolean.boolval === true`, and contain no `DefElem` with `defname` `set` whose `arg.VariableSetStmt.name` is `search_path`. `is_procedure` only selects the word `Procedure` or `Function` in the message. `CREATE OR REPLACE FUNCTION` parses to the same node and is covered.',
    doesNotTriggerOn:
      'A function with no `security` option, or an explicit `SECURITY INVOKER` (`boolval` false). A function that carries a `SET search_path` clause of any kind. An unrelated `SET` clause such as `SET work_mem` does not satisfy the pin check and does not suppress the finding. `ALTER FUNCTION ... SECURITY DEFINER` on an already-existing function parses as a different node and is never seen. No catalog is consulted, so this fires with or without `--database-url`.',
    lockDetail:
      'No table lock at all. `CREATE FUNCTION` writes a `pg_proc` row and touches no user table. This rule is about privilege escalation rather than blocking: the body runs later, with the owner\'s rights, against whatever the caller\'s `search_path` made its unqualified names resolve to.',
    assumptions:
      'The function body is never parsed. A body that schema-qualifies every single reference is still flagged, because the rule cannot prove that it does — and the `SET` clause is the guarantee while qualification is belt and braces. Only the presence of a `search_path` `SET` is checked, never its value, so `SET search_path = public` counts as pinned even though `public` is the schema an attacker is most likely to be able to write to. In the other direction, the rule cannot see who will own the function or who holds `EXECUTE`, so it cannot separate a superuser-owned escalation path from a `SECURITY DEFINER` function owned by an unprivileged role.',
  },
  MP100: {
    operation: 'index',
    impacts: ['full-scan'],
    lock: 'none',
    remediation: 'informational',
    triggerKeywords: ['CREATE INDEX', 'CREATE UNIQUE INDEX', 'CONCURRENTLY', 'USING BTREE', 'PG_INDEX'],
    triggersOn:
      'An `IndexStmt` where `ctx.existingIndexes` — the live catalog indexes for the table the engine resolved as target — contains one that covers it. Covering means: the same access method (`accessMethod`, defaulting to `btree`), the new key list being a prefix of the existing `keyColumns` after `normalizeKey()` lowercases and strips quotes, and, when the new index is `unique`, the existing one being unique with exactly the same number of key columns.',
    doesNotTriggerOn:
      'Every run without `--database-url`: `existingIndexes` is empty and the rule returns null on the first line (`requiresDatabaseUrl` is set). It also stands down when the new index has a `whereClause`, when `indexKeyColumns()` returns null because some `IndexElem` has no `name` (an expression key), when the covering candidate `isPartial`, when the access methods differ, and when a new `UNIQUE` index is matched against a non-unique or differently-wide index.',
    lockDetail:
      'No lock claim of its own. `CREATE INDEX` takes SHARE and `CREATE INDEX CONCURRENTLY` takes SHARE UPDATE EXCLUSIVE, and this rule fires on both without distinguishing them — it is about the index being unnecessary, not about how it is built. MP001, MP101 and MP104 cover the locking and the duration.',
    assumptions:
      'Redundancy is judged from key columns alone. The migration side reads only `IndexElem.name`, so `ASC`/`DESC`, `NULLS FIRST`, opclass, collation and storage parameters are invisible — an index that exists purely to give the planner a different sort order is reported as redundant. `INCLUDE` columns are excluded from the catalog `keyColumns`, so a new covering index that differs only by its `INCLUDE` list also matches. Nothing is size-aware: a narrow `(tenant_id)` index that is genuinely much smaller and hotter than the `(tenant_id, created_at)` covering it is still flagged. Catalog tables are matched by bare relation name, so same-named tables in different schemas are not separated, and the catalog reflects the database you connected to rather than the one the migration will run against.',
  },
  MP101: {
    operation: 'index',
    impacts: ['blocks-writes', 'full-scan'],
    lock: 'SHARE',
    remediation: 'informational',
    triggerKeywords: ['CREATE INDEX', 'CONCURRENTLY', 'PG_STAT_USER_TABLES', 'N_TUP_INS', 'N_TUP_UPD'],
    triggersOn:
      'An `IndexStmt` on a table for which the catalog returned `TableFacts`, where write traffic clears one of two bars: `writesPerSecond()` — `(inserts + updates + deletes) / windowSeconds` — at `50` or above, or, when `windowSeconds` is undefined, a raw total of `5,000,000` row writes since the counters were last reset. `idx.concurrent` only chooses the closing sentence of the message.',
    doesNotTriggerOn:
      'Any run without `--database-url`: no `ctx.tableFacts` means an immediate null (`requiresDatabaseUrl` is set). A table below `50` writes/sec is silent regardless of how large the absolute counters are, because the rate branch wins whenever `windowSeconds` is known. Nothing about the index itself is checked — not the access method, not the key columns, not whether the table is large.',
    lockDetail:
      'A plain `CREATE INDEX` takes SHARE, which blocks every `INSERT`, `UPDATE` and `DELETE` on the table until the build finishes — on the busiest table in the system by construction, since write traffic is what the rule selected for. `CREATE INDEX CONCURRENTLY` takes SHARE UPDATE EXCLUSIVE instead and blocks no writes, but has to track everything committed while it runs, so it takes longer here than it would anywhere else.',
    assumptions:
      '`50` writes/sec is a fixed constant, not a percentile of this server. A machine that absorbs `500` writes/sec comfortably and one saturated at `40` are judged against the same number. The counters are cumulative since the last stats reset and the window comes from `pg_stat_database.stats_reset`, so a batch job that ran once months ago is averaged in as steady traffic, and a table that only became hot yesterday looks quiet. The rule measures the cost side only: it has no way to know what the index is worth, and it cannot tell whether the indexed column is one that `UPDATE`s actually touch, which is what decides the heap-only-tuple penalty.',
    deployNote:
      '`CREATE INDEX CONCURRENTLY`, the build this rule points at, cannot run inside a transaction block, so it has to be its own migration or run outside the tool\'s transaction wrapper.',
  },
  MP102: {
    operation: 'table',
    impacts: ['table-rewrite', 'blocks-reads', 'blocks-writes'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'informational',
    triggerKeywords: ['VACUUM FULL', 'CLUSTER', 'ALTER COLUMN TYPE', 'SET LOGGED', 'SET UNLOGGED', 'PG_TOTAL_RELATION_SIZE'],
    triggersOn:
      'Whatever `classifyRewrite()` recognises as a full rewrite: a `VacuumStmt` carrying a `full` `DefElem`, a `ClusterStmt`, or an `AlterTableStmt` with an `AT_AlterColumnType`, `AT_SetLogged`, `AT_SetUnLogged`, or an `AT_AddColumn` whose default expression contains a volatile call (`now`, `random`, `nextval`, `clock_timestamp`, `timeofday`, `gen_random_uuid`, `uuid_generate_v4`, `statement_timestamp`) — or any default at all when `pgVersion < 11`. The table then has to be at least `1_000_000_000` bytes (1 GB) by `TableStats.totalBytes`. `VACUUM` and `CLUSTER` resolve stats through `lookupTableStats()` on the name in the statement, because the engine does not extract targets for them.',
    doesNotTriggerOn:
      'Anything `classifyRewrite()` does not recognise, including `REINDEX`, which is out of scope on purpose: it needs a second copy of the index rather than the table, and the table stats do not separate index size from total size, so the arithmetic would be wrong. Tables under `1 GB`. Every run without `--database-url`, where no `TableStats` exists (`requiresDatabaseUrl` is set).',
    lockDetail:
      '`VACUUM FULL`, `CLUSTER`, and every rewriting `ALTER TABLE` form in scope hold ACCESS EXCLUSIVE for the entire copy, blocking reads as well as writes. That is what makes running out of space expensive rather than merely annoying: the rollback arrives after the full lock duration has already been paid, and nothing has changed.',
    assumptions:
      'Free space is normally unknown. Released PostgreSQL exposes no function for it, so `ctx.cluster.disk.availableBytes` is undefined on effectively every server and the message says so and defers to `df -h` on the data volume; real headroom numbers appear only where an operator has defined their own `pg_tablespace_avail(name)` returning bytes, which MigrationPilot feature-detects. Where the figure does exist, `1.5` times the required space is an arbitrary line between "tight" and "fine". The doubling estimate is coarse in its own right: it ignores the WAL the rewrite generates and any concurrent traffic, and `totalBytes` bundles heap, indexes and TOAST, which a rewrite does not reproduce in the same proportions.',
    applicabilityNote:
      'Headroom numbers require a `pg_tablespace_avail(name)` function on the server. Core PostgreSQL has none as of PG18, so the normal output reports the sizes and hands the free-space check back to the operator.',
  },
  MP103: {
    operation: 'table',
    impacts: ['replication'],
    lock: 'none',
    remediation: 'manual',
    triggerKeywords: ['UPDATE', 'DELETE', 'INSERT ... SELECT', 'REINDEX', 'PG_STAT_REPLICATION', 'MAX_SLOT_WAL_KEEP_SIZE'],
    triggersOn:
      '`ctx.cluster.replication` must exist with `replicaCount` above `0`. The statement then has to be WAL-heavy: anything `classifyRewrite()` recognises, any `IndexStmt`, any `ReindexStmt`, or an `UpdateStmt` / `DeleteStmt` / `InsertStmt` whose target comes from `dmlTargetTable()`. Finally the table has to be large — `totalBytes` of at least `1_000_000_000` or `rowCount` of at least `5_000_000`, either one on its own being enough.',
    doesNotTriggerOn:
      'A cluster with no connected standby in `pg_stat_replication`, which is also exactly what a run without `--database-url` looks like (`requiresDatabaseUrl` is set). Tables under both size bars. An `INSERT ... VALUES`, which is excluded explicitly by requiring a non-empty `selectStmt.SelectStmt.fromClause`. Statements outside the WAL-heavy set, and DML whose table has no stats entry.',
    lockDetail:
      'No lock of its own — the rule deliberately spans operations with unrelated lock footprints, from ACCESS EXCLUSIVE for a rewrite through SHARE for a plain index build down to ROW EXCLUSIVE for a backfill. What they share is WAL volume, and the cost it reports is not a lock at all: a standby replays with a single startup process, so work the primary spread across many backends arrives serially at the replica.',
    assumptions:
      'There is no model of how much WAL the statement will produce and no estimate of lag in seconds — the finding is "this is WAL-heavy and standbys are attached", nothing more precise. `maxLagBytes` is the lag at analysis time rather than during the operation, and it is absent entirely unless the connecting role holds `pg_monitor` or `pg_read_all_stats`. `slotCount` counts every slot on the server, including logical decoding slots for CDC that have nothing to do with the streaming replicas. Replica hardware, `max_slot_wal_keep_size`, and whether anything actually reads from the replicas are all invisible to it.',
    applicabilityNote:
      'The replay-lag figure in the message needs `pg_monitor` or `pg_read_all_stats` on the connecting role. Without those privileges the replica count still works and the lag is simply left out.',
    deployNote:
      'The batching the rule points at only helps if replicas can catch up between batches, which needs a commit per batch — so it cannot live inside a single migration transaction.',
  },
  MP104: {
    operation: 'index',
    impacts: ['blocks-writes', 'full-scan'],
    lock: 'SHARE',
    remediation: 'informational',
    triggerKeywords: ['CREATE INDEX', 'CONCURRENTLY', 'MAINTENANCE_WORK_MEM', 'MAX_PARALLEL_MAINTENANCE_WORKERS', 'PG_STAT_PROGRESS_CREATE_INDEX'],
    triggersOn:
      'An `IndexStmt` on a table whose `TableStats.rowCount` is above `0`, where the slow end of the estimated build time crosses `300` seconds. The estimate divides the row count by `125_000` rows/sec for the slow end and `2_000_000` rows/sec for the fast end, multiplying both by `3` when `idx.concurrent` is set — which puts the trigger at roughly `37.5M` rows for a plain build and `12.5M` for `CONCURRENTLY`.',
    doesNotTriggerOn:
      'Every run without `--database-url`, since the row count is the whole input (`requiresDatabaseUrl` is set). A `rowCount` of `0` or less, which is what `pg_class.reltuples` reports for a table that has never been analyzed. Anything whose slow end lands under `300` seconds. Nothing about the index is examined beyond `concurrent`, `idxname` and `relation`, so key width and access method never enter into it.',
    lockDetail:
      'A plain `CREATE INDEX` holds SHARE for the whole estimated window, blocking every write on the table. `CONCURRENTLY` swaps that for SHARE UPDATE EXCLUSIVE and blocks no writes, but holds a snapshot throughout, which stops vacuum from removing dead rows anywhere in the database — one long build can bloat every other table — and leaves an `INVALID` index behind if it fails or is cancelled.',
    assumptions:
      'The two ends of the estimate differ by a factor of `16`, on purpose: the fast figure is a narrow integer key on a warm uncontended machine, the slow one a wide unique key on cloud storage under load. Key width, the real `maintenance_work_mem`, parallel workers and I/O decide where an actual build lands, and none of them feed the arithmetic — `maintenance_work_mem` and `max_parallel_maintenance_workers` are quoted in the message but do not move the number. The `3x` multiplier for `CONCURRENTLY` is a rule of thumb for two table passes plus the waits between them. `reltuples` is itself an estimate maintained by analyze, so it can be badly stale on a table that is filling fast.',
    deployNote:
      '`CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, and the `SET maintenance_work_mem` the rule suggests only takes effect in the session that issues it, so both have to be arranged around the migration rather than inside it.',
  },
  MP105: {
    operation: 'table',
    impacts: ['blocks-writes', 'blocks-reads'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    extension: 'TimescaleDB',
    triggerKeywords: ['ALTER TABLE', 'CREATE INDEX', 'RENAME', 'HYPERTABLE', 'TRANSACTION_PER_CHUNK', 'CREATE_HYPERTABLE'],
    triggersOn:
      '`ctx.tableExtensions.isHypertable` must be true, which only the TimescaleDB catalog can establish. Then either an `IndexStmt` — reported whether or not `concurrent` is set, with a different lead sentence for each, since TimescaleDB does not support `CREATE INDEX CONCURRENTLY` on a hypertable at all — or an `AlterTableStmt` or `RenameStmt`, which get the chunk fan-out message. `chunkCount` and `compressionEnabled` come from the same catalog row and only shape wording.',
    doesNotTriggerOn:
      'Every run without `--database-url`: hypertable membership is not in the migration file, and a `create_hypertable()` call in some other file is out of scope by design (`requiresDatabaseUrl` is set). Statement shapes other than `IndexStmt`, `AlterTableStmt` and `RenameStmt` — a `DELETE` on a hypertable belongs to MP106, not here. Ordinary tables and Citus or partman tables, which carry different flags.',
    lockDetail:
      'For the `ALTER TABLE` branch, ACCESS EXCLUSIVE on the hypertable and on every chunk, all held until the statement commits, so the blocking window is set by the slowest chunk rather than by the statement. The `CREATE INDEX` branch takes SHARE across the whole set inside one transaction, unless `WITH (timescaledb.transaction_per_chunk)` splits it so only one chunk is blocked at a time.',
    assumptions:
      'The chunk count is whatever the catalog held at analysis time; on an actively ingesting hypertable there are more chunks by the time the migration runs. The rule does not separate an `ALTER` that only touches the catalog from one that rewrites every chunk — both get the same finding — and it cannot see chunk sizes, so `2` chunks of a terabyte each and `2,000` tiny ones are the same number to it. The claim that `CONCURRENTLY` is unsupported comes from TimescaleDB\'s documented behaviour, not from a version check against the installed extension.',
    applicabilityNote:
      'Hypertable membership, chunk count and compression state are read from `timescaledb_information.hypertables`, with `_timescaledb_catalog.hypertable` as a fallback on versions where the view columns differ.',
    deployNote:
      '`WITH (timescaledb.transaction_per_chunk)` commits per chunk, so it cannot run inside the migration transaction, and a failure partway leaves some chunks holding the index while the hypertable index is marked invalid. It also does not work for `CREATE UNIQUE INDEX`.',
  },
  MP106: {
    operation: 'backfill',
    impacts: ['replication'],
    lock: 'ROW EXCLUSIVE',
    remediation: 'manual',
    extension: 'TimescaleDB',
    triggerKeywords: ['DELETE', 'DROP_CHUNKS', 'ADD_RETENTION_POLICY', 'HYPERTABLE', 'INTERVAL'],
    triggersOn:
      'A `DeleteStmt` whose target table (via `dmlTargetTable()`) resolves through `ctx.tableExtensions` or `lookupTableExtensions()` to a hypertable with a known `timeColumn`, and whose `whereClause` contains an `A_Expr` whose operator name is `<`, `<=`, `>` or `>=` with a `ColumnRef` on either side whose last field matches that time column. The search recurses through the whole clause tree, so the comparison can sit inside an `AND` or `OR`.',
    doesNotTriggerOn:
      'Every run without `--database-url` — both hypertable membership and the time dimension come from the TimescaleDB catalog (`requiresDatabaseUrl` is set). A hypertable whose `timeColumn` the server does not report: the rule stays silent rather than guess which column is the dimension. A `DELETE` with no `whereClause`, which is MP067\'s. A `WHERE` that filters only on something else, such as `device_id`. Non-hypertables.',
    lockDetail:
      '`DELETE` takes ROW EXCLUSIVE on the chunks it touches, which blocks nothing ordinary traffic does — and that is exactly the point of the rule. Nothing is blocked; this is simply the most expensive way to remove the rows, a WAL record and a dead tuple each, with the space not returning until vacuum has been through. `drop_chunks()` takes ACCESS EXCLUSIVE on each chunk it removes, briefly, and unlinks the files.',
    assumptions:
      'The operator test is purely structural and never looks at direction or bound. Any `<`, `<=`, `>` or `>=` against the time column counts, so `WHERE time > now() - interval \'1 hour\'` — a targeted delete of recent rows, not a retention sweep — is flagged as readily as a retention bound. `BETWEEN` parses as a different `A_Expr` with the name `BETWEEN` and is missed, as is `=`. The rule also has no idea whether the range lines up with chunk boundaries, and `drop_chunks()` only removes chunks whose entire range falls outside the bound, so the suggested replacement is not row-for-row equivalent at the boundary chunk.',
  },
  MP107: {
    operation: 'table',
    impacts: ['blocks-writes', 'blocks-reads', 'deploy-incompat'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'manual',
    extension: 'Citus',
    triggerKeywords: ['ALTER TABLE', 'CITUS_TABLES', 'DISTRIBUTION COLUMN', 'CREATE_DISTRIBUTED_TABLE', 'MULTI_SHARD_MODIFY_MODE'],
    triggersOn:
      '`ctx.tableExtensions.isCitusDistributed` true together with an `AlterTableStmt`. Every such `ALTER` is reported. The message escalates to a predicted failure when one of the `AlterTableCmd` entries has subtype `AT_AlterColumnType` or `AT_DropColumn` and its `name` matches `citusDistributionColumn` case-insensitively, because Citus refuses those rather than propagating them.',
    doesNotTriggerOn:
      'Every run without `--database-url`: distribution lives only in Citus metadata (`requiresDatabaseUrl` is set). Anything that is not an `AlterTableStmt`, so `CREATE INDEX` on a distributed table is not covered here. Citus reference tables, which are replicated rather than sharded and are deliberately kept out of `isCitusDistributed` because their cost profile is different. Plain local tables on the coordinator.',
    lockDetail:
      'ACCESS EXCLUSIVE on the coordinator\'s table, plus the same lock on every shard on every worker, all held until the statement finishes. Because every query for that table passes through the coordinator, one slow worker blocks the whole cluster for that table rather than just its own shards.',
    assumptions:
      'Every propagated `ALTER` gets the same finding: the rule does not separate a metadata-only `ADD COLUMN` from something that rewrites each shard, and it has no shard sizes and no worker count — `citusShardCount` counts shards, not the nodes they sit on. The distribution-column check is exact single-column string matching, so a multi-column or expression distribution key, or a subcommand that reaches the column indirectly, is not recognised as blocked. The claim that Citus refuses the statement comes from documented behaviour, not from a version check on the installed extension.',
    applicabilityNote:
      'Distribution, distribution column and shard count are read from the `citus_tables` view, falling back to `pg_dist_partition` and `pg_dist_shard` on older Citus versions.',
  },
  MP108: {
    operation: 'partition',
    impacts: ['data-loss'],
    lock: 'none',
    remediation: 'manual',
    extension: 'pg_partman',
    triggerKeywords: ['PARTITION OF', 'ATTACH PARTITION', 'DETACH PARTITION', 'PART_CONFIG', 'RUN_MAINTENANCE', 'PREMAKE'],
    triggersOn:
      'Either a `CreateStmt` that has a `partbound` and names a parent in `inhRelations[0].RangeVar.relname`, or an `AlterTableStmt` carrying an `AT_AttachPartition` or `AT_DetachPartition` subcommand whose parent is `relation.relname` — where that parent resolves through `lookupTableExtensions()` to a `TableExtensionInfo` with `isPartmanParent` true, meaning it appears in pg_partman\'s `part_config`.',
    doesNotTriggerOn:
      'Every run without `--database-url`: `part_config` is the only thing that says a parent is managed, so without it a `CREATE TABLE ... PARTITION OF` reads as ordinary partition DDL (`requiresDatabaseUrl` is set). A `CreateStmt` with no `partbound`, or one with no `inhRelations` entry to name the parent. Parents absent from `part_config`. Every other statement shape, including a `DROP TABLE` on a child partman believes it owns.',
    lockDetail:
      'No lock claim. `ATTACH PARTITION` takes SHARE UPDATE EXCLUSIVE on the parent and ACCESS EXCLUSIVE on the table being attached, and a non-concurrent `DETACH` takes ACCESS EXCLUSIVE on the parent — but none of that is what the rule reports. The finding is a bookkeeping divergence: `part_config` will not record the partition, and the collision surfaces later on a `run_maintenance` run rather than during the migration.',
    assumptions:
      'The rule cannot compare your partition\'s range against what partman is about to pre-create, so it cannot distinguish a genuine collision from a manual partition sitting harmlessly outside the premake window — every hand-written partition on a managed parent is reported. Parents are matched by bare relation name against what was read from `part_config`, so the same parent name in two schemas is ambiguous. The configuration quoted in the message (control column, interval, premake, retention) is each optional and is used for wording only, never for a decision, so a partly-readable `part_config` still produces the same finding.',
  },
  MP109: {
    operation: 'index',
    impacts: ['full-scan'],
    lock: 'none',
    remediation: 'manual',
    extension: 'pgvector',
    triggerKeywords: ['USING HNSW', 'USING IVFFLAT', 'EF_CONSTRUCTION', 'LISTS', 'VECTOR_COSINE_OPS'],
    triggersOn:
      'An `IndexStmt` whose `accessMethod` lowercases to `hnsw` or `ivfflat`, where the `DefElem` names collected from `options` are missing at least one expected parameter — `m` and `ef_construction` for HNSW, `lists` for IVFFlat. Supplying only one of the two HNSW parameters still fires, and the message names whichever is missing.',
    doesNotTriggerOn:
      'Any other access method, so B-tree, GIN, GiST and BRIN indexes are untouched. An HNSW index that sets both `m` and `ef_construction`, or an IVFFlat index that sets `lists`. The parameter values are never inspected, only the presence of the keys, so `WITH (lists = 1)` silences it. This is the one rule in the MP100 block with no `requiresDatabaseUrl`, so it never stands down for want of a connection.',
    lockDetail:
      'No lock finding. This is about build-time parameters rather than how the build is taken — MP104 and MP112 cover duration, MP001 covers `CONCURRENTLY`. The reason it belongs in migration review is that these parameters cannot be altered afterwards: changing `m`, `ef_construction` or `lists` means dropping and rebuilding the whole index, a full pass over every row in the table.',
    assumptions:
      'The rule cannot know your recall target, your vector dimensions, or how large the table will eventually be, so it asks for a deliberate choice rather than checking that the choice is good — `WITH (m = 1, ef_construction = 1)` passes. The IVFFlat sizing number appears only when `ctx.tableStats.rowCount` is available, and it applies pgvector\'s own formula (`rows / 1000` up to `1,000,000` rows, `sqrt(rows)` above) to the row count today, which is the wrong basis for a table still filling up. It also fires alongside MP050 on an IVFFlat index, which is intentional rather than a duplicate.',
    applicabilityNote:
      'Works from the SQL text alone — the absence of a `WITH` clause is visible without a database. Production context only makes the IVFFlat message more specific, turning the formula into a number.',
  },
  MP110: {
    operation: 'partition',
    impacts: ['blocks-writes', 'blocks-reads', 'queue-risk'],
    lock: 'ACCESS EXCLUSIVE',
    remediation: 'multi-step',
    triggerKeywords: ['ALTER TABLE', 'CREATE INDEX', 'ATTACH PARTITION', 'MAX_LOCKS_PER_TRANSACTION', 'ON ONLY', 'PG_INHERITS'],
    triggersOn:
      '`ctx.tableFacts` with `relKind` of `p` and a `partitionCount` of `20` or more, plus a statement that fans out: an `AlterTableStmt`, reported as `ALTER TABLE`, or a non-concurrent `IndexStmt`, reported as `CREATE INDEX`. The lock named in the message is whatever `ctx.lock.lockType` classified for that statement, not a value this rule decides.',
    doesNotTriggerOn:
      'Every run without `--database-url` — nothing in the file says how many partitions exist, and that count is the entire finding (`requiresDatabaseUrl` is set). Ordinary tables, where `relKind` is not `p`, and parents with fewer than `20` partitions. Parents an extension manages: `isHypertable` or `isPartmanParent` short-circuits to null so MP105 and MP108 can say something more specific. `CREATE INDEX CONCURRENTLY`, for which `fanoutOperation()` returns null, since PostgreSQL rejects concurrent builds on a partitioned parent anyway.',
    lockDetail:
      'ACCESS EXCLUSIVE for the `ALTER TABLE` case, taken on the parent and on every partition and held until the statement commits; a plain `CREATE INDEX` takes SHARE with the same fan-out. Two consequences follow from the count rather than the statement: the blocking window is set by the slowest partition, and the lock table needs an entry per partition, so a wide enough parent can exhaust `max_locks_per_transaction` and fail outright.',
    assumptions:
      '`20` partitions is a flat cutoff with no relationship to the server\'s `max_locks_per_transaction`, to partition sizes, or to how busy any of them are — `21` empty daily partitions trip it and `19` partitions of a terabyte each do not. `partitionCount` counts direct children from `pg_inherits`, so a sub-partitioned tree is undercounted at the top level. The rule does not separate a metadata-only `ALTER` from one that rewrites every partition, and it never reads `relation.inh`, so `ALTER TABLE ONLY parent` — which does not recurse — is reported exactly like the recursing form.',
    deployNote:
      'The per-partition alternative is a sequence: `CREATE INDEX CONCURRENTLY` on each partition, each outside a transaction block, then `CREATE INDEX ... ON ONLY` the parent, then one `ALTER INDEX ... ATTACH PARTITION` per child. The parent index stays invalid until every partition has a matching index attached.',
  },
  MP111: {
    operation: 'table',
    impacts: ['deploy-incompat'],
    lock: 'none',
    remediation: 'multi-step',
    extension: 'TimescaleDB',
    triggerKeywords: ['ALTER COLUMN TYPE', 'SET STORAGE', 'ENABLE ROW LEVEL SECURITY', 'COLUMNSTORE', 'COMPRESSION_ENABLED', 'HYPERTABLE'],
    triggersOn:
      '`ctx.tableExtensions.isHypertable` true, `compressionEnabled` strictly `true`, and an `AlterTableStmt` containing a subcommand in the blocked set: `AT_AlterColumnType`, `AT_SetStorage`, `AT_EnableRowSecurity`, `AT_DisableRowSecurity`, `AT_ForceRowSecurity`, `AT_NoForceRowSecurity`. The first match in `cmds` wins, and its `name` supplies the column named in the message.',
    doesNotTriggerOn:
      'Every run without `--database-url` — the identical `ALTER` against an uncompressed hypertable is perfectly legal, so guessing would be wrong (`requiresDatabaseUrl` is set). A hypertable whose `compressionEnabled` is `false` or undefined, which the strict `!== true` test treats the same way. Hypertable `ALTER` forms outside the six blocked subtypes, which fall through to MP105. Ordinary tables.',
    lockDetail:
      'No lock, because the statement never gets far enough to hold one usefully — TimescaleDB rejects it with `operation not supported on hypertables that have columnstore enabled`. The migration stops at that statement with everything before it already applied, which is why this is critical rather than a warning: the outcome is known, not merely likely.',
    assumptions:
      'The blocked list is a fixed set of six subtypes taken from TimescaleDB\'s documented restrictions rather than from the installed extension\'s version, so a release that lifts one of them, or adds another, is not tracked. `compression_enabled` is a hypertable-level policy flag, so a hypertable with the columnstore enabled but no chunks actually converted yet is still reported. And the flag is read from the database you connected to, which may not be the one the migration will run against.',
    deployNote:
      'Getting the change through is a five-step procedure — remove the columnstore policy, convert compressed chunks back to rowstore, disable the columnstore, apply the `ALTER`, then re-enable and restore the policy. Two of those steps move every row in the hypertable, so it belongs in its own maintenance window rather than inside a migration run.',
  },
  MP112: {
    operation: 'index',
    impacts: ['full-scan'],
    lock: 'none',
    remediation: 'manual',
    extension: 'pgvector',
    triggerKeywords: ['USING HNSW', 'MAINTENANCE_WORK_MEM', 'CREATE INDEX', 'MAX_PARALLEL_MAINTENANCE_WORKERS', 'EF_CONSTRUCTION'],
    triggersOn:
      'An `IndexStmt` whose `accessMethod` lowercases to `hnsw`, on a table whose `TableStats.rowCount` is at least `1_000_000`, where `ctx.cluster.settings.maintenanceWorkMemBytes` is defined and below `1024 ** 3` bytes (1 GB). All three conditions have to hold together.',
    doesNotTriggerOn:
      'Every run without `--database-url`, which supplies neither the row count nor the setting (`requiresDatabaseUrl` is set). A server where `maintenance_work_mem` could not be read: `undefined` is treated as "do not warn", never as "assume it is small". Tables under `1,000,000` rows. IVFFlat and every non-vector access method.',
    lockDetail:
      'No lock finding of its own, and the rule never inspects `concurrent`. A plain build holds SHARE and a `CONCURRENTLY` build SHARE UPDATE EXCLUSIVE; what this rule adds is that whichever window applies can stretch from minutes to hours purely because of a server setting the migration file never mentions.',
    assumptions:
      '`1,000,000` rows and `1 GB` are a heuristic for the shape of the problem, not a computed graph size. The memory an HNSW graph actually needs depends on the vector dimensions and on `m`, and neither is derivable from the statement — the column type is never resolved and `m` may not even be supplied, which is MP109\'s remit. So the rule warns on a million rows of `vector(3)` that would have fitted comfortably, and stays quiet at `900,000` rows of `vector(1536)` that will not. `maintenance_work_mem` is the server\'s current value, which the session that actually runs the build can raise or lower without the rule knowing.',
    deployNote:
      '`SET maintenance_work_mem` applies only to the session that issues it, so the raise has to happen in the same session as the build. `max_parallel_maintenance_workers` is separately capped by `max_parallel_workers`, so raising one alone does not necessarily add workers.',
  },
};
