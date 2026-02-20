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

export { runRules } from './engine.js';
export type { Rule, RuleViolation, RuleContext, Severity } from './engine.js';

/** Rule IDs that require a Pro license (production context rules) */
export const PRO_RULE_IDS = new Set(['MP013', 'MP014', 'MP019']);

/** All built-in rules — MP001-MP080 (80 rules: 77 free, 3 paid) */
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
];

/** Free rules only — excludes Pro rules (MP013, MP014, MP019). Used by programmatic API. */
export const freeRules: Rule[] = allRules.filter(r => !PRO_RULE_IDS.has(r.id));
