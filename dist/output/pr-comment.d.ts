import type { RiskScore } from '../scoring/score.js';
import type { Rule, RuleViolation } from '../rules/engine.js';
import type { LockClassification } from '../locks/classify.js';
import type { AffectedQuery } from '../scoring/score.js';
export interface PRAnalysisResult {
    file: string;
    statements: Array<{
        sql: string;
        lock: LockClassification;
        risk: RiskScore;
    }>;
    overallRisk: RiskScore;
    violations: RuleViolation[];
    affectedQueries?: AffectedQuery[];
}
export declare function buildPRComment(analysis: PRAnalysisResult, rules?: Rule[]): string;
//# sourceMappingURL=pr-comment.d.ts.map