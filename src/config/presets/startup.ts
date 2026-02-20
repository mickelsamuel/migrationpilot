/**
 * Startup preset — focus on the highest-impact rules only.
 * Disables nitpicky rules, keeps critical lock and data safety rules.
 *
 * Install: extends: "migrationpilot:startup"
 */

import type { MigrationPilotConfig } from '../load.js';

export const startupPreset: MigrationPilotConfig = {
  failOn: 'critical',
  rules: {
    // Disable style/best-practice rules that are less critical for startups
    MP037: false, // prefer-text-over-varchar
    MP038: false, // prefer-bigint-over-int
    MP039: false, // prefer-identity-over-serial
    MP040: false, // prefer-timestamptz
    MP041: false, // ban-char-field
    MP042: false, // require-index-name
    MP045: false, // require-primary-key
    MP048: false, // ban-alter-default-volatile
    MP061: false, // suboptimal-column-order
    MP068: false, // warn-integer-pk-capacity
    MP074: false, // require-deferrable-fk
    MP075: false, // warn-toast-bloat-risk
    MP076: false, // warn-xid-consuming-retry
    MP077: false, // prefer-lz4-toast-compression
    MP078: false, // warn-extension-version-pin
    MP079: false, // warn-rls-policy-completeness
  },
};
