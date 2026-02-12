import { describe, it, expect } from 'vitest';
import { parseMigration } from '../src/parser/parse.js';
import { classifyLock } from '../src/locks/classify.js';

async function lockFor(sql: string, pgVersion = 17) {
  const result = await parseMigration(sql);
  expect(result.errors).toHaveLength(0);
  return classifyLock(result.statements[0].stmt, pgVersion);
}

describe('classifyLock', () => {
  describe('CREATE INDEX', () => {
    it('non-concurrent index takes SHARE lock', async () => {
      const lock = await lockFor('CREATE INDEX idx ON users (email);');
      expect(lock.lockType).toBe('SHARE');
      expect(lock.blocksWrites).toBe(true);
      expect(lock.longHeld).toBe(true);
    });

    it('concurrent index takes SHARE UPDATE EXCLUSIVE', async () => {
      const lock = await lockFor('CREATE INDEX CONCURRENTLY idx ON users (email);');
      expect(lock.lockType).toBe('SHARE UPDATE EXCLUSIVE');
      expect(lock.blocksWrites).toBe(false);
      expect(lock.longHeld).toBe(false);
    });
  });

  describe('ALTER TABLE', () => {
    it('ADD COLUMN without default is brief ACCESS EXCLUSIVE', async () => {
      const lock = await lockFor('ALTER TABLE users ADD COLUMN email text;');
      expect(lock.lockType).toBe('ACCESS EXCLUSIVE');
      expect(lock.longHeld).toBe(false);
    });

    it('ALTER COLUMN TYPE is long ACCESS EXCLUSIVE', async () => {
      const lock = await lockFor('ALTER TABLE users ALTER COLUMN email TYPE varchar(255);');
      expect(lock.lockType).toBe('ACCESS EXCLUSIVE');
      expect(lock.longHeld).toBe(true);
    });

    it('SET NOT NULL is long ACCESS EXCLUSIVE', async () => {
      const lock = await lockFor('ALTER TABLE users ALTER COLUMN email SET NOT NULL;');
      expect(lock.lockType).toBe('ACCESS EXCLUSIVE');
      expect(lock.longHeld).toBe(true);
    });

    it('DROP COLUMN is brief ACCESS EXCLUSIVE', async () => {
      const lock = await lockFor('ALTER TABLE users DROP COLUMN email;');
      expect(lock.lockType).toBe('ACCESS EXCLUSIVE');
      expect(lock.longHeld).toBe(false);
    });

    // Edge cases
    it('ADD COLUMN with volatile DEFAULT (now()) is long-held on PG10', async () => {
      const lock = await lockFor("ALTER TABLE users ADD COLUMN created_at timestamptz DEFAULT now();", 10);
      expect(lock.lockType).toBe('ACCESS EXCLUSIVE');
      expect(lock.longHeld).toBe(true);
    });

    it('ADD COLUMN with non-volatile DEFAULT is not long-held on PG11+', async () => {
      const lock = await lockFor("ALTER TABLE users ADD COLUMN status text DEFAULT 'active';", 17);
      expect(lock.lockType).toBe('ACCESS EXCLUSIVE');
      expect(lock.longHeld).toBe(false);
    });

    it('VALIDATE CONSTRAINT takes SHARE UPDATE EXCLUSIVE', async () => {
      const lock = await lockFor('ALTER TABLE users VALIDATE CONSTRAINT chk_email_not_null;');
      expect(lock.lockType).toBe('SHARE UPDATE EXCLUSIVE');
      expect(lock.blocksReads).toBe(false);
      expect(lock.blocksWrites).toBe(false);
    });

    it('DROP CONSTRAINT is brief ACCESS EXCLUSIVE', async () => {
      const lock = await lockFor('ALTER TABLE users DROP CONSTRAINT chk_email;');
      expect(lock.lockType).toBe('ACCESS EXCLUSIVE');
      expect(lock.longHeld).toBe(false);
    });
  });

  describe('CREATE TABLE', () => {
    it('is ACCESS EXCLUSIVE but not long-held (new table)', async () => {
      const lock = await lockFor('CREATE TABLE orders (id serial PRIMARY KEY);');
      expect(lock.lockType).toBe('ACCESS EXCLUSIVE');
      expect(lock.longHeld).toBe(false);
    });
  });

  describe('DROP', () => {
    it('DROP TABLE is ACCESS EXCLUSIVE', async () => {
      const lock = await lockFor('DROP TABLE users;');
      expect(lock.lockType).toBe('ACCESS EXCLUSIVE');
    });
  });

  describe('VACUUM', () => {
    it('VACUUM FULL is ACCESS EXCLUSIVE + long-held', async () => {
      const lock = await lockFor('VACUUM FULL users;');
      expect(lock.lockType).toBe('ACCESS EXCLUSIVE');
      expect(lock.blocksReads).toBe(true);
      expect(lock.blocksWrites).toBe(true);
      expect(lock.longHeld).toBe(true);
    });

    it('regular VACUUM is SHARE UPDATE EXCLUSIVE', async () => {
      const lock = await lockFor('VACUUM users;');
      expect(lock.lockType).toBe('SHARE UPDATE EXCLUSIVE');
      expect(lock.blocksReads).toBe(false);
      expect(lock.blocksWrites).toBe(false);
    });
  });

  describe('SET/RESET', () => {
    it('SET lock_timeout is ACCESS SHARE (no real lock)', async () => {
      const lock = await lockFor("SET lock_timeout = '5s';");
      expect(lock.lockType).toBe('ACCESS SHARE');
      expect(lock.blocksReads).toBe(false);
      expect(lock.blocksWrites).toBe(false);
    });

    it('RESET lock_timeout is ACCESS SHARE', async () => {
      const lock = await lockFor('RESET lock_timeout;');
      expect(lock.lockType).toBe('ACCESS SHARE');
    });
  });

  describe('Transaction control', () => {
    it('BEGIN is ACCESS SHARE (no table lock)', async () => {
      const lock = await lockFor('BEGIN;');
      expect(lock.lockType).toBe('ACCESS SHARE');
    });
  });

  describe('REINDEX', () => {
    it('REINDEX takes SHARE lock', async () => {
      const lock = await lockFor('REINDEX INDEX idx_users_email;');
      expect(lock.lockType).toBe('SHARE');
      expect(lock.longHeld).toBe(true);
    });
  });
});
