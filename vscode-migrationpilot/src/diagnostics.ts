import * as vscode from 'vscode';
import { parseMigration } from '../../src/parser/parse';
import { extractTargets } from '../../src/parser/extract';
import { classifyLock } from '../../src/locks/classify';
import { allRules, freeRules, runRules } from '../../src/rules/index';
import type { Rule, RuleViolation, Severity } from '../../src/rules/engine';

export interface ViolationInfo {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  message: string;
  line: number;
  safeAlternative?: string;
  whyItMatters?: string;
  docsUrl?: string;
  autoFixable: boolean;
}

const FIXABLE_RULES = new Set([
  'MP001', 'MP004', 'MP009', 'MP020', 'MP021', 'MP023',
  'MP030', 'MP033', 'MP037', 'MP040', 'MP041', 'MP046',
]);

export class DiagnosticsProvider {
  private collection: vscode.DiagnosticCollection;
  private violationMap: Map<string, ViolationInfo[]> = new Map();
  private pgVersion: number;
  private excludeRules: Set<string>;
  private criticalSeverity: vscode.DiagnosticSeverity;
  private warningSeverity: vscode.DiagnosticSeverity;

  constructor(context: vscode.ExtensionContext) {
    this.collection = vscode.languages.createDiagnosticCollection('migrationpilot');
    context.subscriptions.push(this.collection);
    this.pgVersion = 17;
    this.excludeRules = new Set();
    this.criticalSeverity = vscode.DiagnosticSeverity.Error;
    this.warningSeverity = vscode.DiagnosticSeverity.Warning;
    this.reloadConfig();
  }

  reloadConfig(): void {
    const config = vscode.workspace.getConfiguration('migrationpilot');
    this.pgVersion = config.get<number>('pgVersion', 17);
    this.excludeRules = new Set(config.get<string[]>('excludeRules', []));
    this.criticalSeverity = this.parseSeverity(config.get<string>('severity.critical', 'Error'));
    this.warningSeverity = this.parseSeverity(config.get<string>('severity.warning', 'Warning'));
  }

  async analyzeDocument(doc: vscode.TextDocument): Promise<void> {
    const config = vscode.workspace.getConfiguration('migrationpilot');
    if (!config.get<boolean>('enable', true)) return;

    const sql = doc.getText();
    if (!sql.trim()) {
      this.collection.delete(doc.uri);
      this.violationMap.delete(doc.uri.toString());
      return;
    }

    try {
      const parsed = await parseMigration(sql);
      if (parsed.errors.length > 0) {
        this.collection.delete(doc.uri);
        this.violationMap.delete(doc.uri.toString());
        return;
      }

      const statementsWithLocks = parsed.statements.map(s => {
        const lock = classifyLock(s.stmt, this.pgVersion);
        const line = sql.slice(0, s.stmtLocation).split('\n').length;
        return { ...s, lock, line };
      });

      const enabledRules = allRules.filter(r => !this.excludeRules.has(r.id));
      const violations = runRules(enabledRules, statementsWithLocks, this.pgVersion, undefined, sql);

      const diagnostics: vscode.Diagnostic[] = [];
      const fileViolations: ViolationInfo[] = [];

      for (const v of violations) {
        if (this.excludeRules.has(v.ruleId)) continue;

        const line = Math.max(0, v.line - 1);
        const docLine = doc.lineAt(Math.min(line, doc.lineCount - 1));
        const range = new vscode.Range(docLine.range.start, docLine.range.end);

        const severity = v.severity === 'critical' ? this.criticalSeverity : this.warningSeverity;

        const rule = allRules.find(r => r.id === v.ruleId);
        const docsUrl = rule?.docsUrl ?? `https://migrationpilot.dev/rules/${v.ruleId.toLowerCase()}`;

        const diagnostic = new vscode.Diagnostic(range, `${v.ruleId}: ${v.message}`, severity);
        diagnostic.source = 'migrationpilot';
        diagnostic.code = {
          value: v.ruleId,
          target: vscode.Uri.parse(docsUrl),
        };

        if (v.safeAlternative) {
          diagnostic.relatedInformation = [
            new vscode.DiagnosticRelatedInformation(
              new vscode.Location(doc.uri, range),
              `Fix: ${v.safeAlternative}`,
            ),
          ];
        }

        diagnostics.push(diagnostic);

        fileViolations.push({
          ruleId: v.ruleId,
          ruleName: v.ruleName,
          severity: v.severity,
          message: v.message,
          line: v.line,
          safeAlternative: v.safeAlternative,
          whyItMatters: rule?.whyItMatters,
          docsUrl,
          autoFixable: FIXABLE_RULES.has(v.ruleId),
        });
      }

      this.collection.set(doc.uri, diagnostics);
      this.violationMap.set(doc.uri.toString(), fileViolations);
    } catch {
      // Parse errors — clear diagnostics silently
      this.collection.delete(doc.uri);
      this.violationMap.delete(doc.uri.toString());
    }
  }

  getViolationsForUri(uri: string): ViolationInfo[] {
    return this.violationMap.get(uri) ?? [];
  }

  clearForDocument(uri: vscode.Uri): void {
    this.collection.delete(uri);
    this.violationMap.delete(uri.toString());
  }

  clearAll(): void {
    this.collection.clear();
    this.violationMap.clear();
  }

  dispose(): void {
    this.collection.dispose();
    this.violationMap.clear();
  }

  private parseSeverity(value: string): vscode.DiagnosticSeverity {
    switch (value) {
      case 'Error': return vscode.DiagnosticSeverity.Error;
      case 'Warning': return vscode.DiagnosticSeverity.Warning;
      case 'Information': return vscode.DiagnosticSeverity.Information;
      case 'Hint': return vscode.DiagnosticSeverity.Hint;
      default: return vscode.DiagnosticSeverity.Warning;
    }
  }
}
