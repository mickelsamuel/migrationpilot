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
/** The slice of Octokit's `issues` namespace this module calls. */
export interface IssueCommentsApi {
    listComments(params: {
        owner: string;
        repo: string;
        issue_number: number;
        per_page: number;
        page: number;
    }): Promise<{
        data: Array<{
            id: number;
            body?: string | null;
        }>;
    }>;
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
export type CommentOutcome = {
    posted: true;
    action: 'created';
} | {
    posted: true;
    action: 'updated';
    id: number;
} | {
    posted: false;
    warning: string;
};
export interface UpsertCommentOptions {
    issues: IssueCommentsApi;
    repo: {
        owner: string;
        repo: string;
    };
    prNumber: number;
    body: string;
    /** Hidden HTML comment identifying this Action's own comment. */
    marker: string;
}
export declare function upsertReportComment(options: UpsertCommentOptions): Promise<CommentOutcome>;
//# sourceMappingURL=comment.d.ts.map