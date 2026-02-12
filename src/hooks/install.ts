/**
 * Git pre-commit hook installer for MigrationPilot.
 *
 * Installs a git pre-commit hook that runs MigrationPilot on staged
 * SQL migration files. Supports both standalone hooks and husky/lint-staged.
 */

import { readFile, writeFile, chmod, stat, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const HOOK_MARKER = '# migrationpilot-hook';

const HOOK_SCRIPT = `#!/bin/sh
${HOOK_MARKER}
# MigrationPilot pre-commit hook
# Analyzes staged SQL migration files for safety violations

# Get list of staged .sql files
STAGED_SQL=$(git diff --cached --name-only --diff-filter=ACM | grep '\\.sql$' || true)

if [ -z "$STAGED_SQL" ]; then
  exit 0
fi

echo "MigrationPilot: Checking staged migration files..."

FAILED=0
for FILE in $STAGED_SQL; do
  # Get the staged content
  CONTENT=$(git show ":$FILE")
  if [ -z "$CONTENT" ]; then
    continue
  fi

  # Write to temp file and analyze
  TMPFILE=$(mktemp /tmp/mp-XXXXXX.sql)
  echo "$CONTENT" > "$TMPFILE"

  if ! npx migrationpilot analyze "$TMPFILE" --fail-on critical 2>/dev/null; then
    echo "  FAILED: $FILE has critical violations"
    FAILED=1
  fi

  rm -f "$TMPFILE"
done

if [ "$FAILED" = "1" ]; then
  echo ""
  echo "MigrationPilot: Commit blocked due to critical migration violations."
  echo "Fix the issues above or use --no-verify to skip this check."
  exit 1
fi

echo "MigrationPilot: All migration files passed."
exit 0
`;

export interface InstallResult {
  success: boolean;
  message: string;
  hookPath?: string;
}

/**
 * Install MigrationPilot pre-commit hook.
 * Supports standalone git hooks and detects husky.
 */
export async function installPreCommitHook(projectDir?: string): Promise<InstallResult> {
  const dir = resolve(projectDir || '.');

  // Check if we're in a git repo
  const gitDir = join(dir, '.git');
  try {
    await stat(gitDir);
  } catch {
    return { success: false, message: 'Not a git repository. Run from the root of your project.' };
  }

  // Check for husky
  const huskyDir = join(dir, '.husky');
  try {
    await stat(huskyDir);
    return await installHuskyHook(huskyDir);
  } catch {
    // No husky, install standalone
  }

  // Install standalone git hook
  return await installStandaloneHook(gitDir);
}

/**
 * Uninstall MigrationPilot pre-commit hook.
 */
export async function uninstallPreCommitHook(projectDir?: string): Promise<InstallResult> {
  const dir = resolve(projectDir || '.');

  // Check husky first
  const huskyHookPath = join(dir, '.husky', 'pre-commit');
  try {
    const content = await readFile(huskyHookPath, 'utf-8');
    if (content.includes(HOOK_MARKER)) {
      // Remove MigrationPilot lines from husky hook
      const lines = content.split('\n');
      const filtered = lines.filter(l =>
        !l.includes('migrationpilot') && !l.includes(HOOK_MARKER)
      );
      await writeFile(huskyHookPath, filtered.join('\n'));
      return { success: true, message: 'Removed MigrationPilot from husky pre-commit hook.', hookPath: huskyHookPath };
    }
  } catch {
    // No husky hook
  }

  // Check standalone hook
  const hookPath = join(dir, '.git', 'hooks', 'pre-commit');
  try {
    const content = await readFile(hookPath, 'utf-8');
    if (content.includes(HOOK_MARKER)) {
      // If the entire file is our hook, remove it
      const { unlink } = await import('node:fs/promises');
      await unlink(hookPath);
      return { success: true, message: 'Removed MigrationPilot pre-commit hook.', hookPath };
    }
    return { success: false, message: 'Pre-commit hook exists but was not installed by MigrationPilot.' };
  } catch {
    return { success: false, message: 'No pre-commit hook found.' };
  }
}

async function installStandaloneHook(gitDir: string): Promise<InstallResult> {
  const hooksDir = join(gitDir, 'hooks');
  const hookPath = join(hooksDir, 'pre-commit');

  // Create hooks dir if needed
  await mkdir(hooksDir, { recursive: true });

  // Check if pre-commit hook already exists
  try {
    const existing = await readFile(hookPath, 'utf-8');
    if (existing.includes(HOOK_MARKER)) {
      return { success: true, message: 'MigrationPilot pre-commit hook already installed.', hookPath };
    }
    // Hook exists but isn't ours — don't overwrite
    return {
      success: false,
      message: `Pre-commit hook already exists at ${hookPath}. Consider using husky for multiple hooks.`,
    };
  } catch {
    // Hook doesn't exist — install it
  }

  await writeFile(hookPath, HOOK_SCRIPT);
  try {
    await chmod(hookPath, 0o755);
  } catch {
    // chmod may not work on Windows, that's ok
  }

  return { success: true, message: `Installed pre-commit hook at ${hookPath}`, hookPath };
}

async function installHuskyHook(huskyDir: string): Promise<InstallResult> {
  const hookPath = join(huskyDir, 'pre-commit');
  const huskyCommand = 'npx migrationpilot check . --fail-on critical';

  try {
    const existing = await readFile(hookPath, 'utf-8');
    if (existing.includes('migrationpilot')) {
      return { success: true, message: 'MigrationPilot already configured in husky pre-commit.', hookPath };
    }
    // Append to existing hook
    const updated = existing.trimEnd() + `\n\n${HOOK_MARKER}\n${huskyCommand}\n`;
    await writeFile(hookPath, updated);
    return { success: true, message: `Added MigrationPilot to existing husky pre-commit hook.`, hookPath };
  } catch {
    // No pre-commit hook yet — create one
    const content = `#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\n${HOOK_MARKER}\n${huskyCommand}\n`;
    await writeFile(hookPath, content);
    try {
      await chmod(hookPath, 0o755);
    } catch {
      // Windows
    }
    return { success: true, message: `Created husky pre-commit hook at ${hookPath}`, hookPath };
  }
}
