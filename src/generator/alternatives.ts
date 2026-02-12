/**
 * Generates safe SQL alternatives for common dangerous patterns.
 * These are copy-paste-ready replacements shown in CLI output and PR comments.
 */
export function generateSafeAlternative(
  stmt: Record<string, unknown>,
  ruleId: string,
  originalSql: string
): string | null {
  switch (ruleId) {
    case 'MP001':
      return generateConcurrentIndex(originalSql);
    case 'MP002':
      return generateCheckNotNull(stmt);
    case 'MP005':
      return generateNotValidFK(stmt);
    case 'MP004':
      return generateLockTimeoutWrapper(originalSql);
    default:
      return null;
  }
}

function generateConcurrentIndex(originalSql: string): string {
  return originalSql
    .replace(/CREATE\s+INDEX/gi, 'CREATE INDEX CONCURRENTLY')
    .replace(/CREATE\s+UNIQUE\s+INDEX/gi, 'CREATE UNIQUE INDEX CONCURRENTLY');
}

function generateCheckNotNull(stmt: Record<string, unknown>): string | null {
  const alter = stmt.AlterTableStmt as {
    relation?: { relname?: string };
    cmds?: Array<{ AlterTableCmd: { name?: string } }>;
  } | undefined;

  if (!alter) return null;
  const table = alter.relation?.relname ?? 'table_name';
  const column = alter.cmds?.[0]?.AlterTableCmd?.name ?? 'column_name';

  return `-- Step 1: Add CHECK constraint (brief lock, no table scan)
ALTER TABLE ${table} ADD CONSTRAINT ${table}_${column}_not_null
  CHECK (${column} IS NOT NULL) NOT VALID;

-- Step 2: Validate (non-blocking, allows reads + writes)
ALTER TABLE ${table} VALIDATE CONSTRAINT ${table}_${column}_not_null;

-- Step 3: Set NOT NULL using validated constraint (PG 12+, instant)
ALTER TABLE ${table} ALTER COLUMN ${column} SET NOT NULL;
ALTER TABLE ${table} DROP CONSTRAINT ${table}_${column}_not_null;`;
}

function generateNotValidFK(stmt: Record<string, unknown>): string | null {
  const alter = stmt.AlterTableStmt as {
    relation?: { relname?: string };
    cmds?: Array<{ AlterTableCmd: { def?: Record<string, unknown> } }>;
  } | undefined;

  if (!alter) return null;

  const table = alter.relation?.relname ?? 'table_name';
  const constraint = alter.cmds?.[0]?.AlterTableCmd?.def?.Constraint as {
    conname?: string;
  } | undefined;
  const name = constraint?.conname ?? 'fk_constraint_name';

  return `-- Step 1: Add FK with NOT VALID (brief lock, no scan)
ALTER TABLE ${table} ADD CONSTRAINT ${name}
  FOREIGN KEY (...) REFERENCES ... NOT VALID;

-- Step 2: Validate separately (non-blocking)
ALTER TABLE ${table} VALIDATE CONSTRAINT ${name};`;
}

function generateLockTimeoutWrapper(originalSql: string): string {
  return `-- Set lock_timeout to fail fast instead of blocking
SET lock_timeout = '5s';
${originalSql}
RESET lock_timeout;`;
}
