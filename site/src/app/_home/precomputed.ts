/*
 * GENERATED FILE. Do not edit by hand.
 *
 * The report below is what the shipped analysis engine actually returns for
 * hero-migration.sql, captured so the hero renders a true result before any
 * JavaScript loads. `pnpm --dir site build` re-derives it and fails if this
 * file has drifted.
 *
 * Regenerate:  node scripts/build-home-fixture.js --write
 *
 * Any long dash inside a message or safe alternative is the engine talking,
 * quoted exactly. Fix the rule, not this file.
 */

import type { Report } from '../playground/engine';

/** Identifies the engine this report came from. Checked at build time. */
export const ENGINE_MANIFEST = {
  "ruleCount": 112,
  "databaseRuleCount": 15,
  "offlineRuleCount": 97,
  "pgVersion": 17,
  "engineBundleSha": "06e670793fe7560c",
  "fixtureSha": "8abb90a8e3222236"
} as const;

export const DEFAULT_SQL = "ALTER TABLE orders\n  ADD CONSTRAINT orders_amount_positive CHECK (amount > 0);\n\nCREATE INDEX idx_orders_customer_id\n  ON orders (customer_id);\n\nALTER TABLE users\n  ALTER COLUMN email TYPE varchar(255);";

export const PRECOMPUTED_REPORT: Report = {
  "version": "1.5.1",
  "file": "migrations/20260812_orders_constraints.sql",
  "riskLevel": "RED",
  "riskScore": 100,
  "riskFactors": [
    {
      "name": "Lock Severity",
      "value": 40,
      "weight": 40,
      "detail": "ACCESS EXCLUSIVE (long-held)"
    },
    {
      "name": "Rule Violations",
      "value": 100,
      "weight": 100,
      "detail": "6 critical, 4 warnings"
    }
  ],
  "statements": [
    {
      "sql": "ALTER TABLE orders\n  ADD CONSTRAINT orders_amount_positive CHECK (amount > 0)",
      "lockType": "ACCESS EXCLUSIVE",
      "blocksReads": true,
      "blocksWrites": true,
      "riskLevel": "YELLOW",
      "riskScore": 40
    },
    {
      "sql": "CREATE INDEX idx_orders_customer_id\n  ON orders (customer_id)",
      "lockType": "SHARE",
      "blocksReads": false,
      "blocksWrites": true,
      "riskLevel": "YELLOW",
      "riskScore": 30
    },
    {
      "sql": "ALTER TABLE users\n  ALTER COLUMN email TYPE varchar(255)",
      "lockType": "ACCESS EXCLUSIVE",
      "blocksReads": true,
      "blocksWrites": true,
      "riskLevel": "YELLOW",
      "riskScore": 40
    }
  ],
  "violations": [
    {
      "ruleId": "MP004",
      "ruleName": "require-lock-timeout",
      "severity": "critical",
      "message": "DDL statement acquires ACCESS EXCLUSIVE lock without a preceding SET lock_timeout. Without a timeout, this statement could block the lock queue indefinitely if it can't acquire the lock, causing cascading query failures.",
      "line": 1,
      "safeAlternative": "-- Set a timeout so DDL fails fast instead of blocking the queue\nSET lock_timeout = '5s';\nALTER TABLE orders\n  ADD CONSTRAINT orders_amount_positive CHECK (amount > 0)\nRESET lock_timeout;"
    },
    {
      "ruleId": "MP030",
      "ruleName": "require-not-valid-check",
      "severity": "critical",
      "message": "CHECK constraint \"orders_amount_positive\" on \"orders\" without NOT VALID scans the entire table under ACCESS EXCLUSIVE lock, blocking all reads and writes.",
      "line": 1,
      "safeAlternative": "-- Step 1: Add CHECK with NOT VALID (instant, no scan)\nALTER TABLE orders ADD CONSTRAINT orders_amount_positive CHECK (...) NOT VALID;\n\n-- Step 2: Validate separately (SHARE UPDATE EXCLUSIVE — allows reads + writes)\nALTER TABLE orders VALIDATE CONSTRAINT orders_amount_positive;"
    },
    {
      "ruleId": "MP001",
      "ruleName": "require-concurrent-index-creation",
      "severity": "critical",
      "message": "CREATE INDEX \"idx_orders_customer_id\" without CONCURRENTLY will lock all writes on \"orders\" for the entire duration of index creation.",
      "line": 4,
      "safeAlternative": "CREATE INDEX CONCURRENTLY idx_orders_customer_id\n  ON orders (customer_id)"
    },
    {
      "ruleId": "MP004",
      "ruleName": "require-lock-timeout",
      "severity": "critical",
      "message": "DDL statement acquires SHARE lock without a preceding SET lock_timeout. Without a timeout, this statement could block the lock queue indefinitely if it can't acquire the lock, causing cascading query failures.",
      "line": 4,
      "safeAlternative": "-- Set a timeout so DDL fails fast instead of blocking the queue\nSET lock_timeout = '5s';\nCREATE INDEX idx_orders_customer_id\n  ON orders (customer_id)\nRESET lock_timeout;"
    },
    {
      "ruleId": "MP020",
      "ruleName": "require-statement-timeout",
      "severity": "warning",
      "message": "Long-running DDL without a preceding SET statement_timeout. This operation could hold locks for an extended time if it runs longer than expected.",
      "line": 4,
      "safeAlternative": "-- Set a timeout so the operation is killed if it runs too long\nSET statement_timeout = '30s';\nCREATE INDEX idx_orders_customer_id\n  ON orders (customer_id)\nRESET statement_timeout;"
    },
    {
      "ruleId": "MP023",
      "ruleName": "require-if-not-exists",
      "severity": "warning",
      "message": "CREATE INDEX \"idx_orders_customer_id\" without IF NOT EXISTS will fail if the index already exists. Use IF NOT EXISTS for idempotent migrations.",
      "line": 4,
      "safeAlternative": "CREATE INDEX IF NOT EXISTS idx_orders_customer_id\n  ON orders (customer_id)"
    },
    {
      "ruleId": "MP004",
      "ruleName": "require-lock-timeout",
      "severity": "critical",
      "message": "DDL statement acquires ACCESS EXCLUSIVE lock without a preceding SET lock_timeout. Without a timeout, this statement could block the lock queue indefinitely if it can't acquire the lock, causing cascading query failures.",
      "line": 7,
      "safeAlternative": "-- Set a timeout so DDL fails fast instead of blocking the queue\nSET lock_timeout = '5s';\nALTER TABLE users\n  ALTER COLUMN email TYPE varchar(255)\nRESET lock_timeout;"
    },
    {
      "ruleId": "MP007",
      "ruleName": "no-column-type-change",
      "severity": "critical",
      "message": "ALTER COLUMN TYPE on \"users\".\"email\" rewrites the entire table under ACCESS EXCLUSIVE lock, blocking all reads and writes.",
      "line": 7,
      "safeAlternative": "-- Use the expand-contract pattern:\n-- Step 1: Add new column with desired type\nALTER TABLE users ADD COLUMN email_new <new_type>;\n\n-- Step 2: Backfill in batches\nUPDATE users SET email_new = email::<new_type>\n  WHERE id IN (SELECT id FROM users WHERE email_new IS NULL LIMIT 10000);\n\n-- Step 3: Create trigger to sync writes (during backfill)\n-- Step 4: Swap columns (brief lock)\n-- Step 5: Drop old column"
    },
    {
      "ruleId": "MP020",
      "ruleName": "require-statement-timeout",
      "severity": "warning",
      "message": "Long-running DDL without a preceding SET statement_timeout. This operation could hold locks for an extended time if it runs longer than expected.",
      "line": 7,
      "safeAlternative": "-- Set a timeout so the operation is killed if it runs too long\nSET statement_timeout = '30s';\nALTER TABLE users\n  ALTER COLUMN email TYPE varchar(255)\nRESET statement_timeout;"
    },
    {
      "ruleId": "MP052",
      "ruleName": "warn-dependent-objects",
      "severity": "warning",
      "message": "Changing type of column \"email\" on \"users\" may break views, functions, or triggers that reference it with the old type.",
      "line": 7,
      "safeAlternative": "-- Verify no views/functions depend on the old column type before altering."
    }
  ],
  "summary": {
    "totalStatements": 3,
    "totalViolations": 10,
    "criticalCount": 6,
    "warningCount": 4
  }
};
