# PostgreSQL Migration Safety Knowledge

## DDL Lock Types (Core Lookup Table)
| DDL Operation | Lock Type | Blocks Reads? | Blocks Writes? | Long Held? |
|---------------|-----------|:---:|:---:|:---:|
| ADD COLUMN (no default) | ACCESS EXCLUSIVE | Brief | Brief | No |
| ADD COLUMN WITH DEFAULT (PG11+, non-volatile) | ACCESS EXCLUSIVE | Brief | Brief | No |
| ADD COLUMN WITH DEFAULT (PG<11 or volatile) | ACCESS EXCLUSIVE | LONG | LONG | Yes |
| DROP COLUMN | ACCESS EXCLUSIVE | Brief | Brief | No |
| ALTER COLUMN TYPE | ACCESS EXCLUSIVE | LONG | LONG | Yes |
| ALTER COLUMN SET NOT NULL | ACCESS EXCLUSIVE | LONG | LONG | Yes |
| ADD CONSTRAINT (CHECK/FK) | ACCESS EXCLUSIVE | Yes | Yes | Yes |
| ADD CONSTRAINT ... NOT VALID | ACCESS EXCLUSIVE | Brief | Brief | No |
| VALIDATE CONSTRAINT | SHARE UPDATE EXCL | No | No | No |
| CREATE INDEX | SHARE | No | LONG | Yes |
| CREATE INDEX CONCURRENTLY | SHARE UPDATE EXCL | No | No | No |
| DROP INDEX | ACCESS EXCLUSIVE | Brief | Brief | No |
| DROP INDEX CONCURRENTLY | SHARE UPDATE EXCL | No | No | No |
| CREATE TABLE | SHARE LOCK on referenced | No | No | No |
| DROP TABLE | ACCESS EXCLUSIVE | Yes | Yes | Brief |
| VACUUM FULL | ACCESS EXCLUSIVE | LONG | LONG | Yes |
| CLUSTER | ACCESS EXCLUSIVE | LONG | LONG | Yes |
| REINDEX | SHARE | No | LONG | Yes |
| REINDEX CONCURRENTLY | SHARE UPDATE EXCL | No | No | No |

## 14 Analysis Rules
| ID | Name | Severity | What It Catches |
|----|------|----------|----------------|
| MP001 | require-concurrent-index | Critical | CREATE INDEX without CONCURRENTLY |
| MP002 | require-check-not-null | Critical | SET NOT NULL without CHECK pattern |
| MP003 | volatile-default-rewrite | Critical | ADD COLUMN WITH volatile DEFAULT on PG<11 |
| MP004 | require-lock-timeout | Critical | No SET lock_timeout before DDL |
| MP005 | require-not-valid-fk | Critical | FK constraint without NOT VALID |
| MP006 | no-vacuum-full | Critical | VACUUM FULL usage |
| MP007 | no-column-type-change | Critical | ALTER COLUMN TYPE (requires expand-contract) |
| MP008 | no-multi-ddl-transaction | Critical | Multiple DDL in single transaction |
| MP009 | volatile-default-warning | Warning | Volatile default on PG11+ |
| MP010 | long-running-queries | Warning | DDL on table with active long queries |
| MP011 | peak-traffic-index | Warning | Index creation during peak hours |
| MP012 | unbatched-backfill | Warning | UPDATE without LIMIT/batching |
| MP013 | no-rollback-plan | Warning | Missing reverse migration |
| MP014 | many-fk-references | Warning | DDL on table with many FK references |

## Safe Patterns
- **NOT NULL on large table**: Add CHECK NOT VALID → VALIDATE → SET NOT NULL (PG12+)
- **Index on large table**: CREATE INDEX CONCURRENTLY
- **FK on large table**: ADD CONSTRAINT ... NOT VALID → VALIDATE CONSTRAINT
- **Column type change**: Expand-contract (new col → backfill → swap → drop old)
- **Always**: SET lock_timeout before DDL, wrap in retry logic
