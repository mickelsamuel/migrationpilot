# Risk scoring

Every MigrationPilot report opens with a number and a colour:

```
  ✗ MigrationPilot —  RED  Score: 100/100
```

This page says exactly what that number means, because there are two different
scores in the output and they measure different things.

## The score is danger, not safety

Higher is worse. `0` is a migration that does nothing risky; `100` is as bad as
the scale goes. It is not a grade, not a percentage of checks passed, and not a
confidence level. A migration scoring 90 is in more trouble than one scoring 20.

The colour follows the number:

| Score | Level |
|------:|-------|
| 50–100 | RED |
| 25–49 | YELLOW |
| 0–24 | GREEN |

The playground labels these "High risk", "Moderate risk" and "Low risk". Same
thresholds, friendlier words.

## Two scores

**Statement score — blast radius.** How much damage one statement does while it
runs. It comes from the lock it takes, and with `--database-url` it also
accounts for how big the table is and how much traffic hits it.

| Factor | Max | Needs a database? |
|--------|----:|-------------------|
| Lock severity | 40 | no |
| Table size | 30 | yes |
| Query frequency | 30 | yes |

Rule violations are deliberately absent from this number. It answers "what does
this statement do to the database", not "did it break a rule". A statement can
take a brutal lock and break no rules, or break three rules and finish
instantly.

### The Risk column is not that number

Readers take the Risk column as "how much trouble is this line in", so it shows
the worse of the two things known about a statement: what its lock does, and
what the rules found in it. A statement carrying a critical violation reads RED,
warnings lift a clean statement to YELLOW, and a violation never de-escalates a
brutal lock. Every surface that draws the column follows the same rule — the CLI
table, the markdown report and the PR comment.

Without it the column contradicted the header. Lock severity caps at 40 and the
other two factors need a database, so a statement full of criticals sat at
YELLOW under a RED headline and the row won the argument: reviewers read it and
concluded nothing was urgent.

This moves the badge, not the measurement. `--format json` and the MCP tools
still report each statement's blast-radius level and score, because a machine
reading the output wants what was measured rather than what to look at first.

**Migration score — the headline.** The number in the header, in `--format
json`, in the PR comment, in the MCP tools and in the playground. It is the
worse of two tracks: the blast radius of the riskiest statement, and what the
rules found.

| Violations | Score |
|------------|------:|
| 1 critical | 70 |
| 2 criticals | 80 |
| 3 criticals | 90 |
| 4 or more criticals | 100 |
| warnings only | 30, +5 each, capped at 45 |
| none | whatever the blast radius says |

So a critical always lands in RED, and warnings on their own never do — RED is
reserved for "something here is critical". When a production connection pushes
the blast radius higher than the violation score, the blast radius wins.

## Why the headline weighs violations

It did not always. The headline used to be the blast radius alone, and the
blast radius cannot reach 50 without a database connection: lock severity stops
at 40, and the other two factors need `--database-url`. Free-tier users could
not see RED no matter what their migration did. A file with four CRITICAL
violations came out at 30/100, which the playground rendered as "Moderate
risk" — the opposite of the truth. Criticals now set a floor the locks cannot
undercut.

## What the score is not

It does not decide your exit code. `--fail-on` counts violations by severity,
not score, so CI behaviour does not shift when the scoring changes.

It is also not the rollback grade. That answers a separate question — whether
you can undo this migration — and lives in [rollback-grading.md](rollback-grading.md).
