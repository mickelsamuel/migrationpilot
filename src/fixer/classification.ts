/**
 * Fix classification for every MigrationPilot rule.
 *
 * Each rule falls into exactly one bucket:
 *
 * - `mechanical` — a deterministic, semantics-preserving rewrite of a single
 *   statement (or of the transaction wrapper around it). `--fix` applies these.
 * - `plan-only`  — the safe fix is a choreography: several statements that must
 *   land in a specific order, sometimes across separate deploys. `--fix` never
 *   touches these; `migrationpilot plan-fix` emits a numbered plan instead.
 * - `unfixable`  — the safe path depends on facts MigrationPilot cannot know
 *   (intent, data shape, release schedule). Reported with a safe alternative
 *   for a human to apply.
 *
 * The bar for `mechanical` is deliberately high: if a transform could change
 * what the migration means for any input, it is not mechanical. `MP038`
 * (int → bigint) is mechanical only because the rule fires on CREATE TABLE, so
 * there is never existing data to rewrite; the same change on an existing
 * column is a table rewrite and lives in the planner instead.
 *
 * A few `mechanical` rules also appear in `plan-fix`, because their one-line
 * fix leaves follow-up work: `--fix` adds `NOT VALID` to a constraint, and
 * `plan-fix` shows the matching `VALIDATE CONSTRAINT` step.
 */

export type FixClass = 'mechanical' | 'plan-only' | 'unfixable';

export interface RuleFixClassification {
  ruleId: string;
  fixClass: FixClass;
  /** One line on what `--fix` does, or why it stays out of it. */
  reason: string;
  /**
   * Imperative label for the rewrite, short enough for a menu item. Set on
   * every `mechanical` rule and on nothing else, so an editor offering the fix
   * can name it without keeping its own copy of the table.
   */
  fixTitle?: string;
}

