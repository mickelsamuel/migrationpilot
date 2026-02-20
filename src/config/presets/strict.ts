/**
 * Strict preset — all rules at critical severity, fail on any violation.
 *
 * Install: extends: "migrationpilot:strict"
 * Or: npm install migrationpilot-config-strict
 */

import type { MigrationPilotConfig } from '../load.js';

const ALL_RULE_IDS = Array.from({ length: 80 }, (_, i) => `MP${String(i + 1).padStart(3, '0')}`);

export const strictPreset: MigrationPilotConfig = {
  failOn: 'warning',
  rules: Object.fromEntries(
    ALL_RULE_IDS.map(id => [id, { severity: 'critical' as const }]),
  ),
};
