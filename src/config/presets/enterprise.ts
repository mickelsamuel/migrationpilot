/**
 * Enterprise preset — maximum safety with production context requirements.
 * All rules enabled, critical severity for lock safety, audit logging enabled.
 *
 * Install: extends: "migrationpilot:enterprise"
 */

import type { MigrationPilotConfig } from '../load.js';

export const enterprisePreset: MigrationPilotConfig = {
  failOn: 'warning',
  rules: {
    // Upgrade data safety rules to critical
    MP017: { severity: 'critical' }, // no-drop-column
    MP022: { severity: 'critical' }, // no-drop-cascade
    MP028: { severity: 'critical' }, // no-rename-table
    MP029: { severity: 'critical' }, // ban-drop-not-null
    MP044: { severity: 'critical' }, // no-data-loss-type-narrowing
    MP052: { severity: 'critical' }, // warn-dependent-objects
    MP067: { severity: 'critical' }, // warn-backfill-no-batching
    MP071: { severity: 'critical' }, // ban-rename-in-use-column
    MP080: { severity: 'critical' }, // ban-data-in-migration
  },
  thresholds: {
    highTrafficQueries: 5000,  // More sensitive (default 10000)
    largeTableRows: 500000,    // More sensitive (default 1000000)
  },
  auditLog: {
    enabled: true,
  },
};
