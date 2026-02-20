/**
 * SARIF (Static Analysis Results Interchange Format) output for MigrationPilot.
 *
 * SARIF v2.1.0 enables:
 * - GitHub Code Scanning integration (auto-uploads from Actions)
 * - VS Code SARIF Viewer extension
 * - Any SARIF-compatible IDE or CI tool
 *
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */

import type { RuleViolation } from '../rules/engine.js';
import type { Rule } from '../rules/engine.js';

/** SARIF severity levels */
type SarifLevel = 'error' | 'warning' | 'note' | 'none';

interface SarifMessage {
  text: string;
}

interface SarifArtifactLocation {
  uri: string;
  uriBaseId?: string;
}

interface SarifRegion {
  startLine: number;
  startColumn?: number;
}

interface SarifPhysicalLocation {
  artifactLocation: SarifArtifactLocation;
  region: SarifRegion;
}

interface SarifLocation {
  physicalLocation: SarifPhysicalLocation;
}

interface SarifFix {
  description: SarifMessage;
  artifactChanges: Array<{
    artifactLocation: SarifArtifactLocation;
    replacements: Array<{
      deletedRegion: SarifRegion;
      insertedContent: { text: string };
    }>;
  }>;
}

interface SarifResult {
  ruleId: string;
  ruleIndex: number;
  level: SarifLevel;
  message: SarifMessage;
  locations: SarifLocation[];
  fixes?: SarifFix[];
}

interface SarifReportingDescriptor {
  id: string;
  name: string;
  shortDescription: SarifMessage;
  fullDescription?: SarifMessage;
  defaultConfiguration: { level: SarifLevel };
  helpUri?: string;
}

interface SarifToolComponent {
  name: string;
  version: string;
  informationUri: string;
  rules: SarifReportingDescriptor[];
}

interface SarifRun {
  tool: { driver: SarifToolComponent };
  results: SarifResult[];
}

interface SarifLog {
  version: string;
  $schema: string;
  runs: SarifRun[];
}

/**
 * Build a SARIF log from analysis violations.
 *
 * @param violations - All violations from analysis
 * @param file - The migration file path (relative)
 * @param rules - All rules (for the rules metadata section)
 * @param toolVersion - MigrationPilot version
 */
export function buildSarifLog(
  violations: RuleViolation[],
  file: string,
  rules: Rule[],
  toolVersion: string = '1.4.0',
): SarifLog {
  // Build rule descriptors
  const ruleDescriptors: SarifReportingDescriptor[] = rules.map(r => ({
    id: r.id,
    name: r.name,
    shortDescription: { text: r.description },
    defaultConfiguration: { level: mapSeverity(r.severity) },
    helpUri: `https://migrationpilot.dev/rules/${r.id.toLowerCase()}`,
  }));

  // Build rule ID → index mapping
  const ruleIndex = new Map(rules.map((r, i) => [r.id, i]));

  // Build results
  const results: SarifResult[] = violations.map(v => {
    const result: SarifResult = {
      ruleId: v.ruleId,
      ruleIndex: ruleIndex.get(v.ruleId) ?? 0,
      level: mapSeverity(v.severity),
      message: { text: v.message },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: normalizeUri(file) },
          region: { startLine: v.line, startColumn: 1 },
        },
      }],
    };

    // Add fix suggestion if available
    if (v.safeAlternative) {
      result.fixes = [{
        description: { text: `Safe alternative for ${v.ruleId}` },
        artifactChanges: [{
          artifactLocation: { uri: normalizeUri(file) },
          replacements: [{
            deletedRegion: { startLine: v.line },
            insertedContent: { text: v.safeAlternative },
          }],
        }],
      }];
    }

    return result;
  });

  return {
    version: '2.1.0',
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    runs: [{
      tool: {
        driver: {
          name: 'MigrationPilot',
          version: toolVersion,
          informationUri: 'https://migrationpilot.dev',
          rules: ruleDescriptors,
        },
      },
      results,
    }],
  };
}

/**
 * Format SARIF log as a JSON string.
 */
export function formatSarif(
  violations: RuleViolation[],
  file: string,
  rules: Rule[],
  toolVersion?: string,
): string {
  return JSON.stringify(buildSarifLog(violations, file, rules, toolVersion), null, 2);
}

/**
 * Build a combined SARIF log from multiple file analyses.
 */
export function buildCombinedSarifLog(
  fileResults: Array<{ file: string; violations: RuleViolation[] }>,
  rules: Rule[],
  toolVersion: string = '1.4.0',
): SarifLog {
  const ruleDescriptors: SarifReportingDescriptor[] = rules.map(r => ({
    id: r.id,
    name: r.name,
    shortDescription: { text: r.description },
    defaultConfiguration: { level: mapSeverity(r.severity) },
    helpUri: `https://migrationpilot.dev/rules/${r.id.toLowerCase()}`,
  }));

  const ruleIndex = new Map(rules.map((r, i) => [r.id, i]));

  const results: SarifResult[] = fileResults.flatMap(({ file, violations }) =>
    violations.map(v => {
      const result: SarifResult = {
        ruleId: v.ruleId,
        ruleIndex: ruleIndex.get(v.ruleId) ?? 0,
        level: mapSeverity(v.severity),
        message: { text: v.message },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: normalizeUri(file) },
            region: { startLine: v.line, startColumn: 1 },
          },
        }],
      };

      if (v.safeAlternative) {
        result.fixes = [{
          description: { text: `Safe alternative for ${v.ruleId}` },
          artifactChanges: [{
            artifactLocation: { uri: normalizeUri(file) },
            replacements: [{
              deletedRegion: { startLine: v.line },
              insertedContent: { text: v.safeAlternative },
            }],
          }],
        }];
      }

      return result;
    }),
  );

  return {
    version: '2.1.0',
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    runs: [{
      tool: {
        driver: {
          name: 'MigrationPilot',
          version: toolVersion,
          informationUri: 'https://migrationpilot.dev',
          rules: ruleDescriptors,
        },
      },
      results,
    }],
  };
}

function mapSeverity(severity: string): SarifLevel {
  return severity === 'critical' ? 'error' : 'warning';
}

function normalizeUri(filePath: string): string {
  // Convert backslashes to forward slashes and strip leading ./
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}
