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
            insertedContent: {
                text: string;
            };
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
    defaultConfiguration: {
        level: SarifLevel;
    };
    helpUri?: string;
}
interface SarifToolComponent {
    name: string;
    version: string;
    informationUri: string;
    rules: SarifReportingDescriptor[];
}
interface SarifRun {
    tool: {
        driver: SarifToolComponent;
    };
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
export declare function buildSarifLog(violations: RuleViolation[], file: string, rules: Rule[], toolVersion?: string): SarifLog;
/**
 * Format SARIF log as a JSON string.
 */
export declare function formatSarif(violations: RuleViolation[], file: string, rules: Rule[], toolVersion?: string): string;
/**
 * Build a combined SARIF log from multiple file analyses.
 */
export declare function buildCombinedSarifLog(fileResults: Array<{
    file: string;
    violations: RuleViolation[];
}>, rules: Rule[], toolVersion?: string): SarifLog;
export {};
//# sourceMappingURL=sarif.d.ts.map