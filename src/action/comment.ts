/**
 * Posting the report on the pull request.
 *
 * One comment per PR, found again on the next push through a hidden marker and
 * edited in place, so a busy PR does not accumulate a wall of stale reports.
 *
 * Posting needs `pull-requests: write`, which a default read-only workflow
 * token does not have. That refusal is reported, never thrown: the comment is
 * how the analysis is *shown*, not how it is decided.
 */

import { apiReason, commentDeniedWarning, isPermissionError } from './permissions.js';

/** The slice of Octokit's `issues` namespace this module calls. */
export interface IssueCommentsApi {
  listComments(params: {
    owner: string;
    repo: string;
    issue_number: number;
    per_page: number;
    page: number;
  }): Promise<{ data: Array<{ id: number; body?: string | null }> }>;
  updateComment(params: {
    owner: string;
    repo: string;
    comment_id: number;
    body: string;
  }): Promise<unknown>;
  createComment(params: {
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
  }): Promise<unknown>;
}

export type CommentOutcome =
  | { posted: true; action: 'created' }
  | { posted: true; action: 'updated'; id: number }
  | { posted: false; warning: string };

export interface UpsertCommentOptions {
  issues: IssueCommentsApi;
  repo: { owner: string; repo: string };
  prNumber: number;
  body: string;
  /** Hidden HTML comment identifying this Action's own comment. */
  marker: string;
}

export async function upsertReportComment(
  options: UpsertCommentOptions,
): Promise<CommentOutcome> {
  const { issues, repo, prNumber, body, marker } = options;

  try {
    const existing = await findExistingComment(issues, repo, prNumber, marker);

    if (existing) {
      await issues.updateComment({
        owner: repo.owner,
        repo: repo.repo,
        comment_id: existing.id,
        body,
      });
      return { posted: true, action: 'updated', id: existing.id };
    }

    await issues.createComment({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: prNumber,
      body,
    });
    return { posted: true, action: 'created' };
  } catch (error) {
    if (!isPermissionError(error)) throw error;
    return { posted: false, warning: commentDeniedWarning(apiReason(error)) };
  }
}

async function findExistingComment(
  issues: IssueCommentsApi,
  repo: { owner: string; repo: string },
  prNumber: number,
  marker: string,
): Promise<{ id: number } | undefined> {
  let page = 1;

  while (true) {
    const { data: comments } = await issues.listComments({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: prNumber,
      per_page: 100,
      page,
    });

    const found = comments.find(c => c.body?.includes(marker));
    if (found) return found;
    if (comments.length < 100) return undefined;
    page++;
  }
}
