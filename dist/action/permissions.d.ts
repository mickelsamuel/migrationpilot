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
export declare const PERMISSIONS_BLOCK: string;
/**
 * Did GitHub refuse this call because of what the token may do?
 *
 * 403 is the documented answer ("Resource not accessible by integration"). 404
 * is the other one: on a private repository the API hides resources the token
 * cannot reach rather than admitting they exist.
 */
export declare function isPermissionError(error: unknown): boolean;
/** What the API said, for quoting back to the user. */
export declare function apiReason(error: unknown): string;
/**
 * The token cannot see which files the PR touched, so the glob has to stand in
 * for the diff.
 */
export declare function prFilesDeniedWarning(pattern: string, reason: string): string;
/** The token cannot post the comment. The check still carries the verdict. */
export declare function commentDeniedWarning(reason: string): string;
//# sourceMappingURL=permissions.d.ts.map