import * as vscode from 'vscode';
import { DiagnosticsProvider } from './diagnostics';
import { RuleHoverProvider } from './hover';
import { QuickFixProvider } from './quickfix';

let diagnosticsProvider: DiagnosticsProvider;

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('migrationpilot');
  if (!config.get<boolean>('enable', true)) return;

  diagnosticsProvider = new DiagnosticsProvider(context);

  // Register hover provider for SQL files
  const hoverProvider = new RuleHoverProvider(diagnosticsProvider);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      [{ language: 'sql' }, { language: 'pgsql' }, { language: 'postgres' }, { scheme: 'file', pattern: '**/*.sql' }],
      hoverProvider,
    ),
  );

  // Register code action provider for quick fixes
  const quickFixProvider = new QuickFixProvider(diagnosticsProvider);
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [{ language: 'sql' }, { language: 'pgsql' }, { language: 'postgres' }, { scheme: 'file', pattern: '**/*.sql' }],
      quickFixProvider,
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('migrationpilot.analyzeFile', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        diagnosticsProvider.analyzeDocument(editor.document);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('migrationpilot.analyzeWorkspace', async () => {
      const pattern = config.get<string>('filePattern', '**/*.sql');
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 500);
      let count = 0;
      for (const file of files) {
        const doc = await vscode.workspace.openTextDocument(file);
        await diagnosticsProvider.analyzeDocument(doc);
        count++;
      }
      vscode.window.showInformationMessage(`MigrationPilot: Analyzed ${count} SQL files`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('migrationpilot.clearDiagnostics', () => {
      diagnosticsProvider.clearAll();
      vscode.window.showInformationMessage('MigrationPilot: Diagnostics cleared');
    }),
  );

  // Analyze on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isSqlFile(doc)) {
        diagnosticsProvider.analyzeDocument(doc);
      }
    }),
  );

  // Analyze on open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (isSqlFile(doc)) {
        diagnosticsProvider.analyzeDocument(doc);
      }
    }),
  );

  // Clear diagnostics when file is closed
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      diagnosticsProvider.clearForDocument(doc.uri);
    }),
  );

  // Re-analyze on config change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('migrationpilot')) {
        diagnosticsProvider.reloadConfig();
        // Re-analyze all open SQL files
        for (const editor of vscode.window.visibleTextEditors) {
          if (isSqlFile(editor.document)) {
            diagnosticsProvider.analyzeDocument(editor.document);
          }
        }
      }
    }),
  );

  // Analyze already-open SQL files
  for (const editor of vscode.window.visibleTextEditors) {
    if (isSqlFile(editor.document)) {
      diagnosticsProvider.analyzeDocument(editor.document);
    }
  }
}

export function deactivate(): void {
  diagnosticsProvider?.dispose();
}

function isSqlFile(doc: vscode.TextDocument): boolean {
  if (['sql', 'pgsql', 'postgres'].includes(doc.languageId)) return true;
  if (doc.fileName.endsWith('.sql')) return true;
  return false;
}
