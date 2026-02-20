import * as vscode from 'vscode';
import type { DiagnosticsProvider } from './diagnostics';

/** Maps rule IDs to their fix transformations */
const FIX_TRANSFORMS: Record<string, (sql: string) => string | null> = {
  MP001: (sql) => {
    // CREATE INDEX → CREATE INDEX CONCURRENTLY
    if (/CREATE\s+INDEX\s+CONCURRENTLY/i.test(sql)) return null;
    return sql.replace(/CREATE\s+INDEX/i, 'CREATE INDEX CONCURRENTLY');
  },
  MP004: (sql) => {
    // Prepend SET lock_timeout
    return `SET lock_timeout = '5s';\n${sql}`;
  },
  MP009: (sql) => {
    // DROP INDEX → DROP INDEX CONCURRENTLY
    if (/DROP\s+INDEX\s+CONCURRENTLY/i.test(sql)) return null;
    return sql.replace(/DROP\s+INDEX/i, 'DROP INDEX CONCURRENTLY');
  },
  MP020: (sql) => {
    // Prepend SET statement_timeout
    return `SET statement_timeout = '30s';\n${sql}`;
  },
  MP021: (sql) => {
    // REINDEX → REINDEX CONCURRENTLY (PG 12+)
    if (/REINDEX\s+.*CONCURRENTLY/i.test(sql)) return null;
    return sql.replace(/REINDEX\s+(TABLE|INDEX|SCHEMA|DATABASE|SYSTEM)/i, 'REINDEX $1 CONCURRENTLY');
  },
  MP023: (sql) => {
    // CREATE TABLE → CREATE TABLE IF NOT EXISTS
    if (/IF\s+NOT\s+EXISTS/i.test(sql)) return null;
    return sql
      .replace(/CREATE\s+TABLE\s+(?!IF)/i, 'CREATE TABLE IF NOT EXISTS ')
      .replace(/CREATE\s+INDEX\s+(?!CONCURRENTLY\s+IF|IF)/i, 'CREATE INDEX IF NOT EXISTS ');
  },
  MP030: (sql) => {
    // ADD CONSTRAINT ... CHECK → ADD CONSTRAINT ... CHECK ... NOT VALID
    if (/NOT\s+VALID/i.test(sql)) return null;
    return sql.replace(/(CHECK\s*\([^)]+\))/i, '$1 NOT VALID');
  },
  MP033: (sql) => {
    // REFRESH MATERIALIZED VIEW → REFRESH MATERIALIZED VIEW CONCURRENTLY
    if (/CONCURRENTLY/i.test(sql)) return null;
    return sql.replace(/REFRESH\s+MATERIALIZED\s+VIEW/i, 'REFRESH MATERIALIZED VIEW CONCURRENTLY');
  },
  MP037: (sql) => {
    // VARCHAR(n) → TEXT
    return sql.replace(/VARCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT');
  },
  MP040: (sql) => {
    // TIMESTAMP → TIMESTAMPTZ
    return sql.replace(/\bTIMESTAMP\b(?!\s*WITH\s*TIME\s*ZONE|\s*WITHOUT\s*TIME\s*ZONE|TZ)/gi, 'TIMESTAMPTZ');
  },
  MP041: (sql) => {
    // CHAR(n) → TEXT
    return sql.replace(/\bCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT');
  },
  MP046: (sql) => {
    // DETACH PARTITION → DETACH PARTITION CONCURRENTLY
    if (/CONCURRENTLY/i.test(sql)) return null;
    return sql.replace(/DETACH\s+PARTITION/i, 'DETACH PARTITION CONCURRENTLY');
  },
};

export class QuickFixProvider implements vscode.CodeActionProvider {
  constructor(private diagnostics: DiagnosticsProvider) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== 'migrationpilot') continue;

      const ruleId = typeof diagnostic.code === 'object' && diagnostic.code !== null
        ? String(diagnostic.code.value)
        : String(diagnostic.code);

      const transform = FIX_TRANSFORMS[ruleId];
      if (!transform) continue;

      // Get the full line text
      const lineText = document.lineAt(diagnostic.range.start.line).text;
      const fixed = transform(lineText);
      if (!fixed) continue;

      const action = new vscode.CodeAction(
        `Fix ${ruleId}: ${this.getFixDescription(ruleId)}`,
        vscode.CodeActionKind.QuickFix,
      );
      action.diagnostics = [diagnostic];
      action.isPreferred = true;

      const edit = new vscode.WorkspaceEdit();

      if (ruleId === 'MP004' || ruleId === 'MP020') {
        // These prepend a SET statement before the current line
        const lineStart = new vscode.Position(diagnostic.range.start.line, 0);
        edit.insert(document.uri, lineStart, fixed.split('\n')[0]! + '\n');
      } else {
        // Replace the line with the fixed version
        edit.replace(document.uri, diagnostic.range, fixed);
      }

      action.edit = edit;
      actions.push(action);
    }

    // Add "disable for this line" action for all violations
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== 'migrationpilot') continue;

      const ruleId = typeof diagnostic.code === 'object' && diagnostic.code !== null
        ? String(diagnostic.code.value)
        : String(diagnostic.code);

      const disableAction = new vscode.CodeAction(
        `Disable ${ruleId} for this statement`,
        vscode.CodeActionKind.QuickFix,
      );
      disableAction.diagnostics = [diagnostic];

      const edit = new vscode.WorkspaceEdit();
      const lineStart = new vscode.Position(diagnostic.range.start.line, 0);
      edit.insert(document.uri, lineStart, `-- migrationpilot-disable ${ruleId}\n`);
      disableAction.edit = edit;

      actions.push(disableAction);
    }

    return actions;
  }

  private getFixDescription(ruleId: string): string {
    switch (ruleId) {
      case 'MP001': return 'Add CONCURRENTLY to CREATE INDEX';
      case 'MP004': return 'Add SET lock_timeout';
      case 'MP009': return 'Add CONCURRENTLY to DROP INDEX';
      case 'MP020': return 'Add SET statement_timeout';
      case 'MP021': return 'Add CONCURRENTLY to REINDEX';
      case 'MP023': return 'Add IF NOT EXISTS';
      case 'MP030': return 'Add NOT VALID to CHECK constraint';
      case 'MP033': return 'Add CONCURRENTLY to REFRESH MATERIALIZED VIEW';
      case 'MP037': return 'Replace VARCHAR(n) with TEXT';
      case 'MP040': return 'Replace TIMESTAMP with TIMESTAMPTZ';
      case 'MP041': return 'Replace CHAR(n) with TEXT';
      case 'MP046': return 'Add CONCURRENTLY to DETACH PARTITION';
      default: return 'Apply auto-fix';
    }
  }
}
