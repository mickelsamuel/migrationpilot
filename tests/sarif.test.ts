import { describe, it, expect } from 'vitest';
import { buildSarifLog, formatSarif, buildCombinedSarifLog } from '../src/output/sarif.js';
import { allRules } from '../src/rules/index.js';
import type { RuleViolation } from '../src/rules/engine.js';

const sampleViolations: RuleViolation[] = [
  {
    ruleId: 'MP001',
    ruleName: 'require-concurrent-index',
    severity: 'critical',
    message: 'CREATE INDEX blocks writes. Use CREATE INDEX CONCURRENTLY.',
    line: 3,
    safeAlternative: 'CREATE INDEX CONCURRENTLY idx_users_email ON users (email);',
  },
  {
    ruleId: 'MP004',
    ruleName: 'require-lock-timeout',
    severity: 'warning',
    message: 'No lock_timeout set before DDL.',
    line: 1,
  },
];

describe('buildSarifLog', () => {
  it('returns valid SARIF v2.1.0 structure', () => {
    const log = buildSarifLog(sampleViolations, 'migrations/001_add_index.sql', allRules);

    expect(log.version).toBe('2.1.0');
    expect(log.$schema).toContain('sarif-schema-2.1.0');
    expect(log.runs).toHaveLength(1);
  });

  it('includes tool driver metadata', () => {
    const log = buildSarifLog([], 'test.sql', allRules, '1.2.0');
    const driver = log.runs[0].tool.driver;

    expect(driver.name).toBe('MigrationPilot');
    expect(driver.version).toBe('1.2.0');
    expect(driver.informationUri).toBe('https://migrationpilot.dev');
  });

  it('includes all rules as reporting descriptors', () => {
    const log = buildSarifLog([], 'test.sql', allRules);
    const rules = log.runs[0].tool.driver.rules;

    expect(rules.length).toBe(allRules.length);
    expect(rules[0].id).toBe('MP001');
    expect(rules[0].shortDescription.text).toBeDefined();
    expect(rules[0].helpUri).toContain('migrationpilot.dev/rules/mp001');
  });

  it('maps violations to SARIF results', () => {
    const log = buildSarifLog(sampleViolations, 'migrations/001.sql', allRules);
    const results = log.runs[0].results;

    expect(results).toHaveLength(2);
    expect(results[0].ruleId).toBe('MP001');
    expect(results[0].level).toBe('error');
    expect(results[0].message.text).toContain('CREATE INDEX');
    expect(results[0].locations[0].physicalLocation.artifactLocation.uri).toBe('migrations/001.sql');
    expect(results[0].locations[0].physicalLocation.region.startLine).toBe(3);
  });

  it('maps critical to error and warning to warning', () => {
    const log = buildSarifLog(sampleViolations, 'test.sql', allRules);
    const results = log.runs[0].results;

    expect(results[0].level).toBe('error');     // critical → error
    expect(results[1].level).toBe('warning');    // warning → warning
  });

  it('includes safe alternative as fix', () => {
    const log = buildSarifLog(sampleViolations, 'test.sql', allRules);
    const results = log.runs[0].results;

    expect(results[0].fixes).toBeDefined();
    expect(results[0].fixes![0].description.text).toContain('MP001');
    expect(results[0].fixes![0].artifactChanges[0].replacements[0].insertedContent.text).toContain('CONCURRENTLY');

    // No safe alternative for MP004
    expect(results[1].fixes).toBeUndefined();
  });

  it('normalizes backslash paths to forward slashes', () => {
    const log = buildSarifLog(sampleViolations, 'migrations\\001.sql', allRules);
    expect(log.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe('migrations/001.sql');
  });

  it('returns empty results for no violations', () => {
    const log = buildSarifLog([], 'test.sql', allRules);
    expect(log.runs[0].results).toHaveLength(0);
  });
});

describe('formatSarif', () => {
  it('returns valid JSON string', () => {
    const json = formatSarif(sampleViolations, 'test.sql', allRules);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.runs[0].results).toHaveLength(2);
  });
});

describe('buildCombinedSarifLog', () => {
  it('combines violations from multiple files', () => {
    const fileResults = [
      { file: 'migrations/001.sql', violations: [sampleViolations[0]] },
      { file: 'migrations/002.sql', violations: [sampleViolations[1]] },
    ];

    const log = buildCombinedSarifLog(fileResults, allRules);
    expect(log.runs[0].results).toHaveLength(2);
    expect(log.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe('migrations/001.sql');
    expect(log.runs[0].results[1].locations[0].physicalLocation.artifactLocation.uri).toBe('migrations/002.sql');
  });

  it('returns single run with all results', () => {
    const fileResults = [
      { file: 'a.sql', violations: sampleViolations },
      { file: 'b.sql', violations: sampleViolations },
    ];

    const log = buildCombinedSarifLog(fileResults, allRules);
    expect(log.runs).toHaveLength(1);
    expect(log.runs[0].results).toHaveLength(4);
  });
});
