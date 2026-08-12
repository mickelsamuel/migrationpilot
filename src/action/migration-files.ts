/**
 * Which migration files this run analyzes.
 *
 * The pull request's changed files are the right answer: a PR that touches one
 * migration should not be judged on the fifty that were merged last year. That
 * list comes from the API, and the API needs a token that may read pull
 * requests. When it refuses, the checked-out tree is the fallback — wider than
 * the diff, but an over-broad report beats no report at all.
 */

import { glob } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { apiReason, isPermissionError, prFilesDeniedWarning } from './permissions.js';

/** The slice of Octokit's `pulls` namespace this module calls. */
export interface PullFilesApi {
  listFiles(params: {
    owner: string;
    repo: string;
    pull_number: number;
    per_page: number;
    page: number;
  }): Promise<{ data: Array<{ filename: string; status: string }> }>;
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
  repo: { owner: string; repo: string };
  prNumber: number;
  /** The `migration-path` input, e.g. `migrations/*.sql`. */
  pattern: string;
  /** Where the tree fallback looks. Defaults to the workspace the Action runs in. */
  cwd?: string;
}

export async function resolveMigrationFiles(
  options: ResolveMigrationFilesOptions,
): Promise<MigrationFileSet> {
  const { pulls, repo, prNumber, pattern, cwd } = options;

  try {
    const changed = await listChangedFiles(pulls, repo, prNumber);
    return { files: filterMigrationFiles(changed, pattern), source: 'pr' };
  } catch (error) {
    if (!isPermissionError(error)) throw error;
    return {
      files: await globMigrationFiles(pattern, cwd),
      source: 'tree',
      warning: prFilesDeniedWarning(pattern, apiReason(error)),
    };
  }
}

/** Every file the PR adds or modifies. Deletions are not there to analyze. */
export async function listChangedFiles(
  pulls: PullFilesApi,
  repo: { owner: string; repo: string },
  prNumber: number,
): Promise<string[]> {
  const files: string[] = [];
  let page = 1;

  while (true) {
    const response = await pulls.listFiles({
      owner: repo.owner,
      repo: repo.repo,
      pull_number: prNumber,
      per_page: 100,
      page,
    });

    for (const file of response.data) {
      if (file.status !== 'removed') files.push(file.filename);
    }

    if (response.data.length < 100) break;
    page++;
  }

  return files;
}

/**
 * Filter a known list of paths to those matching the migration path pattern.
 * Supports simple glob patterns like `migrations/*.sql`.
 */
export function filterMigrationFiles(files: string[], pattern: string): string[] {
  // Sanitize: strip all regex metacharacters except * and .
  const sanitized = pattern.replace(/[^a-zA-Z0-9_\-/.* ]/g, '');

  // Convert simple glob pattern to regex
  const regexStr = sanitized
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*');

  let regex: RegExp;
  try {
    regex = new RegExp(`^${regexStr}$`);
  } catch {
    // If regex construction fails, fall back to exact match
    return files.filter(f => f === pattern);
  }

  return files.filter(f => regex.test(f));
}

/** Every file in the checked-out tree matching the pattern, repo-relative. */
export async function globMigrationFiles(pattern: string, cwd?: string): Promise<string[]> {
  const root = cwd ?? process.cwd();
  const files: string[] = [];

  for await (const entry of glob(pattern, {
    cwd: root,
    withFileTypes: true,
    exclude: dirent => dirent.name === 'node_modules' || dirent.name === '.git',
  })) {
    if (!entry.isFile()) continue;
    files.push(relative(root, join(entry.parentPath, entry.name)).replace(/\\/g, '/'));
  }

  return files.sort();
}
