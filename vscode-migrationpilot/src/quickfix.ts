import * as vscode from 'vscode';
import type { DiagnosticsProvider } from './diagnostics';
import { computeQuickFix } from './fix-action';

/**
 * Turns MigrationPilot diagnostics into code actions.
 *
 * The rewrite itself comes from the engine's fixer via `computeQuickFix`, so
 * the lightbulb applies the same edit `migrationpilot --fix` writes, for the
 * same set of rules. Nothing here decides which rules are fixable.
 */
export class QuickFixProvider implements vscode.CodeActionProvider {
  constructor(private diagnostics: DiagnosticsProvider) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const ours = context.diagnostics.filter(d => d.source === 'migrationpilot');
    if (ours.length === 0) return [];

    const sql = document.getText();
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of ours) {
      const ruleId = ruleIdOf(diagnostic);
      // The diagnostic's range tracks edits made since the analysis, so it is
      // a better line number than the one the analysis recorded.
      const fix = computeQuickFix(sql, ruleId, diagnostic.range.start.line + 1);
      if (!fix) continue;

      const action = new vscode.CodeAction(
        `Fix ${ruleId}: ${fix.title}`,
        vscode.CodeActionKind.QuickFix,
      );
      action.diagnostics = [diagnostic];
      action.isPreferred = true;

      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(fix.start), document.positionAt(fix.end)),
        fix.newText,
      );
      action.edit = edit;

      actions.push(action);
    }

    // Every violation can be silenced, whether or not it can be fixed.
    for (const diagnostic of ours) {
      const ruleId = ruleIdOf(diagnostic);

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
}

/** The rule ID a diagnostic carries, whether or not it links to the docs. */
function ruleIdOf(diagnostic: vscode.Diagnostic): string {
  return typeof diagnostic.code === 'object' && diagnostic.code !== null
    ? String(diagnostic.code.value)
    : String(diagnostic.code);
}
