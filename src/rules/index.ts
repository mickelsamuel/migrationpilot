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

export { runRules } from './engine.js';
export type { Rule, RuleViolation, RuleContext, Severity } from './engine.js';

/** Rule IDs that require a Pro license (production context rules) */
export const PRO_RULE_IDS = new Set(['MP013', 'MP014', 'MP019']);

/** All built-in rules — MP001-MP048 (48 rules: 45 free, 3 paid) */
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
];

/** Free rules only — excludes Pro rules (MP013, MP014, MP019). Used by programmatic API. */
export const freeRules: Rule[] = allRules.filter(r => !PRO_RULE_IDS.has(r.id));
