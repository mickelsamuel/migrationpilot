/**
 * Static SQL extraction from JS/TS migrations.
 *
 * Two failure modes matter here, and both are worse than finding nothing:
 * extracting SQL that will never run (the down migration), and silently
 * dropping a call whose SQL is built at runtime. Every case below is about
 * one of those.
 */

import { describe, it, expect } from 'vitest';
import { extractSqlFromJs } from '../src/frameworks/adapters/js-extract.js';

describe('extractSqlFromJs — what it can read', () => {
  it('reads a single-quoted literal', () => {
    const source = `
      export class M implements MigrationInterface {
        public async up(queryRunner: QueryRunner): Promise<void> {
          await queryRunner.query('CREATE INDEX idx ON users (email)');
        }
      }`;
    const result = extractSqlFromJs(source);
    expect(result.statements.map(s => s.sql)).toEqual(['CREATE INDEX idx ON users (email)']);
    expect(result.dynamic).toHaveLength(0);
    expect(result.sql).toContain('CREATE INDEX idx ON users (email);');
  });

  it('reads a multi-line template literal with no interpolation', () => {
    const source = [
      'exports.up = async function up(knex) {',
      '  await knex.raw(`',
      '    ALTER TABLE users',
      '    ADD COLUMN nickname text',
      '  `);',
      '};',
    ].join('\n');
    const result = extractSqlFromJs(source);
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]!.sql).toContain('ALTER TABLE users');
    expect(result.sql.trim().endsWith(';')).toBe(true);
  });

  it('reads several calls in one migration, in source order', () => {
    const source = `
      module.exports = {
        up: async (queryInterface) => {
          await queryInterface.sequelize.query('CREATE TABLE a (id int)');
          await queryInterface.sequelize.query('CREATE TABLE b (id int)');
        },
        down: async (queryInterface) => {
          await queryInterface.sequelize.query('DROP TABLE a');
        },
      };`;
    const result = extractSqlFromJs(source);
    expect(result.statements.map(s => s.sql)).toEqual(['CREATE TABLE a (id int)', 'CREATE TABLE b (id int)']);
  });

  it('places extracted SQL on the source line it came from', () => {
    const source = [
      'exports.up = async knex => {',
      '  // a comment',
      "  await knex.raw('CREATE INDEX idx ON users (email)');",
      '};',
    ].join('\n');
    const result = extractSqlFromJs(source);
    expect(result.statements[0]!.line).toBe(3);
    expect(result.sql.split('\n')[2]).toContain('CREATE INDEX');
  });

  it('unescapes escape sequences inside literals', () => {
    const source = `exports.up = async knex => { await knex.raw('CREATE INDEX idx\\n  ON users (email)'); };`;
    const result = extractSqlFromJs(source);
    expect(result.statements[0]!.sql).toBe('CREATE INDEX idx\n  ON users (email)');
  });
});

describe('extractSqlFromJs — up() scoping', () => {
  it('ignores the down migration in a TypeORM class', () => {
    const source = `
      export class M implements MigrationInterface {
        public async up(queryRunner: QueryRunner): Promise<void> {
          await queryRunner.query('CREATE TABLE users (id int)');
        }
        public async down(queryRunner: QueryRunner): Promise<void> {
          await queryRunner.query('DROP TABLE users');
        }
      }`;
    const result = extractSqlFromJs(source);
    expect(result.foundUp).toBe(true);
    expect(result.statements.map(s => s.sql)).toEqual(['CREATE TABLE users (id int)']);
  });

  it('ignores the down migration in the exports.up form', () => {
    const source = [
      "exports.up = async knex => { await knex.raw('CREATE TABLE users (id int)'); };",
      "exports.down = async knex => { await knex.raw('DROP TABLE users'); };",
    ].join('\n');
    const result = extractSqlFromJs(source);
    expect(result.statements.map(s => s.sql)).toEqual(['CREATE TABLE users (id int)']);
  });

  it('handles down() declared before up()', () => {
    const source = `
      module.exports = {
        down: async (q) => { await q.query('DROP TABLE users'); },
        up: async (q) => { await q.query('CREATE TABLE users (id int)'); },
      };`;
    const result = extractSqlFromJs(source);
    expect(result.statements.map(s => s.sql)).toEqual(['CREATE TABLE users (id int)']);
  });

  it('does not mistake the word "down" inside SQL for the down migration', () => {
    const source = `
      exports.up = async knex => {
        await knex.raw('CREATE INDEX down_idx ON users (email)');
        await knex.raw('ALTER TABLE users ADD COLUMN shutdown_at timestamptz');
      };`;
    const result = extractSqlFromJs(source);
    expect(result.statements).toHaveLength(2);
  });

  it('falls back to the whole file when there is no recognizable up()', () => {
    const source = `async function run(knex) { await knex.raw('CREATE TABLE users (id int)'); }`;
    const result = extractSqlFromJs(source);
    expect(result.foundUp).toBe(false);
    expect(result.statements).toHaveLength(1);
  });
});

