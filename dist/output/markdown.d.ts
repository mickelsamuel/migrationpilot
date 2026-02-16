import type { AnalysisOutput } from './cli.js';
import type { Rule } from '../rules/engine.js';
/**
 * Format analysis output as clean GitHub-Flavored Markdown.
 * No chalk/color dependencies — plain text suitable for docs, wikis, Notion.
 */
export declare function formatMarkdown(analysis: AnalysisOutput, rules?: Rule[]): string;
//# sourceMappingURL=markdown.d.ts.map