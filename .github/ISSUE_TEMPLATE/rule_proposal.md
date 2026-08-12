---
name: Rule Proposal
about: Propose a new safety rule for a dangerous migration pattern
title: ''
labels: rule-proposal
assignees: ''
---

## The Dangerous SQL
```sql
-- The migration statement that should be flagged
```

## PostgreSQL Versions Affected
Which versions does this bite on? If a newer version fixed it, say which one — several
rules only apply below a certain version (for example, `ADD COLUMN` with a non-volatile
default stopped rewriting the table in PG 11).

## What Goes Wrong
What lock does the statement take, and what does that block? If it is not a lock
problem, describe the actual consequence — a table rewrite, a full scan under lock,
replication lag, a failed deploy. Concrete numbers from a real incident help.

## The Safe Alternative
```sql
-- The rewrite that does the same thing without the outage
```
If the safe version is multi-step (backfill, deploy, then swap), lay out the steps —
that decides whether this can be auto-fixed or needs a plan.

## References
Docs, the PostgreSQL source, a handbook chapter, a post-mortem — anything that backs
up the claim. If you know a `docs/handbook/` chapter this belongs with, name it.

## Anything Else
Does an existing rule already come close? Would this fire on migrations that are
actually fine — and if so, when?
