import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectFrameworks, getSuggestedPattern } from '../src/frameworks/detect.js';

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `mp-fw-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('detectFrameworks', () => {
  it('returns empty for empty directory', async () => {
    const result = await detectFrameworks(testDir);
    expect(result).toHaveLength(0);
  });

  it('detects Flyway from flyway.conf', async () => {
    await writeFile(join(testDir, 'flyway.conf'), 'flyway.url=jdbc:postgresql://localhost:5432/db');
    const result = await detectFrameworks(testDir);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('flyway');
    expect(result[0].confidence).toBe('high');
    expect(result[0].filePattern).toContain('V*.sql');
  });

  it('detects Flyway from sql/ directory with V files', async () => {
    await mkdir(join(testDir, 'sql'), { recursive: true });
    await writeFile(join(testDir, 'sql', 'V1__init.sql'), 'CREATE TABLE users (id int);');
    const result = await detectFrameworks(testDir);
    const flyway = result.find(r => r.id === 'flyway');
    expect(flyway).toBeDefined();
    expect(flyway!.confidence).toBe('medium');
  });

  it('detects Liquibase from liquibase.properties', async () => {
    await writeFile(join(testDir, 'liquibase.properties'), 'url=jdbc:postgresql://localhost/db');
    const result = await detectFrameworks(testDir);
    expect(result.find(r => r.id === 'liquibase')).toBeDefined();
  });

  it('detects Liquibase from changelog file', async () => {
    await writeFile(join(testDir, 'db.changelog-master.xml'), '<databaseChangeLog/>');
    const result = await detectFrameworks(testDir);
    const lb = result.find(r => r.id === 'liquibase');
    expect(lb).toBeDefined();
    expect(lb!.confidence).toBe('high');
  });

  it('detects Alembic from alembic.ini', async () => {
    await writeFile(join(testDir, 'alembic.ini'), '[alembic]\nscript_location = alembic');
    const result = await detectFrameworks(testDir);
    const alembic = result.find(r => r.id === 'alembic');
    expect(alembic).toBeDefined();
    expect(alembic!.confidence).toBe('high');
    expect(alembic!.migrationPath).toBe('alembic/versions');
  });

  it('detects Alembic from directory structure', async () => {
    await mkdir(join(testDir, 'alembic', 'versions'), { recursive: true });
    const result = await detectFrameworks(testDir);
    const alembic = result.find(r => r.id === 'alembic');
    expect(alembic).toBeDefined();
    expect(alembic!.confidence).toBe('medium');
  });

  it('detects Prisma from schema.prisma', async () => {
    await mkdir(join(testDir, 'prisma'), { recursive: true });
    await writeFile(join(testDir, 'prisma', 'schema.prisma'), 'datasource db { provider = "postgresql" }');
    const result = await detectFrameworks(testDir);
    const prisma = result.find(r => r.id === 'prisma');
    expect(prisma).toBeDefined();
    expect(prisma!.confidence).toBe('high');
    expect(prisma!.filePattern).toContain('migration.sql');
  });

  it('detects Drizzle from drizzle.config.ts', async () => {
    await writeFile(join(testDir, 'drizzle.config.ts'), 'export default { dialect: "postgresql" }');
    const result = await detectFrameworks(testDir);
    const drizzle = result.find(r => r.id === 'drizzle');
    expect(drizzle).toBeDefined();
    expect(drizzle!.confidence).toBe('high');
  });

  it('detects Knex from knexfile.js', async () => {
    await writeFile(join(testDir, 'knexfile.js'), 'module.exports = { client: "pg" }');
    const result = await detectFrameworks(testDir);
    const knex = result.find(r => r.id === 'knex');
    expect(knex).toBeDefined();
    expect(knex!.confidence).toBe('high');
  });

  it('detects Sqitch from sqitch.plan', async () => {
    await writeFile(join(testDir, 'sqitch.plan'), '%syntax-version=1.0.0');
    const result = await detectFrameworks(testDir);
    const sqitch = result.find(r => r.id === 'sqitch');
    expect(sqitch).toBeDefined();
    expect(sqitch!.migrationPath).toBe('deploy');
  });

  it('detects Rails from Gemfile + db/migrate', async () => {
    await writeFile(join(testDir, 'Gemfile'), 'gem "rails"');
    await mkdir(join(testDir, 'db', 'migrate'), { recursive: true });
    const result = await detectFrameworks(testDir);
    const rails = result.find(r => r.id === 'rails');
    expect(rails).toBeDefined();
    expect(rails!.confidence).toBe('high');
  });

  it('detects Ecto from mix.exs + priv/repo/migrations', async () => {
    await writeFile(join(testDir, 'mix.exs'), 'defmodule App.MixProject');
    await mkdir(join(testDir, 'priv', 'repo', 'migrations'), { recursive: true });
    const result = await detectFrameworks(testDir);
    const ecto = result.find(r => r.id === 'ecto');
    expect(ecto).toBeDefined();
  });

  it('detects multiple frameworks', async () => {
    await writeFile(join(testDir, 'flyway.conf'), 'flyway.url=test');
    await writeFile(join(testDir, 'alembic.ini'), '[alembic]');
    const result = await detectFrameworks(testDir);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const ids = result.map(r => r.id);
    expect(ids).toContain('flyway');
    expect(ids).toContain('alembic');
  });

  it('sorts results by confidence (high first)', async () => {
    await writeFile(join(testDir, 'flyway.conf'), 'flyway.url=test');
    await mkdir(join(testDir, 'alembic', 'versions'), { recursive: true });
    const result = await detectFrameworks(testDir);
    if (result.length >= 2) {
      const confidences = result.map(r => r.confidence);
      const order = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < confidences.length; i++) {
        expect(order[confidences[i]]).toBeGreaterThanOrEqual(order[confidences[i - 1]]);
      }
    }
  });
});

describe('getSuggestedPattern', () => {
  it('returns filePattern when present', () => {
    const result = getSuggestedPattern({
      name: 'Prisma', id: 'prisma', confidence: 'high',
      filePattern: 'prisma/migrations/**/migration.sql',
      evidence: 'test',
    });
    expect(result).toBe('prisma/migrations/**/migration.sql');
  });

  it('returns default when no filePattern', () => {
    const result = getSuggestedPattern({
      name: 'Unknown', id: 'unknown', confidence: 'low',
      evidence: 'test',
    });
    expect(result).toBe('**/*.sql');
  });
});
