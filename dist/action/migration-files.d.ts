/**
 * Which migration files this run analyzes.
 *
 * The pull request's changed files are the right answer: a PR that touches one
 * migration should not be judged on the fifty that were merged last year. That
 * list comes from the API, and the API needs a token that may read pull
 * requests. When it refuses, the checked-out tree is the fallback — wider than
 * the diff, but an over-broad report beats no report at all.
 */
/** The slice of Octokit's `pulls` namespace this module calls. */
export interface PullFilesApi {
    listFiles(params: {
        owner: string;
        repo: string;
        pull_number: number;
        per_page: number;
        page: number;
    }): Promise<{
        data: Array<{
            filename: string;
            status: string;
        }>;
    }>;
}
export interface MigrationFileSet {
    /** Repo-relative paths, matching the migration-path pattern. */
    files: string[];
    /** `pr` when the diff was readable, `tree` when the glob had to stand in for it. */
    source: 'pr' | 'tree';
    /** Set on the `tree` path — what to tell the user, and how to fix it. */
    warning?: string;
}
export interface ResolveMigrationFilesOptions {
    pulls: PullFilesApi;
    repo: {
        owner: string;
        repo: string;
    };
    prNumber: number;
    /** The `migration-path` input, e.g. `migrations/*.sql`. */
    pattern: string;
    /** Where the tree fallback looks. Defaults to the workspace the Action runs in. */
    cwd?: string;
}
export declare function resolveMigrationFiles(options: ResolveMigrationFilesOptions): Promise<MigrationFileSet>;
/** Every file the PR adds or modifies. Deletions are not there to analyze. */
export declare function listChangedFiles(pulls: PullFilesApi, repo: {
    owner: string;
    repo: string;
}, prNumber: number): Promise<string[]>;
/**
 * Filter a known list of paths to those matching the migration path pattern.
 * Supports simple glob patterns like `migrations/*.sql`.
 */
export declare function filterMigrationFiles(files: string[], pattern: string): string[];
/** Every file in the checked-out tree matching the pattern, repo-relative. */
export declare function globMigrationFiles(pattern: string, cwd?: string): Promise<string[]>;
//# sourceMappingURL=migration-files.d.ts.map