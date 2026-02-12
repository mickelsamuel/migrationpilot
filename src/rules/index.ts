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

export { runRules } from './engine.js';
export type { Rule, RuleViolation, RuleContext, Severity } from './engine.js';

/** All built-in rules — MP001-MP008 critical (free), MP009-MP020 warning (some paid) */
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
];
