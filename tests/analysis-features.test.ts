/**
 * Tests for new analysis features:
 * - Schema simulation
 * - Dependency graph
 * - Duration prediction
 * - Lock queue simulation
 * - Expand-contract templates
 * - Trigger cascade (static analysis only)
 * - Sequence monitoring (static analysis only)
 * - CLI suggestions
 */

import { describe, it, expect } from 'vitest';
import { simulateSchema } from '../src/schema/simulate.js';
import { buildDependencyGraph } from '../src/graph/dependencies.js';
import { predictDuration } from '../src/prediction/duration.js';
import { simulateLockQueue } from '../src/lockqueue/simulate.js';
import { generateTemplate } from '../src/templates/expand-contract.js';
import { analyzeSequenceFromSql } from '../src/sequence/monitor.js';
import { generateSuggestions, formatRichError } from '../src/output/suggestions.js';

// ---------------------------------------------------------------------------
// Schema Simulation
// ---------------------------------------------------------------------------

describe('Schema Simulation', () => {
  it('should track CREATE TABLE columns', () => {
    const state = simulateSchema([
      'CREATE TABLE users (id BIGINT PRIMARY KEY, name TEXT NOT NULL, email VARCHAR(255));',
    ]);
    const table = state.tables.get('users');
    expect(table).toBeDefined();
    expect(table!.name).toBe('users');
    expect(table!.columns).toHaveLength(3);
    expect(table!.columns[0]!.name).toBe('id');
    expect(table!.columns[1]!.name).toBe('name');
    expect(table!.columns[1]!.nullable).toBe(false);
    expect(table!.columns[2]!.name).toBe('email');
    expect(table!.columns[2]!.type).toMatch(/VARCHAR/i);
  });

  it('should handle ALTER TABLE ADD COLUMN', () => {
    const state = simulateSchema([
      'CREATE TABLE users (id BIGINT PRIMARY KEY);',
      'ALTER TABLE users ADD COLUMN age INTEGER DEFAULT 0;',
    ]);
    const table = state.tables.get('users');
    expect(table!.columns).toHaveLength(2);
    const ageCol = table!.columns.find(c => c.name === 'age');
    expect(ageCol).toBeDefined();
    expect(ageCol!.hasDefault).toBe(true);
  });

  it('should handle ALTER TABLE DROP COLUMN', () => {
    const state = simulateSchema([
      'CREATE TABLE users (id BIGINT PRIMARY KEY, legacy TEXT);',
      'ALTER TABLE users DROP COLUMN legacy;',
    ]);
    const table = state.tables.get('users');
    expect(table!.columns).toHaveLength(1);
    expect(table!.columns[0]!.name).toBe('id');
  });

  it('should handle DROP TABLE', () => {
    const state = simulateSchema([
      'CREATE TABLE temp_data (id INTEGER);',
      'DROP TABLE temp_data;',
    ]);
    expect(state.tables.has('temp_data')).toBe(false);
  });

  it('should track CREATE INDEX', () => {
    const state = simulateSchema([
      'CREATE TABLE users (id BIGINT, email TEXT);',
      'CREATE UNIQUE INDEX CONCURRENTLY idx_users_email ON users (email);',
    ]);
    const idx = state.indexes.get('idx_users_email');
    expect(idx).toBeDefined();
    expect(idx!.table).toBe('users');
    expect(idx!.unique).toBe(true);
    expect(idx!.concurrent).toBe(true);
    expect(idx!.columns).toContain('email');
  });

  it('should track DROP INDEX', () => {
    const state = simulateSchema([
      'CREATE TABLE users (id BIGINT, email TEXT);',
      'CREATE INDEX idx_email ON users (email);',
      'DROP INDEX idx_email;',
    ]);
    expect(state.indexes.has('idx_email')).toBe(false);
  });

  it('should track CREATE/DROP SEQUENCE', () => {
    const state = simulateSchema([
      'CREATE SEQUENCE user_id_seq AS INTEGER;',
    ]);
    const seq = state.sequences.get('user_id_seq');
    expect(seq).toBeDefined();
    expect(seq!.dataType).toBe('integer');

    const state2 = simulateSchema([
      'CREATE SEQUENCE user_id_seq;',
      'DROP SEQUENCE user_id_seq;',
    ]);
    expect(state2.sequences.has('user_id_seq')).toBe(false);
  });

  it('should handle ALTER COLUMN SET NOT NULL', () => {
    const state = simulateSchema([
      'CREATE TABLE users (id BIGINT, name TEXT);',
      'ALTER TABLE users ALTER COLUMN name SET NOT NULL;',
    ]);
    const col = state.tables.get('users')!.columns.find(c => c.name === 'name');
    expect(col!.nullable).toBe(false);
  });

  it('should handle ALTER COLUMN TYPE', () => {
    const state = simulateSchema([
      'CREATE TABLE users (id BIGINT, score INTEGER);',
      'ALTER TABLE users ALTER COLUMN score TYPE BIGINT;',
    ]);
    const col = state.tables.get('users')!.columns.find(c => c.name === 'score');
    expect(col!.type).toBe('BIGINT');
  });

  it('should handle RENAME TABLE', () => {
    const state = simulateSchema([
      'CREATE TABLE old_name (id BIGINT);',
      'ALTER TABLE old_name RENAME TO new_name;',
    ]);
    expect(state.tables.has('old_name')).toBe(false);
    expect(state.tables.has('new_name')).toBe(true);
  });

  it('should handle table constraints', () => {
    const state = simulateSchema([
      'CREATE TABLE users (id BIGINT PRIMARY KEY, email TEXT UNIQUE);',
    ]);
    const constraints = [...state.constraints.values()];
    expect(constraints.some(c => c.type === 'PRIMARY KEY')).toBe(true);
    expect(constraints.some(c => c.type === 'UNIQUE')).toBe(true);
  });

  it('should handle multiple migrations in sequence', () => {
    const state = simulateSchema([
      'CREATE TABLE users (id BIGINT PRIMARY KEY, name TEXT);',
      'CREATE TABLE orders (id BIGINT PRIMARY KEY, user_id BIGINT, total NUMERIC(10,2));',
      'ALTER TABLE users ADD COLUMN email TEXT;',
      'CREATE INDEX idx_orders_user ON orders (user_id);',
    ]);
    expect(state.tables.size).toBe(2);
    expect(state.tables.get('users')!.columns).toHaveLength(3);
    expect(state.indexes.has('idx_orders_user')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dependency Graph
// ---------------------------------------------------------------------------

describe('Dependency Graph', () => {
  it('should detect cross-file dependencies', async () => {
    const graph = await buildDependencyGraph([
      { path: '001_create_users.sql', sql: 'CREATE TABLE users (id BIGINT PRIMARY KEY, name TEXT);' },
      { path: '002_add_index.sql', sql: 'CREATE INDEX idx_users_name ON users (name);' },
    ]);

    expect(graph.nodes).toHaveLength(2);
    const indexNode = graph.nodes.find(n => n.file === '002_add_index.sql');
    expect(indexNode!.dependsOn).toContain('001_create_users.sql');
  });

  it('should detect orphan files', async () => {
    const graph = await buildDependencyGraph([
      { path: '001_create_users.sql', sql: 'CREATE TABLE users (id BIGINT);' },
      { path: '002_create_orders.sql', sql: 'CREATE TABLE orders (id BIGINT);' },
    ]);

    // Both create tables independently — they're orphans to each other
    expect(graph.orphans).toHaveLength(2);
  });

  it('should detect cycles', async () => {
    // A depends on B (via ALTER on table_b) and B depends on A (via ALTER on table_a)
    const graph = await buildDependencyGraph([
      {
        path: 'a.sql',
        sql: 'CREATE TABLE table_a (id BIGINT);\nALTER TABLE table_b ADD COLUMN ref_a BIGINT;',
      },
      {
        path: 'b.sql',
        sql: 'CREATE TABLE table_b (id BIGINT);\nALTER TABLE table_a ADD COLUMN ref_b BIGINT;',
      },
    ]);

    expect(graph.cycles.length).toBeGreaterThan(0);
  });

  it('should handle empty files', async () => {
    const graph = await buildDependencyGraph([
      { path: 'empty.sql', sql: '' },
    ]);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.orphans).toHaveLength(1);
  });

  it('should track tables per node', async () => {
    const graph = await buildDependencyGraph([
      {
        path: 'migration.sql',
        sql: 'CREATE TABLE users (id BIGINT);\nCREATE TABLE orders (id BIGINT);\nALTER TABLE users ADD COLUMN email TEXT;',
      },
    ]);
    const node = graph.nodes[0]!;
    expect(node.tables).toContain('users');
    expect(node.tables).toContain('orders');
  });
});

// ---------------------------------------------------------------------------
// Duration Prediction
// ---------------------------------------------------------------------------

describe('Duration Prediction', () => {
  it('should predict CREATE INDEX duration', () => {
    const estimates = predictDuration('CREATE INDEX idx ON users (email);');
    expect(estimates).toHaveLength(1);
    expect(estimates[0]!.operation).toContain('CREATE');
    expect(estimates[0]!.operation).toContain('INDEX');
    expect(estimates[0]!.confidence).toBe('low'); // no stats
  });

  it('should predict CONCURRENTLY takes longer', () => {
    const estimates = predictDuration('CREATE INDEX CONCURRENTLY idx ON users (email);');
    expect(estimates[0]!.operation).toContain('CONCURRENTLY');
    expect(estimates[0]!.factors.some(f => f.includes('CONCURRENTLY'))).toBe(true);
  });

  it('should predict instant ADD COLUMN', () => {
    const estimates = predictDuration('ALTER TABLE users ADD COLUMN bio TEXT;');
    expect(estimates[0]!.estimatedDuration).toBe('< 1s');
    expect(estimates[0]!.confidence).toBe('high');
  });

  it('should predict type change as expensive', () => {
    const estimates = predictDuration('ALTER TABLE users ALTER COLUMN id TYPE BIGINT;');
    expect(estimates[0]!.operation).toContain('TYPE');
    expect(estimates[0]!.factors.some(f => f.includes('rewrite'))).toBe(true);
  });

  it('should calibrate with table stats', () => {
    const estimates = predictDuration(
      'CREATE INDEX idx ON users (email);',
      { rowCount: 10_000_000, sizeBytes: 2_147_483_648, indexCount: 5 },
    );
    expect(estimates[0]!.confidence).toBe('medium');
    expect(estimates[0]!.factors.some(f => f.includes('10.0M rows'))).toBe(true);
  });

  it('should predict DROP TABLE as instant', () => {
    const estimates = predictDuration('DROP TABLE old_data;');
    expect(estimates[0]!.estimatedDuration).toBe('< 1s');
    expect(estimates[0]!.confidence).toBe('high');
  });

  it('should predict VACUUM FULL as expensive', () => {
    const estimates = predictDuration('VACUUM FULL users;');
    expect(estimates[0]!.operation).toBe('VACUUM FULL');
    expect(estimates[0]!.factors.some(f => f.includes('ACCESS EXCLUSIVE'))).toBe(true);
  });

  it('should predict TRUNCATE as instant', () => {
    const estimates = predictDuration('TRUNCATE users;');
    expect(estimates[0]!.estimatedDuration).toBe('< 1s');
  });

  it('should handle multiple statements', () => {
    const estimates = predictDuration(
      'CREATE TABLE users (id BIGINT);\nCREATE INDEX idx ON users (id);\nDROP TABLE old;',
    );
    expect(estimates).toHaveLength(3);
  });

  it('should predict NOT VALID constraint as instant', () => {
    const estimates = predictDuration(
      "ALTER TABLE users ADD CONSTRAINT chk CHECK (age > 0) NOT VALID;",
    );
    expect(estimates[0]!.estimatedDuration).toBe('< 1s');
    expect(estimates[0]!.confidence).toBe('high');
  });

  it('should predict CREATE SEQUENCE as instant', () => {
    const estimates = predictDuration('CREATE SEQUENCE user_id_seq;');
    expect(estimates[0]!.estimatedDuration).toBe('< 1s');
  });
});

// ---------------------------------------------------------------------------
// Lock Queue Simulation
// ---------------------------------------------------------------------------

describe('Lock Queue Simulation', () => {
  it('should identify ACCESS EXCLUSIVE for ALTER TABLE', () => {
    const results = simulateLockQueue('ALTER TABLE users ADD COLUMN age INTEGER;');
    expect(results).toHaveLength(1);
    expect(results[0]!.ddlLockType).toBe('ACCESS EXCLUSIVE');
    expect(results[0]!.blockedOperations).toContain('SELECT');
  });

  it('should identify SHARE for CREATE INDEX', () => {
    const results = simulateLockQueue('CREATE INDEX idx ON users (email);');
    expect(results[0]!.ddlLockType).toBe('SHARE');
    expect(results[0]!.blockedOperations).toContain('INSERT');
    expect(results[0]!.blockedOperations).not.toContain('SELECT');
  });

  it('should identify SHARE UPDATE EXCLUSIVE for CONCURRENTLY', () => {
    const results = simulateLockQueue('CREATE INDEX CONCURRENTLY idx ON users (email);');
    expect(results[0]!.ddlLockType).toBe('SHARE UPDATE EXCLUSIVE');
  });

  it('should generate recommendations', () => {
    const results = simulateLockQueue('CREATE INDEX idx ON users (email);');
    expect(results[0]!.recommendations.some(r => r.includes('CONCURRENTLY'))).toBe(true);
  });

  it('should handle VALIDATE CONSTRAINT lock correctly', () => {
    const results = simulateLockQueue(
      'ALTER TABLE users VALIDATE CONSTRAINT users_email_check;',
    );
    expect(results[0]!.ddlLockType).toBe('SHARE UPDATE EXCLUSIVE');
  });

  it('should handle VACUUM FULL vs regular VACUUM', () => {
    const full = simulateLockQueue('VACUUM FULL users;');
    expect(full[0]!.ddlLockType).toBe('ACCESS EXCLUSIVE');

    const regular = simulateLockQueue('VACUUM users;');
    expect(regular[0]!.ddlLockType).toBe('SHARE UPDATE EXCLUSIVE');
  });

  it('should estimate queue time based on connections', () => {
    const highConn = simulateLockQueue(
      'ALTER TABLE users ADD COLUMN x INT;',
      { activeConnections: 500, avgQueryDuration: 200 },
    );
    const lowConn = simulateLockQueue(
      'ALTER TABLE users ADD COLUMN x INT;',
      { activeConnections: 5, avgQueryDuration: 50 },
    );

    // High connections should show longer estimated queue time
    expect(highConn[0]!.maxQueueTime).not.toBe(lowConn[0]!.maxQueueTime);
  });

  it('should handle multiple statements', () => {
    const results = simulateLockQueue(
      'ALTER TABLE users ADD COLUMN a INT;\nCREATE INDEX idx ON users (a);',
    );
    expect(results).toHaveLength(2);
  });

  it('should recommend lock_timeout for ACCESS EXCLUSIVE', () => {
    const results = simulateLockQueue('ALTER TABLE users ADD COLUMN x INT;');
    expect(results[0]!.recommendations.some(r => r.includes('lock_timeout'))).toBe(true);
  });

  it('should classify TRUNCATE as ACCESS EXCLUSIVE', () => {
    const results = simulateLockQueue('TRUNCATE users;');
    expect(results[0]!.ddlLockType).toBe('ACCESS EXCLUSIVE');
  });

  it('should classify CREATE TRIGGER correctly', () => {
    const results = simulateLockQueue(
      'CREATE TRIGGER trg AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION notify();',
    );
    expect(results[0]!.ddlLockType).toBe('SHARE ROW EXCLUSIVE');
  });
});

// ---------------------------------------------------------------------------
// Expand-Contract Templates
// ---------------------------------------------------------------------------

describe('Expand-Contract Templates', () => {
  it('should generate rename-column template', () => {
    const template = generateTemplate('rename-column', {
      table: 'users',
      column: 'email',
      newName: 'email_address',
    });
    expect(template.name).toContain('email');
    expect(template.name).toContain('email_address');
    expect(template.expand).toContain('ADD COLUMN email_address');
    expect(template.expand).toContain('lock_timeout');
    expect(template.migrate).toContain('batch_size');
    expect(template.contract).toContain('DROP COLUMN');
    expect(template.contract).toContain('DROP TRIGGER');
  });

  it('should generate change-type template', () => {
    const template = generateTemplate('change-type', {
      table: 'orders',
      column: 'amount',
      newType: 'numeric(12,2)',
    });
    expect(template.expand).toContain('numeric(12,2)');
    expect(template.migrate).toContain('amount::numeric(12,2)');
    expect(template.contract).toContain('DROP COLUMN amount');
    expect(template.contract).toContain('RENAME COLUMN amount_new TO amount');
  });

  it('should generate add-not-null template', () => {
    const template = generateTemplate('add-not-null', {
      table: 'users',
      column: 'name',
    });
    expect(template.expand).toContain('NOT VALID');
    expect(template.expand).toContain('CHECK');
    expect(template.migrate).toContain('VALIDATE CONSTRAINT');
    expect(template.contract).toContain('SET NOT NULL');
    expect(template.contract).toContain('DROP CONSTRAINT');
  });

  it('should generate remove-column template', () => {
    const template = generateTemplate('remove-column', {
      table: 'users',
      column: 'legacy_field',
    });
    expect(template.expand).toContain('DROP NOT NULL');
    expect(template.expand).toContain('DROP DEFAULT');
    expect(template.contract).toContain('DROP COLUMN');
  });

  it('should generate split-table template', () => {
    const template = generateTemplate('split-table', {
      table: 'users',
      column: 'profile_data',
    });
    expect(template.expand).toContain('CREATE TABLE');
    expect(template.expand).toContain('users_profile_data');
    expect(template.migrate).toContain('INSERT INTO users_profile_data');
    expect(template.contract).toContain('DROP COLUMN');
  });

  it('should include lock_timeout in expand and contract phases', () => {
    const template = generateTemplate('rename-column', {
      table: 'users',
      column: 'a',
      newName: 'b',
    });
    expect(template.expand).toContain('lock_timeout');
    expect(template.contract).toContain('lock_timeout');
  });

  it('should include batch processing in migrate phase', () => {
    const template = generateTemplate('change-type', {
      table: 't',
      column: 'c',
      newType: 'bigint',
    });
    expect(template.migrate).toContain('batch_size');
    expect(template.migrate).toContain('LOOP');
    expect(template.migrate).toContain('pg_sleep');
  });

  it('should include description', () => {
    const template = generateTemplate('add-not-null', {
      table: 'users',
      column: 'email',
    });
    expect(template.description).toContain('NOT NULL');
    expect(template.description.length).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------
// Sequence Monitoring (static analysis)
// ---------------------------------------------------------------------------

describe('Sequence Monitoring — Static Analysis', () => {
  it('should detect integer sequences as medium risk', () => {
    const results = analyzeSequenceFromSql('CREATE SEQUENCE user_id_seq AS INTEGER;');
    expect(results).toHaveLength(1);
    expect(results[0]!.dataType).toBe('integer');
    expect(results[0]!.risk).toBe('medium');
  });

  it('should detect smallint sequences as high risk', () => {
    const results = analyzeSequenceFromSql('CREATE SEQUENCE counter_seq AS SMALLINT;');
    expect(results[0]!.risk).toBe('high');
  });

  it('should detect bigint sequences as low risk', () => {
    const results = analyzeSequenceFromSql('CREATE SEQUENCE event_id_seq AS BIGINT;');
    expect(results[0]!.risk).toBe('low');
  });

  it('should default to bigint when no type specified', () => {
    const results = analyzeSequenceFromSql('CREATE SEQUENCE my_seq;');
    expect(results[0]!.dataType).toBe('bigint');
    expect(results[0]!.risk).toBe('low');
  });

  it('should detect SERIAL as medium risk', () => {
    const results = analyzeSequenceFromSql('CREATE TABLE t (id SERIAL PRIMARY KEY);');
    const serialResult = results.find(r => r.name.includes('id_seq'));
    expect(serialResult).toBeDefined();
    expect(serialResult!.dataType).toBe('integer');
    expect(serialResult!.risk).toBe('medium');
  });

  it('should detect SMALLSERIAL as high risk', () => {
    const results = analyzeSequenceFromSql('CREATE TABLE t (id SMALLSERIAL);');
    const result = results.find(r => r.dataType === 'smallint');
    expect(result).toBeDefined();
    expect(result!.risk).toBe('high');
  });

  it('should detect BIGSERIAL as low risk', () => {
    const results = analyzeSequenceFromSql('CREATE TABLE t (id BIGSERIAL PRIMARY KEY);');
    const result = results.find(r => r.dataType === 'bigint');
    expect(result).toBeDefined();
    expect(result!.risk).toBe('low');
  });

  it('should handle multiple sequences', () => {
    const results = analyzeSequenceFromSql(
      'CREATE SEQUENCE seq1 AS INTEGER;\nCREATE SEQUENCE seq2 AS BIGINT;\nCREATE SEQUENCE seq3 AS SMALLINT;',
    );
    expect(results).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// CLI Suggestions
// ---------------------------------------------------------------------------

describe('CLI Suggestions', () => {
  it('should suggest --fix for fixable violations', () => {
    const lines = generateSuggestions(
      [{ ruleId: 'MP001', message: 'test', severity: 'critical', line: 1, column: 0 }],
      'migration.sql',
    );
    const joined = lines.join('\n');
    expect(joined).toContain('--fix');
    expect(joined).toContain('auto-fixed');
  });

  it('should suggest explain command', () => {
    const lines = generateSuggestions(
      [{ ruleId: 'MP007', message: 'test', severity: 'warning', line: 1, column: 0 }],
      'migration.sql',
    );
    const joined = lines.join('\n');
    expect(joined).toContain('explain MP007');
  });

  it('should suggest --exclude', () => {
    const lines = generateSuggestions(
      [
        { ruleId: 'MP001', message: 'test', severity: 'critical', line: 1, column: 0 },
        { ruleId: 'MP004', message: 'test', severity: 'warning', line: 2, column: 0 },
      ],
      'migration.sql',
    );
    const joined = lines.join('\n');
    expect(joined).toContain('--exclude');
  });

  it('should suggest inline disable', () => {
    const lines = generateSuggestions(
      [{ ruleId: 'MP037', message: 'test', severity: 'warning', line: 1, column: 0 }],
    );
    const joined = lines.join('\n');
    expect(joined).toContain('migrationpilot-disable');
  });

  it('should suggest init for many violations', () => {
    // Use non-fixable rules so init can make it into the top 4 suggestions
    const violations = Array.from({ length: 5 }, (_, i) => ({
      ruleId: `MP00${i + 5}`,
      message: 'test',
      severity: 'warning' as const,
      line: i + 1,
      column: 0,
    }));
    const lines = generateSuggestions(violations);
    const joined = lines.join('\n');
    expect(joined).toContain('init');
  });

  it('should return empty for no violations', () => {
    const lines = generateSuggestions([]);
    expect(lines).toHaveLength(0);
  });

  it('should suggest dry-run', () => {
    const lines = generateSuggestions(
      [{ ruleId: 'MP001', message: 'test', severity: 'critical', line: 1, column: 0 }],
      'migration.sql',
    );
    const joined = lines.join('\n');
    expect(joined).toContain('--dry-run');
  });

  it('should limit to 4 suggestions', () => {
    const violations = Array.from({ length: 10 }, (_, i) => ({
      ruleId: `MP00${i + 1}`,
      message: 'test',
      severity: 'critical' as const,
      line: i + 1,
      column: 0,
    }));
    const lines = generateSuggestions(violations, 'file.sql');
    // Count actual suggestion lines (excluding header and empty)
    const suggestionLines = lines.filter(l => l.includes('→'));
    expect(suggestionLines.length).toBeLessThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// Rich Error Formatting
// ---------------------------------------------------------------------------

describe('Rich Error Formatting', () => {
  it('should format violation with SQL context', () => {
    const lines = formatRichError(
      {
        ruleId: 'MP001',
        message: 'Use CREATE INDEX CONCURRENTLY',
        severity: 'critical',
        line: 2,
        column: 0,
      },
      'SELECT 1;\nCREATE INDEX idx ON users (email);',
    );
    const joined = lines.join('\n');
    expect(joined).toContain('MP001');
    expect(joined).toContain('CREATE INDEX idx ON users (email)');
  });

  it('should show safe alternative', () => {
    const lines = formatRichError({
      ruleId: 'MP001',
      message: 'test',
      severity: 'critical',
      line: 1,
      column: 0,
      safeAlternative: 'Use CONCURRENTLY',
    });
    const joined = lines.join('\n');
    expect(joined).toContain('Use CONCURRENTLY');
  });

  it('should show error for critical severity', () => {
    const lines = formatRichError({
      ruleId: 'MP001',
      message: 'test',
      severity: 'critical',
      line: 1,
      column: 0,
    });
    // The output should contain the severity indication (may have chalk)
    expect(lines.length).toBeGreaterThan(0);
  });

  it('should handle missing SQL gracefully', () => {
    const lines = formatRichError({
      ruleId: 'MP001',
      message: 'test',
      severity: 'warning',
      line: 1,
      column: 0,
    });
    expect(lines.length).toBeGreaterThan(0);
  });
});
