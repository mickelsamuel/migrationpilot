import type { Rule } from './engine.js';
import { requireConcurrentIndex } from './MP001-concurrent-index.js';
import { requireCheckNotNull } from './MP002-check-not-null.js';
import { volatileDefaultRewrite } from './MP003-volatile-default.js';
import { requireLockTimeout } from './MP004-lock-timeout.js';
import { requireNotValidFK } from './MP005-not-valid-fk.js';
import { noVacuumFull } from './MP006-vacuum-full.js';
import { noColumnTypeChange } from './MP007-column-type-change.js';
import { noMultiDdlTransaction } from './MP008-multi-ddl-transaction.js';
import { requireDropIndexConcurrently } from './MP009-drop-index-concurrently.js';
import { noRenameColumn } from './MP010-rename-column.js';
import { unbatchedBackfill } from './MP011-unbatched-backfill.js';
import { noEnumAddInTransaction } from './MP012-enum-add-value.js';
import { highTrafficTableDDL } from './MP013-high-traffic-ddl.js';
import { largeTableDDL } from './MP014-large-table-ddl.js';
import { noAddColumnSerial } from './MP015-add-column-with-default.js';
import { requireFKIndex } from './MP016-require-fk-index.js';
import { noDropColumn } from './MP017-no-drop-column.js';
import { noForceNotNull } from './MP018-no-force-not-null.js';
import { noExclusiveLockHighConnections } from './MP019-exclusive-lock-connections.js';
import { requireStatementTimeout } from './MP020-require-statement-timeout.js';
import { requireConcurrentReindex } from './MP021-concurrent-reindex.js';
import { noDropCascade } from './MP022-drop-cascade.js';
import { requireIfNotExists } from './MP023-require-if-not-exists.js';
import { noEnumValueRemoval } from './MP024-no-enum-value-removal.js';
import { banConcurrentInTransaction } from './MP025-concurrent-in-transaction.js';
import { banDropTable } from './MP026-ban-drop-table.js';
import { disallowedUniqueConstraint } from './MP027-disallowed-unique-constraint.js';
import { noRenameTable } from './MP028-no-rename-table.js';
import { banDropNotNull } from './MP029-ban-drop-not-null.js';
import { requireNotValidCheck } from './MP030-require-not-valid-check.js';
import { banExclusionConstraint } from './MP031-ban-exclusion-constraint.js';
import { banCluster } from './MP032-ban-cluster.js';
import { requireConcurrentRefreshMatview } from './MP033-concurrent-refresh-matview.js';
import { banDropDatabase } from './MP034-ban-drop-database.js';
import { banDropSchema } from './MP035-ban-drop-schema.js';
import { banTruncateCascade } from './MP036-ban-truncate-cascade.js';
import { preferTextOverVarchar } from './MP037-prefer-text-over-varchar.js';
import { preferBigintOverInt } from './MP038-prefer-bigint-over-int.js';
import { preferIdentityOverSerial } from './MP039-prefer-identity-over-serial.js';
import { preferTimestamptz } from './MP040-prefer-timestamptz.js';
import { banCharField } from './MP041-ban-char-field.js';
import { requireIndexName } from './MP042-require-index-name.js';
import { banDomainConstraint } from './MP043-ban-domain-constraint.js';
import { noDataLossTypeNarrowing } from './MP044-no-data-loss-type-narrowing.js';
import { requirePrimaryKey } from './MP045-require-primary-key.js';
import { requireConcurrentDetachPartition } from './MP046-concurrent-detach-partition.js';
import { banSetLoggedUnlogged } from './MP047-ban-set-logged-unlogged.js';
import { banAlterDefaultVolatile } from './MP048-alter-default-volatile.js';
import { requirePartitionKeyInPK } from './MP049-partition-key-in-pk.js';
import { preferHnswOverIvfflat } from './MP050-prefer-hnsw-over-ivfflat.js';
import { requireSpatialIndex } from './MP051-require-spatial-index.js';
import { warnDependentObjects } from './MP052-warn-dependent-objects.js';
import { banUncommittedTransaction } from './MP053-ban-uncommitted-transaction.js';
import { alterTypeAddValueInTransaction } from './MP054-alter-type-add-value-in-transaction.js';
import { dropPkReplicaIdentity } from './MP055-drop-pk-replica-identity.js';
import { ginIndexJsonb } from './MP056-gin-index-jsonb.js';
import { rlsWithoutPolicy } from './MP057-rls-without-policy.js';
import { multiAlterTable } from './MP058-multi-alter-table.js';
import { sequenceNotReset } from './MP059-sequence-not-reset.js';
import { alterTypeRenameValue } from './MP060-alter-type-rename-value.js';
import { suboptimalColumnOrder } from './MP061-suboptimal-column-order.js';
import { banAddGeneratedStored } from './MP062-ban-add-generated-stored.js';
import { warnDoBlockDdl } from './MP063-warn-do-block-ddl.js';
import { banDisableTrigger } from './MP064-ban-disable-trigger.js';
import { banLockTable } from './MP065-ban-lock-table.js';
import { warnAutovacuumDisabled } from './MP066-warn-autovacuum-disabled.js';
import { warnBackfillNoBatching } from './MP067-warn-backfill-no-batching.js';
import { warnIntegerPkCapacity } from './MP068-warn-integer-pk-capacity.js';
import { warnFkLockBothTables } from './MP069-warn-fk-lock-both-tables.js';
import { warnConcurrentIndexInvalid } from './MP070-warn-concurrent-index-invalid.js';
import { banRenameInUseColumn } from './MP071-ban-rename-in-use-column.js';
import { warnPartitionDefaultScan } from './MP072-warn-partition-default-scan.js';
import { banSuperuserRole } from './MP073-ban-superuser-role.js';
import { requireDeferrableFk } from './MP074-require-deferrable-fk.js';
import { warnToastBloatRisk } from './MP075-warn-toast-bloat-risk.js';
import { warnXidConsumingRetry } from './MP076-warn-xid-consuming-retry.js';
import { preferLz4ToastCompression } from './MP077-prefer-lz4-toast-compression.js';
import { warnExtensionVersionPin } from './MP078-warn-extension-version-pin.js';
import { warnRlsPolicyCompleteness } from './MP079-warn-rls-policy-completeness.js';
import { banDataInMigration } from './MP080-ban-data-in-migration.js';
import { preferPg18NotNullNotValid } from './MP081-prefer-pg18-not-null-not-valid.js';
import { warnNotEnforcedConstraint } from './MP082-warn-not-enforced-constraint.js';
import { warnFkNondeterministicCollation } from './MP083-warn-fk-nondeterministic-collation.js';
import { requireDefaultForNotNullColumn } from './MP084-require-default-for-not-null-column.js';
import { warnGrantWidening } from './MP085-warn-grant-widening.js';
import { requireExplicitOnDelete } from './MP086-require-explicit-on-delete.js';
import { banVolatileCheckConstraint } from './MP087-ban-volatile-check-constraint.js';
import { requireAnalyzeAfterBackfill } from './MP088-require-analyze-after-backfill.js';
import { warnCollationChangeRewrite } from './MP089-warn-collation-change-rewrite.js';
import { warnTriggerOnHotTable } from './MP090-warn-trigger-on-hot-table.js';
import { warnPrivilegeDrift } from './MP091-warn-privilege-drift.js';
import { requirePartitionedIndexStrategy } from './MP092-require-partitioned-index-strategy.js';
import { warnDefaultPartitionGrowth } from './MP093-warn-default-partition-growth.js';
import { requireAttachPartitionCheck } from './MP094-require-attach-partition-check.js';
import { warnSetTablespaceRewrite } from './MP095-warn-set-tablespace-rewrite.js';
import { warnMatviewWithData } from './MP096-warn-matview-with-data.js';
import { banDropConstraintBackingIndex } from './MP097-ban-drop-constraint-backing-index.js';
import { warnSetSchema } from './MP098-warn-set-schema.js';
import { warnSecurityDefinerSearchPath } from './MP099-warn-security-definer-search-path.js';
import { warnRedundantIndex } from './MP100-warn-redundant-index.js';
import { warnIndexOnWriteHotTable } from './MP101-warn-index-on-write-hot-table.js';
import { warnRewriteDiskHeadroom } from './MP102-warn-rewrite-disk-headroom.js';
import { warnReplicationLagRisk } from './MP103-warn-replication-lag-risk.js';
import { warnLongIndexBuild } from './MP104-warn-long-index-build.js';
import { warnTimescaleHypertableDdl } from './MP105-warn-timescale-hypertable-ddl.js';
import { preferTimescaleDropChunks } from './MP106-prefer-timescale-drop-chunks.js';
import { warnCitusDistributedDdl } from './MP107-warn-citus-distributed-ddl.js';
import { warnPartmanManagedParent } from './MP108-warn-partman-managed-parent.js';
import { requireVectorIndexParams } from './MP109-require-vector-index-params.js';
import { warnPartitionedParentFanout } from './MP110-warn-partitioned-parent-fanout.js';
import { warnTimescaleColumnstoreDdl } from './MP111-warn-timescale-columnstore-ddl.js';
import { warnHnswBuildMemory } from './MP112-warn-hnsw-build-memory.js';

