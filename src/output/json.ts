/**
 * JSON output formatter for MigrationPilot.
 *
 * Produces a structured, versioned JSON schema for programmatic consumption.
 * Used by `--format json` in both `analyze` and `check` commands.
 */

import type { AnalysisOutput } from './cli.js';
import type { Rule } from '../rules/engine.js';
import type { RiskLevel } from '../scoring/score.js';
import type { ReversibilityAssessment } from '../generator/grade.js';
import type { SequenceReportJson } from '../sequence/format.js';

export interface JsonViolation {
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'warning';
  message: string;
  line: number;
  safeAlternative?: string;
  whyItMatters?: string;
  docsUrl?: string;
}

export interface JsonStatement {
  sql: string;
  lockType: string;
  blocksReads: boolean;
  blocksWrites: boolean;
  riskLevel: RiskLevel;
  riskScore: number;
}

export interface JsonSummary {
  totalStatements: number;
  totalViolations: number;
  criticalCount: number;
  warningCount: number;
}

export interface JsonReport {
  $schema: string;
  version: string;
  file: string;
  riskLevel: RiskLevel;
  riskScore: number;
  riskFactors: Array<{ name: string; value: number; weight: number; detail: string }>;
  statements: JsonStatement[];
  violations: JsonViolation[];
  summary: JsonSummary;
  /** Rollback grade. Added in 1.6.0 — absent on reports built before it. */
  reversibility?: ReversibilityAssessment;
}

export interface JsonMultiReport {
  $schema: string;
  version: string;
  files: JsonReport[];
  overallRiskLevel: RiskLevel;
  totalViolations: number;
  /** Cross-file findings. Added in 1.6.0 — absent when `--no-sequence` is used. */
  sequence?: SequenceReportJson;
}

const SCHEMA_URL = 'https://migrationpilot.dev/schemas/report-v1.json';
const SCHEMA_VERSION = '1.6.0';

/**
 * Format a single file analysis as structured JSON.
 */
export function formatJson(analysis: AnalysisOutput, rules?: Rule[]): string {
  return JSON.stringify(buildJsonReport(analysis, rules), null, 2);
}

/**
 * Format multiple file analyses as structured JSON.
 *
 * @param sequence - Cross-file findings from `analyzeSequence`, already shaped
 *                   by `buildSequenceJson`. Omitted when sequence analysis is off.
 */
export function formatJsonMulti(results: AnalysisOutput[], rules?: Rule[], sequence?: SequenceReportJson): string {
  const reports = results.map(r => buildJsonReport(r, rules));

  const worstLevel = reports.reduce<RiskLevel>(
    (worst, r) => riskOrdinal(r.riskLevel) > riskOrdinal(worst) ? r.riskLevel : worst,
    'GREEN',
  );

  const multi: JsonMultiReport = {
    $schema: SCHEMA_URL,
    version: SCHEMA_VERSION,
    files: reports,
    overallRiskLevel: worstLevel,
    totalViolations: reports.reduce((sum, r) => sum + r.summary.totalViolations, 0),
    ...(sequence && { sequence }),
  };

  return JSON.stringify(multi, null, 2);
}

/**
 * Build the structured report for one analysis.
 *
 * Exported so other commands can embed the exact same static-analysis document
 * in their own output instead of describing the same data a second way.
 */
export function buildJsonReport(analysis: AnalysisOutput, rules?: Rule[]): JsonReport {
  const ruleMap = new Map<string, Rule>();
  if (rules) {
    for (const r of rules) ruleMap.set(r.id, r);
  }

  const criticalCount = analysis.violations.filter(v => v.severity === 'critical').length;
  const warningCount = analysis.violations.filter(v => v.severity === 'warning').length;

  return {
    $schema: SCHEMA_URL,
    version: SCHEMA_VERSION,
    file: analysis.file,
    riskLevel: analysis.overallRisk.level,
    riskScore: analysis.overallRisk.score,
    riskFactors: analysis.overallRisk.factors.map(f => ({
      name: f.name,
      value: f.value,
      weight: f.weight,
      detail: f.detail,
    })),
    statements: analysis.statements.map(s => ({
      sql: s.sql,
      lockType: s.lock.lockType,
      blocksReads: s.lock.blocksReads,
      blocksWrites: s.lock.blocksWrites,
      riskLevel: s.risk.level,
      riskScore: s.risk.score,
    })),
    violations: analysis.violations.map(v => {
      const rule = ruleMap.get(v.ruleId);
      return {
        ruleId: v.ruleId,
        ruleName: v.ruleName,
        severity: v.severity,
        message: v.message,
        line: v.line,
        ...(v.safeAlternative && { safeAlternative: v.safeAlternative }),
        ...(rule?.whyItMatters && { whyItMatters: rule.whyItMatters }),
        ...(rule?.docsUrl && { docsUrl: rule.docsUrl }),
      };
    }),
    summary: {
      totalStatements: analysis.statements.length,
      totalViolations: analysis.violations.length,
      criticalCount,
      warningCount,
    },
    ...(analysis.reversibility && { reversibility: analysis.reversibility }),
  };
}

function riskOrdinal(level: RiskLevel): number {
  return level === 'RED' ? 2 : level === 'YELLOW' ? 1 : 0;
}
