/**
 * Watch mode for MigrationPilot.
 *
 * Watches migration SQL files for changes and re-analyzes on save.
 * Uses Node.js fs.watch with a debounce to avoid duplicate triggers.
 */
import type { Rule } from '../rules/engine.js';
export interface WatchOptions {
    dir: string;
    pattern: string;
    pgVersion: number;
    rules: Rule[];
    onAnalysis?: (file: string, output: string, violations: number) => void;
    onError?: (file: string, error: string) => void;
}
/**
 * Start watching a directory for migration file changes.
 * Returns a cleanup function to stop watching.
 */
export declare function startWatch(opts: WatchOptions): Promise<() => void>;
//# sourceMappingURL=watcher.d.ts.map