const TABLE: ReadonlyArray<RuleFixClassification> = [
  { ruleId: 'MP001', fixClass: 'mechanical', reason: 'Insert CONCURRENTLY into CREATE [UNIQUE] INDEX — same index, non-blocking build.', fixTitle: 'Add CONCURRENTLY to CREATE INDEX' },
  { ruleId: 'MP002', fixClass: 'plan-only', reason: 'Safe SET NOT NULL is a CHECK → VALIDATE → SET NOT NULL → DROP CHECK sequence (PG18: native NOT NULL NOT VALID + VALIDATE).' },
  { ruleId: 'MP003', fixClass: 'unfixable', reason: 'Replacing a volatile DEFAULT means choosing a different value semantics — only the author knows the intent.' },
  { ruleId: 'MP004', fixClass: 'mechanical', reason: "Prepend SET lock_timeout = '5s' before the DDL; adds a guard, changes no statement.", fixTitle: 'Add SET lock_timeout before the statement' },
  { ruleId: 'MP005', fixClass: 'mechanical', reason: 'Append NOT VALID to the FOREIGN KEY constraint so creation skips the table scan.', fixTitle: 'Add NOT VALID to the FOREIGN KEY' },
  { ruleId: 'MP006', fixClass: 'unfixable', reason: 'VACUUM FULL has no in-SQL substitute; the safe path is pg_repack, an external tool.' },
  { ruleId: 'MP007', fixClass: 'plan-only', reason: 'Type change needs expand-contract: new column, sync trigger, batched backfill, swap, drop.' },
  { ruleId: 'MP008', fixClass: 'unfixable', reason: 'Splitting DDL into separate transactions drops all-or-nothing rollback — which statements may split is the author’s call.' },
  { ruleId: 'MP009', fixClass: 'mechanical', reason: 'Insert CONCURRENTLY into DROP INDEX, preserving an IF EXISTS clause.', fixTitle: 'Add CONCURRENTLY to DROP INDEX' },
  { ruleId: 'MP010', fixClass: 'plan-only', reason: 'Rename is expand-contract across app releases: add column, dual-write, backfill, cut over, drop.' },
  { ruleId: 'MP011', fixClass: 'plan-only', reason: 'Unbatched UPDATE becomes a batched loop with its own lock_timeout and pauses between batches.' },
  { ruleId: 'MP012', fixClass: 'mechanical', reason: 'Lift ALTER TYPE ... ADD VALUE out of its BEGIN/COMMIT block when it is the first, last, or only statement in it.', fixTitle: 'Move ALTER TYPE ADD VALUE out of the transaction' },
  { ruleId: 'MP013', fixClass: 'unfixable', reason: 'A high-traffic table is a scheduling problem — no rewrite of the statement fixes it.' },
  { ruleId: 'MP014', fixClass: 'unfixable', reason: 'A large table is a scheduling and strategy problem — the statement itself is already minimal.' },
  { ruleId: 'MP015', fixClass: 'unfixable', reason: 'Replacing ADD COLUMN SERIAL needs a sequence start value and a backfill order that depend on live data.' },
  { ruleId: 'MP016', fixClass: 'unfixable', reason: 'The right index for an FK may be composite or partial; column order follows query patterns MigrationPilot cannot see.' },
  { ruleId: 'MP017', fixClass: 'unfixable', reason: 'Dropping a column is irreversible; whether to keep, rename, or stage it is a product decision.' },
  { ruleId: 'MP018', fixClass: 'plan-only', reason: 'Same choreography as MP002 — a validated CHECK first, so the final SET NOT NULL is instant.' },
  { ruleId: 'MP019', fixClass: 'unfixable', reason: 'Connection pressure is resolved by draining or scheduling, not by editing SQL.' },
  { ruleId: 'MP020', fixClass: 'mechanical', reason: "Prepend SET statement_timeout = '30s' before long-running DDL.", fixTitle: 'Add SET statement_timeout before the statement' },
  { ruleId: 'MP021', fixClass: 'mechanical', reason: 'Insert CONCURRENTLY into REINDEX TABLE/INDEX/SCHEMA/DATABASE (PG 12+).', fixTitle: 'Add CONCURRENTLY to REINDEX' },
  { ruleId: 'MP022', fixClass: 'unfixable', reason: 'Removing CASCADE turns a silent drop into an error; the dependents must be dropped explicitly, and which ones is a review decision.' },
  { ruleId: 'MP023', fixClass: 'mechanical', reason: 'Insert IF NOT EXISTS into CREATE TABLE/INDEX, making the statement idempotent.', fixTitle: 'Add IF NOT EXISTS' },
  { ruleId: 'MP024', fixClass: 'unfixable', reason: 'PostgreSQL has no DROP VALUE; removing an enum value means recreating the type and rewriting every dependent column.' },
  { ruleId: 'MP025', fixClass: 'mechanical', reason: 'Lift the CONCURRENTLY statement out of its BEGIN/COMMIT block when it is the first, last, or only statement in it.', fixTitle: 'Move the CONCURRENTLY statement out of the transaction' },
  { ruleId: 'MP026', fixClass: 'unfixable', reason: 'Whether a table should be dropped at all is exactly the judgment the rule is asking for.' },
  { ruleId: 'MP027', fixClass: 'plan-only', reason: 'Safe UNIQUE is two statements that cannot share a transaction: CREATE UNIQUE INDEX CONCURRENTLY, then ADD CONSTRAINT ... USING INDEX.' },
  { ruleId: 'MP028', fixClass: 'unfixable', reason: 'A table rename breaks every reference; the compatible path is a view under the old name, which the author must design.' },
  { ruleId: 'MP029', fixClass: 'unfixable', reason: 'Whether NULLs are now acceptable in that column is a data-model decision.' },
  { ruleId: 'MP030', fixClass: 'mechanical', reason: 'Append NOT VALID to the CHECK constraint so creation skips the table scan.', fixTitle: 'Add NOT VALID to the CHECK constraint' },
  { ruleId: 'MP031', fixClass: 'unfixable', reason: 'Exclusion constraints cannot be added NOT VALID — there is no non-blocking form to rewrite to.' },
  { ruleId: 'MP032', fixClass: 'unfixable', reason: 'CLUSTER has no online equivalent in SQL; pg_repack is an external tool.' },
  { ruleId: 'MP033', fixClass: 'mechanical', reason: 'Insert CONCURRENTLY into REFRESH MATERIALIZED VIEW.', fixTitle: 'Add CONCURRENTLY to REFRESH MATERIALIZED VIEW' },
  { ruleId: 'MP034', fixClass: 'unfixable', reason: 'DROP DATABASE in a migration is a mistake to remove, not a statement to rewrite.' },
  { ruleId: 'MP035', fixClass: 'unfixable', reason: 'Dropping a schema is irreversible and its blast radius is only knowable from the live catalog.' },
  { ruleId: 'MP036', fixClass: 'unfixable', reason: 'Which referencing tables may legitimately be truncated is a data decision.' },
  { ruleId: 'MP037', fixClass: 'mechanical', reason: 'VARCHAR(n) → TEXT; PostgreSQL stores both identically, so only the length check is dropped.', fixTitle: 'Replace VARCHAR(n) with TEXT' },
  { ruleId: 'MP038', fixClass: 'mechanical', reason: 'INT → BIGINT on a PK/FK column, and only inside CREATE TABLE where no rows exist yet.', fixTitle: 'Widen the key column to BIGINT' },
  { ruleId: 'MP039', fixClass: 'mechanical', reason: 'SERIAL → GENERATED BY DEFAULT AS IDENTITY inside CREATE TABLE; identical default behaviour, cleaner sequence ownership.', fixTitle: 'Replace SERIAL with GENERATED BY DEFAULT AS IDENTITY' },
  { ruleId: 'MP040', fixClass: 'mechanical', reason: 'TIMESTAMP → TIMESTAMPTZ.', fixTitle: 'Replace TIMESTAMP with TIMESTAMPTZ' },
  { ruleId: 'MP041', fixClass: 'mechanical', reason: 'CHAR(n) → TEXT, dropping the blank padding.', fixTitle: 'Replace CHAR(n) with TEXT' },
  { ruleId: 'MP042', fixClass: 'mechanical', reason: 'Write out the name PostgreSQL would have generated (table_col_idx) for plain column-list indexes.', fixTitle: 'Name the index' },
  { ruleId: 'MP043', fixClass: 'unfixable', reason: 'A domain constraint validates every column of that domain across the database — scope is only visible in the live catalog.' },
  { ruleId: 'MP044', fixClass: 'plan-only', reason: 'Narrowing needs a pre-flight check that no row overflows, then the same expand-contract as MP007.' },
  { ruleId: 'MP045', fixClass: 'unfixable', reason: 'Choosing the primary key is schema design.' },
  { ruleId: 'MP046', fixClass: 'mechanical', reason: 'Append CONCURRENTLY after the partition name in DETACH PARTITION (PG 14+).', fixTitle: 'Add CONCURRENTLY to DETACH PARTITION' },
  { ruleId: 'MP047', fixClass: 'unfixable', reason: 'SET LOGGED/UNLOGGED always rewrites the table; there is no non-blocking form.' },
  { ruleId: 'MP048', fixClass: 'unfixable', reason: 'Whether existing rows should also get the new default is a backfill decision.' },
  { ruleId: 'MP049', fixClass: 'unfixable', reason: 'Adding the partition key to the primary key changes what the key means — a modelling decision.' },
  { ruleId: 'MP050', fixClass: 'unfixable', reason: 'HNSW needs m and ef_construction chosen against the recall target and vector count.' },
  { ruleId: 'MP051', fixClass: 'unfixable', reason: 'GIST vs SP-GIST and the operator class depend on the geometry type and query mix.' },
  { ruleId: 'MP052', fixClass: 'unfixable', reason: 'The rule reports dependent objects that must be updated; updating them is application work.' },
  { ruleId: 'MP053', fixClass: 'unfixable', reason: 'Where the missing COMMIT belongs decides what is atomic — appending one blindly could commit a half-finished migration.' },
  { ruleId: 'MP054', fixClass: 'unfixable', reason: 'Separating the ADD VALUE from its first use means splitting the migration across deploys, and where to cut is the author’s call.' },
  { ruleId: 'MP055', fixClass: 'unfixable', reason: 'The correct REPLICA IDENTITY (FULL, or a chosen unique index) depends on the replication setup.' },
  { ruleId: 'MP056', fixClass: 'unfixable', reason: 'jsonb_path_ops vs an expression index depends on which operators the application actually uses.' },
  { ruleId: 'MP057', fixClass: 'unfixable', reason: 'A policy body is the security model — nothing safe can be generated for it.' },
  { ruleId: 'MP058', fixClass: 'unfixable', reason: 'Merging ALTER TABLEs is only safe if none of them depends on an earlier one having committed.' },
  { ruleId: 'MP059', fixClass: 'unfixable', reason: 'The setval() target depends on the rows actually inserted.' },
  { ruleId: 'MP060', fixClass: 'unfixable', reason: 'A rename that logical replication ignores has to be coordinated with subscribers by hand.' },
  { ruleId: 'MP061', fixClass: 'unfixable', reason: 'Reordering columns changes the row shape seen by SELECT *; the packing win rarely justifies it automatically.' },
  { ruleId: 'MP062', fixClass: 'unfixable', reason: 'Replacing a stored generated column with a trigger changes when the value is computed — a semantics change.' },
  { ruleId: 'MP063', fixClass: 'unfixable', reason: 'DDL inside a DO block is opaque to static analysis, so no transform can be proven safe.' },
  { ruleId: 'MP064', fixClass: 'unfixable', reason: 'Whether a trigger may be disabled during the migration is a correctness decision about replication and audit.' },
  { ruleId: 'MP065', fixClass: 'unfixable', reason: 'An explicit LOCK TABLE is usually deliberate; removing it can introduce a race.' },
  { ruleId: 'MP066', fixClass: 'unfixable', reason: 'Disabling autovacuum is sometimes intentional for a bulk load; re-enabling it needs a matching follow-up.' },
  { ruleId: 'MP067', fixClass: 'plan-only', reason: 'Unbatched DELETE becomes a batched loop, or TRUNCATE when the whole table really is going.' },
  { ruleId: 'MP068', fixClass: 'unfixable', reason: 'Widening an existing sequence and its column is a table rewrite, not a text edit.' },
  { ruleId: 'MP069', fixClass: 'unfixable', reason: 'The rule warns that both tables lock; the remedy is timing the deploy, not changing the SQL.' },
  { ruleId: 'MP070', fixClass: 'unfixable', reason: 'Prepending DROP INDEX would also drop a healthy index on a normal run, leaving a window with no index.' },
  { ruleId: 'MP071', fixClass: 'plan-only', reason: 'Same expand-contract as MP010, with the deploy boundary where the app switches to the new name.' },
  { ruleId: 'MP072', fixClass: 'unfixable', reason: 'Avoiding the DEFAULT partition scan means adding a matching CHECK first, whose bounds come from the partition definition.' },
  { ruleId: 'MP073', fixClass: 'unfixable', reason: 'Dropping to least privilege means choosing which role runs the migration — an ops decision.' },
  { ruleId: 'MP074', fixClass: 'mechanical', reason: 'Append DEFERRABLE INITIALLY IMMEDIATE to ALTER TABLE ADD CONSTRAINT ... FOREIGN KEY; same check timing, now deferrable on demand.', fixTitle: 'Make the FOREIGN KEY DEFERRABLE' },
  { ruleId: 'MP075', fixClass: 'unfixable', reason: 'TOAST bloat is handled by vacuum scheduling and fillfactor, not by rewriting the UPDATE.' },
  { ruleId: 'MP076', fixClass: 'unfixable', reason: 'Removing a SAVEPOINT changes the error-recovery behaviour the author asked for.' },
  { ruleId: 'MP077', fixClass: 'mechanical', reason: "pglz → lz4 (PG 14+); metadata-only, existing values keep their current compression.", fixTitle: 'Replace pglz with lz4' },
  { ruleId: 'MP078', fixClass: 'unfixable', reason: 'The version to pin is whatever the target servers have installed — not derivable from the file.' },
  { ruleId: 'MP079', fixClass: 'unfixable', reason: 'The missing policies are the ones matching your security model.' },
  { ruleId: 'MP080', fixClass: 'unfixable', reason: 'Splitting data out of a schema migration means creating a second file and deciding the order.' },
  { ruleId: 'MP081', fixClass: 'plan-only', reason: 'PG18 native path replaces the CHECK workaround with ADD CONSTRAINT ... NOT NULL ... NOT VALID plus VALIDATE — two statements.' },
  { ruleId: 'MP082', fixClass: 'unfixable', reason: 'NOT ENFORCED is sometimes deliberate; enforcing it triggers a full validation scan.' },
  { ruleId: 'MP083', fixClass: 'unfixable', reason: 'Changing a column collation rebuilds indexes and can change comparison results.' },
  { ruleId: 'MP084', fixClass: 'unfixable', reason: 'The right DEFAULT is a data-model decision; a generated placeholder would ship wrong data.' },
  { ruleId: 'MP085', fixClass: 'unfixable', reason: 'Which privileges were intended is policy, not syntax.' },
  { ruleId: 'MP086', fixClass: 'unfixable', reason: 'Choosing ON DELETE behaviour is schema design. Spelling out the NO ACTION default is a future mechanical candidate.' },
  { ruleId: 'MP087', fixClass: 'unfixable', reason: 'A replacement predicate needs the intent behind the volatile expression.' },
  { ruleId: 'MP088', fixClass: 'unfixable', reason: 'The backfill itself belongs in the batched plan, which already ends with ANALYZE; a bare appended ANALYZE is a future mechanical candidate.' },
  { ruleId: 'MP089', fixClass: 'unfixable', reason: 'Collation choice is intent; the rewrite is the cost of whichever collation is correct.' },
  { ruleId: 'MP090', fixClass: 'unfixable', reason: 'Whether the trigger belongs on a hot table is a design decision, not a rewrite.' },
  { ruleId: 'MP091', fixClass: 'unfixable', reason: 'Privilege changes bundled with DDL are a policy question; splitting them is a file-organization decision.' },
  { ruleId: 'MP092', fixClass: 'unfixable', reason: 'The right per-partition index strategy depends on the partition set and its growth.' },
  { ruleId: 'MP093', fixClass: 'unfixable', reason: 'Partition bounds are data-model; removing a DEFAULT partition needs somewhere for its rows to go.' },
  { ruleId: 'MP094', fixClass: 'unfixable', reason: 'The matching CHECK is derivable from the ATTACH bounds — a future mechanical candidate, not yet wired.' },
  { ruleId: 'MP095', fixClass: 'unfixable', reason: 'The target tablespace is an infrastructure choice; the move is the point of the statement.' },
  { ruleId: 'MP096', fixClass: 'unfixable', reason: 'WITH NO DATA changes when data first appears — pairing it with a later REFRESH is a deploy decision.' },
  { ruleId: 'MP097', fixClass: 'unfixable', reason: 'Which constraint or index survives is schema design; PostgreSQL rejects the drop for a reason.' },
  { ruleId: 'MP098', fixClass: 'unfixable', reason: 'Moving objects between schemas is architecture; every qualified reference is an application change.' },
  { ruleId: 'MP099', fixClass: 'unfixable', reason: 'The correct pinned search_path is deployment-specific.' },
  { ruleId: 'MP100', fixClass: 'unfixable', reason: 'Which of two overlapping indexes to keep needs query evidence, not syntax.' },
  { ruleId: 'MP101', fixClass: 'unfixable', reason: 'The fix is scheduling the build off-peak or accepting the write cost — operational, not textual.' },
  { ruleId: 'MP102', fixClass: 'unfixable', reason: 'Disk headroom is provisioned, not rewritten.' },
  { ruleId: 'MP103', fixClass: 'unfixable', reason: 'Replica lag is managed by scheduling and batching outside this statement.' },
  { ruleId: 'MP104', fixClass: 'unfixable', reason: 'Long index builds are scheduled, not rewritten; the duration is the point of the warning.' },
  { ruleId: 'MP105', fixClass: 'unfixable', reason: 'Hypertable DDL routes through the TimescaleDB APIs; which one depends on the intent of the operation.' },
  { ruleId: 'MP106', fixClass: 'unfixable', reason: 'drop_chunks needs the retention boundary — a data-lifecycle decision.' },
  { ruleId: 'MP107', fixClass: 'unfixable', reason: 'Distributed-table DDL is coordinated through Citus utilities and a maintenance window.' },
  { ruleId: 'MP108', fixClass: 'unfixable', reason: 'pg_partman owns the parent; manual DDL there is undone through partman configuration.' },
  { ruleId: 'MP109', fixClass: 'unfixable', reason: 'Index parameters trade recall for speed against a target only the team knows; the message quotes the formula.' },
  { ruleId: 'MP110', fixClass: 'unfixable', reason: 'Fan-out on a partitioned parent is inherent; the mitigation is scheduling or per-partition batching.' },
  { ruleId: 'MP111', fixClass: 'unfixable', reason: 'Columnstore-incompatible DDL needs the TimescaleDB decompress/recompress workflow — operational.' },
  { ruleId: 'MP112', fixClass: 'unfixable', reason: 'maintenance_work_mem is a session setting; raising it belongs to the run environment, not the migration.' },
];

/** Classification keyed by rule ID. */
export const FIX_CLASSIFICATION: ReadonlyMap<string, RuleFixClassification> = new Map(
  TABLE.map(entry => [entry.ruleId, entry]),
);

/** All classifications, in rule-ID order. */
export const FIX_CLASSIFICATIONS: ReadonlyArray<RuleFixClassification> = TABLE;

const idsWithClass = (fixClass: FixClass) =>
  new Set(TABLE.filter(entry => entry.fixClass === fixClass).map(entry => entry.ruleId));

/** Rules `--fix` can rewrite. */
export const MECHANICAL_RULE_IDS: ReadonlySet<string> = idsWithClass('mechanical');

/** Rules `plan-fix` emits a choreography for. */
export const PLAN_ONLY_RULE_IDS: ReadonlySet<string> = idsWithClass('plan-only');

/** Rules that need a human. */
export const UNFIXABLE_RULE_IDS: ReadonlySet<string> = idsWithClass('unfixable');

/** How a rule is classified, or `unfixable` for an unknown ID. */
export function fixClassOf(ruleId: string): FixClass {
  return FIX_CLASSIFICATION.get(ruleId)?.fixClass ?? 'unfixable';
}
