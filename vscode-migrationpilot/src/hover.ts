import * as vscode from 'vscode';
import type { DiagnosticsProvider } from './diagnostics';

export class RuleHoverProvider implements vscode.HoverProvider {
  constructor(private diagnostics: DiagnosticsProvider) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | null {
    const violations = this.diagnostics.getViolationsForUri(document.uri.toString());
    if (violations.length === 0) return null;

    const line = position.line + 1;
    const lineViolations = violations.filter(v => v.line === line);
    if (lineViolations.length === 0) return null;

    const contents = new vscode.MarkdownString('', true);
    contents.isTrusted = true;
    contents.supportHtml = true;

    for (const v of lineViolations) {
      const severityIcon = v.severity === 'critical' ? '$(error)' : '$(warning)';
      const severityLabel = v.severity === 'critical' ? '**Critical**' : '**Warning**';

      contents.appendMarkdown(`### ${severityIcon} ${v.ruleId}: ${v.ruleName}\n\n`);
      contents.appendMarkdown(`${severityLabel} | `);

      if (v.autoFixable) {
        contents.appendMarkdown('Auto-fixable\n\n');
      } else {
        contents.appendMarkdown('Manual fix required\n\n');
      }

      contents.appendMarkdown(`${v.message}\n\n`);

      if (v.whyItMatters) {
        contents.appendMarkdown(`**Why this matters:** ${v.whyItMatters}\n\n`);
      }

      if (v.safeAlternative) {
        contents.appendMarkdown(`**Safe alternative:**\n\`\`\`sql\n${v.safeAlternative}\n\`\`\`\n\n`);
      }

      if (v.docsUrl) {
        contents.appendMarkdown(`[View rule documentation](${v.docsUrl})\n\n`);
      }

      contents.appendMarkdown('---\n\n');
    }

    return new vscode.Hover(contents);
  }
}
