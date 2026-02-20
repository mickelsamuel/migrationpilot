import type { Rule, RuleContext, RuleViolation } from './engine.js';

/**
 * MP068: warn-integer-pk-capacity
 *
 * CREATE SEQUENCE with an integer type (int2, int4) has a hard overflow limit.
 * int4 maxes out at ~2.1 billion, int2 at ~32,000.
 * Migrating a sequence from int to bigint on a live table is extremely expensive.
 *
 * This complements MP038 (prefer-bigint-over-int for columns) by catching
 * explicit sequence definitions and SERIAL-based sequences.
 */

export const warnIntegerPkCapacity: Rule = {
  id: 'MP068',
  name: 'warn-integer-pk-capacity',
  severity: 'warning',
  description: 'Sequence uses integer type (max ~2.1B). Use bigint to avoid expensive future migration.',
  whyItMatters:
    'Integer sequences overflow at ~2.1 billion (int4) or ~32,000 (int2). When a sequence overflows, ' +
    'all INSERTs fail with a "nextval: reached maximum value" error. Migrating from integer to bigint ' +
    'on a live sequence requires rewriting the dependent column under ACCESS EXCLUSIVE lock. ' +
    'Buildkite, Mailchimp, and others have reported major outages from this.',
  docsUrl: 'https://migrationpilot.dev/rules/mp068',

  check(stmt: Record<string, unknown>, ctx: RuleContext): RuleViolation | null {
    // Check CREATE SEQUENCE ... AS integer
    const createSeq = stmt.CreateSeqStmt as {
      sequence?: { relname?: string };
      options?: Array<{
        DefElem?: {
          defname?: string;
          arg?: {
            TypeName?: {
              names?: Array<{ String?: { sval?: string } }>;
            };
          };
        };
      }>;
    } | undefined;

    if (createSeq?.sequence?.relname) {
      const seqName = createSeq.sequence.relname;
      const options = createSeq.options ?? [];

      for (const opt of options) {
        const elem = opt.DefElem;
        if (elem?.defname !== 'as') continue;

        const typeNames = elem.arg?.TypeName?.names
          ?.map(n => n.String?.sval)
          .filter((n): n is string => !!n) ?? [];

        const isSmallType = typeNames.some(n =>
          n === 'int4' || n === 'int2' || n === 'integer' || n === 'smallint'
        );

        if (isSmallType) {
          return {
            ruleId: 'MP068',
            ruleName: 'warn-integer-pk-capacity',
            severity: 'warning',
            message: `Sequence "${seqName}" uses integer type (max ~2.1B). Use BIGINT to prevent overflow and avoid expensive future migration.`,
            line: ctx.line,
            safeAlternative: `-- Use bigint for sequences to prevent overflow:
CREATE SEQUENCE ${seqName} AS bigint;`,
          };
        }
      }
    }

    return null;
  },
};
