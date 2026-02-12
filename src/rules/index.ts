import type { Rule } from './engine.js';
import { requireConcurrentIndex } from './MP001-concurrent-index.js';
import { requireCheckNotNull } from './MP002-check-not-null.js';
import { volatileDefaultRewrite } from './MP003-volatile-default.js';
import { requireLockTimeout } from './MP004-lock-timeout.js';
import { requireNotValidFK } from './MP005-not-valid-fk.js';
import { noVacuumFull } from './MP006-vacuum-full.js';
import { noColumnTypeChange } from './MP007-column-type-change.js';
import { noMultiDdlTransaction } from './MP008-multi-ddl-transaction.js';

export { runRules } from './engine.js';
export type { Rule, RuleViolation, RuleContext, Severity } from './engine.js';

/** All built-in static analysis rules (Phase 1 — 8 critical rules) */
export const allRules: Rule[] = [
  requireConcurrentIndex,
  requireCheckNotNull,
  volatileDefaultRewrite,
  requireLockTimeout,
  requireNotValidFK,
  noVacuumFull,
  noColumnTypeChange,
  noMultiDdlTransaction,
];
