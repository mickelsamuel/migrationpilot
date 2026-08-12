/**
 * What the workflow token is allowed to do, and what to say when it isn't.
 *
 * Every repository created since 2023 defaults `default_workflow_permissions`
 * to `read`, and two of the Action's API calls need more than that: listing the
 * pull request's changed files, and posting the report comment. Both used to
 * throw, and the throw reached the top-level catch as `core.setFailed`, so a
 * repository with the default token setting got a red check that said nothing
 * about its migrations — the run died before a single statement was parsed.
 *
 * Neither call is the analysis. The verdict comes from the SQL, so a denied
 * token degrades the run instead of ending it: warn with the block that fixes
 * it, and carry on.
 */

/** The permissions block a workflow needs for the full experience. */
export const PERMISSIONS_BLOCK = ['permissions:', '  contents: read', '  pull-requests: write'].join(
  '\n',
);

/**
 * Did GitHub refuse this call because of what the token may do?
 *
 * 403 is the documented answer ("Resource not accessible by integration"). 404
 * is the other one: on a private repository the API hides resources the token
 * cannot reach rather than admitting they exist.
 */
export function isPermissionError(error: unknown): boolean {
  const status = statusOf(error);
  return status === 403 || status === 404;
}

/** What the API said, for quoting back to the user. */
export function apiReason(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  const text = typeof message === 'string' ? message.trim() : '';
  const status = statusOf(error);
  if (text.length === 0) return status === undefined ? 'no reason given' : `HTTP ${status}`;
  return status === undefined ? text : `HTTP ${status}: ${text}`;
}

/**
 * The token cannot see which files the PR touched, so the glob has to stand in
 * for the diff.
 */
export function prFilesDeniedWarning(pattern: string, reason: string): string {
  return [
    `MigrationPilot: the workflow token can't list this pull request's files (${reason}).`,
    `Analyzing everything matching "${pattern}" in the checked-out tree instead.`,
    'Grant `pull-requests: write` in the workflow\'s permissions block to narrow the analysis to',
    'the changed files and enable the PR comment:',
    '',
    PERMISSIONS_BLOCK,
  ].join('\n');
}

/** The token cannot post the comment. The check still carries the verdict. */
export function commentDeniedWarning(reason: string): string {
  return [
    `MigrationPilot: the workflow token can't post the report comment (${reason}).`,
    'The analysis ran and still decides this check — only the comment is missing.',
    'Add this to the workflow to get it back:',
    '',
    PERMISSIONS_BLOCK,
  ].join('\n');
}

function statusOf(error: unknown): number | undefined {
  const err = error as { status?: unknown; response?: { status?: unknown } } | null;
  if (typeof err?.status === 'number') return err.status;
  if (typeof err?.response?.status === 'number') return err.response.status;
  return undefined;
}
