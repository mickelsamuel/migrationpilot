/**
 * Migration framework auto-detection.
 *
 * Detects popular PostgreSQL migration frameworks from project structure,
 * config files, and migration file naming patterns. Used to:
 * - Automatically find migration directories
 * - Suggest correct --migration-path patterns
 * - Adapt rule behavior (e.g., Flyway uses V__*.sql naming)
 */
export interface DetectedFramework {
    /** Framework name */
    name: string;
    /** Short identifier */
    id: FrameworkId;
    /** Confidence: high (config file found), medium (directory pattern), low (heuristic) */
    confidence: 'high' | 'medium' | 'low';
    /** Detected migration directory path (relative) */
    migrationPath?: string;
    /** Suggested glob pattern for migration files */
    filePattern?: string;
    /** Evidence that led to detection */
    evidence: string;
}
export type FrameworkId = 'flyway' | 'liquibase' | 'alembic' | 'django' | 'knex' | 'prisma' | 'typeorm' | 'drizzle' | 'sequelize' | 'goose' | 'dbmate' | 'sqitch' | 'rails' | 'ecto' | 'unknown';
/**
 * Auto-detect migration framework(s) in the given directory.
 * Returns all detected frameworks, sorted by confidence (highest first).
 */
export declare function detectFrameworks(dir: string): Promise<DetectedFramework[]>;
/**
 * Get the suggested migration path for a detected framework.
 */
export declare function getSuggestedPattern(framework: DetectedFramework): string;
//# sourceMappingURL=detect.d.ts.map