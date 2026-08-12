/**
 * The GitHub Action's pipeline: read the inputs, work out which migrations this
 * pull request touches, analyze them, report, and set the verdict.
 *
 * `index.ts` is the entry point that calls this; keeping the two apart is what
 * lets the pipeline be driven by a test without importing a module that runs
 * itself on load.
 */
export declare function run(): Promise<void>;
//# sourceMappingURL=run.d.ts.map