export { runRules } from './engine.js';
export type { Rule, RuleViolation, RuleContext, Severity } from './engine.js';

/**
 * All built-in rules, in ID order.
 *
 * Rules marked `requiresDatabaseUrl` read the live catalog (table size, write
 * traffic, replication, extension metadata). With no --database-url there is
 * nothing to read, so they stay silent. MP109 is the exception in the MP100
 * range — it works from the migration file alone.
 */
export const allRules: Rule[] = [
  requireConcurrentIndex,
  requireCheckNotNull,
  volatileDefaultRewrite,
  requireLockTimeout,
  requireNotValidFK,
  noVacuumFull,
  noColumnTypeChange,
  noMultiDdlTransaction,
  requireDropIndexConcurrently,
  noRenameColumn,
  unbatchedBackfill,
  noEnumAddInTransaction,
  highTrafficTableDDL,
  largeTableDDL,
  noAddColumnSerial,
  requireFKIndex,
  noDropColumn,
  noForceNotNull,
  noExclusiveLockHighConnections,
  requireStatementTimeout,
  requireConcurrentReindex,
  noDropCascade,
  requireIfNotExists,
  noEnumValueRemoval,
  banConcurrentInTransaction,
  banDropTable,
  disallowedUniqueConstraint,
  noRenameTable,
  banDropNotNull,
  requireNotValidCheck,
  banExclusionConstraint,
  banCluster,
  requireConcurrentRefreshMatview,
  banDropDatabase,
  banDropSchema,
  banTruncateCascade,
  preferTextOverVarchar,
  preferBigintOverInt,
  preferIdentityOverSerial,
  preferTimestamptz,
  banCharField,
  requireIndexName,
  banDomainConstraint,
  noDataLossTypeNarrowing,
  requirePrimaryKey,
  requireConcurrentDetachPartition,
  banSetLoggedUnlogged,
  banAlterDefaultVolatile,
  requirePartitionKeyInPK,
  preferHnswOverIvfflat,
  requireSpatialIndex,
  warnDependentObjects,
  banUncommittedTransaction,
  alterTypeAddValueInTransaction,
  dropPkReplicaIdentity,
  ginIndexJsonb,
  rlsWithoutPolicy,
  multiAlterTable,
  sequenceNotReset,
  alterTypeRenameValue,
  suboptimalColumnOrder,
  banAddGeneratedStored,
  warnDoBlockDdl,
  banDisableTrigger,
  banLockTable,
  warnAutovacuumDisabled,
  warnBackfillNoBatching,
  warnIntegerPkCapacity,
  warnFkLockBothTables,
  warnConcurrentIndexInvalid,
  banRenameInUseColumn,
  warnPartitionDefaultScan,
  banSuperuserRole,
  requireDeferrableFk,
  warnToastBloatRisk,
  warnXidConsumingRetry,
  preferLz4ToastCompression,
  warnExtensionVersionPin,
  warnRlsPolicyCompleteness,
  banDataInMigration,
  preferPg18NotNullNotValid,
  warnNotEnforcedConstraint,
  warnFkNondeterministicCollation,
  requireDefaultForNotNullColumn,
  warnGrantWidening,
  requireExplicitOnDelete,
  banVolatileCheckConstraint,
  requireAnalyzeAfterBackfill,
  warnCollationChangeRewrite,
  warnTriggerOnHotTable,
  warnPrivilegeDrift,
  requirePartitionedIndexStrategy,
  warnDefaultPartitionGrowth,
  requireAttachPartitionCheck,
  warnSetTablespaceRewrite,
  warnMatviewWithData,
  banDropConstraintBackingIndex,
  warnSetSchema,
  warnSecurityDefinerSearchPath,
  warnRedundantIndex,
  warnIndexOnWriteHotTable,
  warnRewriteDiskHeadroom,
  warnReplicationLagRisk,
  warnLongIndexBuild,
  warnTimescaleHypertableDdl,
  preferTimescaleDropChunks,
  warnCitusDistributedDdl,
  warnPartmanManagedParent,
  requireVectorIndexParams,
  warnPartitionedParentFanout,
  warnTimescaleColumnstoreDdl,
  warnHnswBuildMemory,
];

/** Rules that work from the migration file alone, with no database connection. */
export const staticRules: Rule[] = allRules.filter(r => !r.requiresDatabaseUrl);
