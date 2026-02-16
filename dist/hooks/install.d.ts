/**
 * Git pre-commit hook installer for MigrationPilot.
 *
 * Installs a git pre-commit hook that runs MigrationPilot on staged
 * SQL migration files. Supports both standalone hooks and husky/lint-staged.
 */
export interface InstallResult {
    success: boolean;
    message: string;
    hookPath?: string;
}
/**
 * Install MigrationPilot pre-commit hook.
 * Supports standalone git hooks and detects husky.
 */
export declare function installPreCommitHook(projectDir?: string): Promise<InstallResult>;
/**
 * Uninstall MigrationPilot pre-commit hook.
 */
export declare function uninstallPreCommitHook(projectDir?: string): Promise<InstallResult>;
//# sourceMappingURL=install.d.ts.map