describe('extractSqlFromJs — what it refuses to guess at', () => {
  it('reports an interpolated template as dynamic instead of extracting it', () => {
    const source = 'exports.up = async knex => { await knex.raw(`ALTER TABLE ${table} ADD COLUMN tier text`); };';
    const result = extractSqlFromJs(source);
    expect(result.statements).toHaveLength(0);
    expect(result.dynamic).toHaveLength(1);
    expect(result.dynamic[0]!.reason).toContain('interpolates');
    expect(result.sql).toBe('');
  });

  it('reports string concatenation as dynamic', () => {
    const source = `exports.up = async knex => { await knex.raw('ALTER TABLE ' + table + ' ADD COLUMN tier text'); };`;
    const result = extractSqlFromJs(source);
    expect(result.statements).toHaveLength(0);
    expect(result.dynamic[0]!.reason).toContain('concatenation');
  });

  it('reports a variable argument as dynamic', () => {
    const source = 'exports.up = async knex => { const sql = buildSql(); await knex.raw(sql); };';
    const result = extractSqlFromJs(source);
    expect(result.dynamic[0]!.reason).toContain('variable or expression');
  });

  it('records both the readable and the unreadable calls in one file', () => {
    const source = `
      exports.up = async knex => {
        await knex.raw('CREATE INDEX idx ON users (email)');
        await knex.raw(\`ALTER TABLE \${table} ADD COLUMN tier text\`);
      };`;
    const result = extractSqlFromJs(source);
    expect(result.statements).toHaveLength(1);
    expect(result.dynamic).toHaveLength(1);
  });

  it('flags schema-builder usage so the caller can say so', () => {
    const source = `
      exports.up = function up(knex) {
        return knex.schema.createTable('orders', t => t.increments('id'));
      };`;
    const result = extractSqlFromJs(source);
    expect(result.usesSchemaBuilder).toBe(true);
    expect(result.statements).toHaveLength(0);
  });

  it('ignores raw-SQL calls that are commented out', () => {
    const source = `
      exports.up = async knex => {
        // await knex.raw('DROP TABLE users');
        /* await knex.raw('TRUNCATE users'); */
        await knex.raw('CREATE INDEX idx ON users (email)');
      };`;
    const result = extractSqlFromJs(source);
    expect(result.statements.map(s => s.sql)).toEqual(['CREATE INDEX idx ON users (email)']);
    expect(result.dynamic).toHaveLength(0);
  });

  it('ignores a bare query() that is not a method call', () => {
    const source = `exports.up = async () => { query('SELECT 1'); };`;
    const result = extractSqlFromJs(source);
    expect(result.statements).toHaveLength(0);
    expect(result.dynamic).toHaveLength(0);
  });

  it('does not treat SQL inside a string as code', () => {
    const source = `exports.up = async knex => { await knex.raw('SELECT $$ nested query( ) $$'); };`;
    const result = extractSqlFromJs(source);
    expect(result.statements).toHaveLength(1);
    expect(result.dynamic).toHaveLength(0);
  });
});
