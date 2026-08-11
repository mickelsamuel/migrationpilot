/**
 * Framework adapter tests, run against realistic mini-repos in
 * tests/fixtures/frameworks/ rather than synthetic one-file directories.
 *
 * The assertions that matter most are the ordering ones: getting the order
 * wrong means analyzing a migration against a schema state that never existed.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  adapterIds,
  getAdapter,
  resolveAllFrameworks,
  resolveFrameworkMigrations,
} from '../src/frameworks/adapters/index.js';
import { formatAdapterBanner, formatAdapterDetails, formatRecipe } from '../src/frameworks/adapters/report.js';
import { compareVersions } from '../src/frameworks/adapters/util.js';
import { parsePlan } from '../src/frameworks/adapters/sqitch.js';
import { extractGooseUp, extractDbmateUp, isLiquibaseFormattedSql } from '../src/frameworks/adapters/sections.js';
import type { AdapterResult } from '../src/frameworks/adapters/types.js';

const FIXTURES = resolve('tests/fixtures/frameworks');

function fixture(name: string): string {
  return resolve(FIXTURES, name);
}

async function resolveFixture(name: string, framework?: string): Promise<AdapterResult> {
  const result = await resolveFrameworkMigrations(fixture(name), framework);
  expect(result, `expected an adapter to match the ${name} fixture`).not.toBeNull();
  return result!;
}

describe('Prisma adapter', () => {
  it('finds migration.sql in every migration folder', async () => {
    const result = await resolveFixture('prisma');
    expect(result.id).toBe('prisma');
    expect(result.support).toBe('full');
    expect(result.migrations).toHaveLength(3);
    expect(result.migrations.map(m => m.label)).toEqual([
      'prisma/migrations/20240101120000_init/migration.sql',
      'prisma/migrations/20240215093000_add_email_index/migration.sql',
      'prisma/migrations/20240320174500_name_required/migration.sql',
    ]);
  });

  it('orders by migration folder timestamp', async () => {
    const result = await resolveFixture('prisma');
    expect(result.migrations.map(m => m.version)).toEqual([
      '20240101120000_init',
      '20240215093000_add_email_index',
      '20240320174500_name_required',
    ]);
    expect(result.ordering).toContain('timestamp');
  });

  it('reports a folder with no migration.sql instead of ignoring it', async () => {
    const result = await resolveFixture('prisma');
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.label).toBe('prisma/migrations/20240401000000_wip');
    expect(result.skipped[0]!.reason).toContain('no migration.sql');
  });

  it('carries the real SQL through', async () => {
    const result = await resolveFixture('prisma');
    const onDisk = await readFile(result.migrations[0]!.path, 'utf-8');
    expect(result.migrations[0]!.sql).toBe(onDisk);
  });
});

describe('Drizzle adapter', () => {
  it('orders by journal idx, not by the order entries appear in the file', async () => {
    const result = await resolveFixture('drizzle');
    expect(result.id).toBe('drizzle');
    expect(result.migrations.slice(0, 2).map(m => m.label)).toEqual([
      'drizzle/0000_create_users.sql',
      'drizzle/0001_add_email_index.sql',
    ]);
    expect(result.ordering).toContain('_journal.json');
  });

  it('flags SQL files the journal does not know about, and puts them last', async () => {
    const result = await resolveFixture('drizzle');
    const orphan = result.migrations[result.migrations.length - 1]!;
    expect(orphan.label).toBe('drizzle/0002_pending_rename.sql');
    expect(orphan.notes.join(' ')).toContain('not listed in meta/_journal.json');
  });
});

describe('Flyway adapter', () => {
  it('reads locations from flyway.conf', async () => {
    const result = await resolveFixture('flyway');
    expect(result.id).toBe('flyway');
    expect(result.sources).toEqual(['db/migration']);
    expect(result.notes.join(' ')).toContain('flyway.conf');
  });

  it('orders versions numerically, so V10 comes after V2', async () => {
    const result = await resolveFixture('flyway');
    expect(result.migrations.map(m => m.label)).toEqual([
      'db/migration/V1__create_users.sql',
      'db/migration/V1.1__add_last_login.sql',
      'db/migration/V2__add_email_index.sql',
      'db/migration/V10__add_orders.sql',
      'db/migration/R__active_users_view.sql',
    ]);
  });

  it('runs repeatable migrations after the versioned ones', async () => {
    const result = await resolveFixture('flyway');
    const last = result.migrations[result.migrations.length - 1]!;
    expect(last.label).toContain('R__');
    expect(result.notes.join(' ')).toContain('repeatable');
  });

  it('skips undo migrations and non-conforming filenames, with reasons', async () => {
    const result = await resolveFixture('flyway');
    const reasons = new Map(result.skipped.map(s => [s.label, s.reason]));
    expect(reasons.get('db/migration/U2__add_email_index.sql')).toContain('undo migration');
    expect(reasons.get('db/migration/scratch_notes.sql')).toContain('does not match the Flyway convention');
  });
});

describe('Liquibase adapter', () => {
  it('reads formatted-SQL changelogs directly', async () => {
    const result = await resolveFixture('liquibase');
    expect(result.id).toBe('liquibase');
    expect(result.support).toBe('full');
    expect(result.migrations.map(m => m.label)).toEqual([
      'db/changelog/changes/001-create-users.sql',
      'db/changelog/changes/002-add-email-index.sql',
    ]);
    expect(result.migrations[0]!.notes.join(' ')).toContain('dev:001-create-users');
  });

  it('explains why XML changelogs cannot be read, and offers the command that can', async () => {
    const result = await resolveFixture('liquibase');
    const xml = result.skipped.find(s => s.label.endsWith('.xml'));
    expect(xml).toBeDefined();
    expect(xml!.reason).toContain('generated by Liquibase at runtime');
    expect(result.recipe?.fromCommand).toContain('liquibase updateSQL');
  });
});

describe('goose adapter', () => {
  it('analyzes only the +goose Up section', async () => {
    const result = await resolveFixture('goose');
    expect(result.id).toBe('goose');
    const first = result.migrations[0]!;
    expect(first.sql).toContain('CREATE TABLE users');
    expect(first.sql).not.toContain('DROP TABLE users');
  });

  it('keeps line numbers aligned with the source file', async () => {
    const result = await resolveFixture('goose');
    const first = result.migrations[0]!;
    const onDisk = await readFile(first.path, 'utf-8');
    expect(first.sql.split('\n')).toHaveLength(onDisk.split(/\r?\n/).length);
  });

  it('notes NO TRANSACTION and skips Go migrations and unannotated files', async () => {
    const result = await resolveFixture('goose');
    const noTx = result.migrations.find(m => m.label.includes('00002'));
    expect(noTx!.notes.join(' ')).toContain('NO TRANSACTION');

    const reasons = new Map(result.skipped.map(s => [s.label, s.reason]));
    expect(reasons.get('db/migrations/00003_missing_marker.sql')).toContain('+goose Up');
    expect(reasons.get('db/migrations/00004_backfill.go')).toContain('Go migration');
  });
});

describe('dbmate adapter', () => {
  it('analyzes only the migrate:up section and notes transaction:false', async () => {
    const result = await resolveFixture('dbmate');
    expect(result.id).toBe('dbmate');
    expect(result.migrations).toHaveLength(2);
    expect(result.migrations[0]!.sql).toContain('CREATE TABLE users');
    expect(result.migrations[0]!.sql).not.toContain('DROP TABLE users');
    expect(result.migrations[1]!.notes.join(' ')).toContain('transaction:false');
  });

  it('orders by the numeric filename prefix', async () => {
    const result = await resolveFixture('dbmate');
    expect(result.migrations.map(m => m.version)).toEqual(['20240101000000', '20240202120000']);
  });
});

describe('Sqitch adapter', () => {
  it('orders by sqitch.plan, not alphabetically', async () => {
    const result = await resolveFixture('sqitch');
    expect(result.id).toBe('sqitch');
    expect(result.migrations.map(m => m.label)).toEqual([
      'deploy/appschema.sql',
      'deploy/users.sql',
      'deploy/add_user_index.sql',
    ]);
    expect(result.ordering).toContain('sqitch.plan');
  });

  it('skips deploy scripts the plan does not list', async () => {
    const result = await resolveFixture('sqitch');
    expect(result.skipped.map(s => s.label)).toEqual(['deploy/experiment.sql']);
    expect(result.skipped[0]!.reason).toContain('not listed in sqitch.plan');
  });
});

describe('TypeORM adapter', () => {
  it('extracts raw SQL literals and skips what it cannot read', async () => {
    const result = await resolveFixture('typeorm');
    expect(result.id).toBe('typeorm');
    expect(result.support).toBe('extracted');
    expect(result.migrations.map(m => m.label)).toEqual([
      'src/migrations/1704110400000-CreateUsers.ts',
      'src/migrations/1707310800000-AddEmailIndex.ts',
    ]);

    const reasons = new Map(result.skipped.map(s => [s.label, s.reason]));
    expect(reasons.get('src/migrations/1710000000000-BackfillTenants.ts')).toContain('cannot statically extract');
    expect(reasons.get('src/migrations/1712000000000-CreateSessions.ts')).toContain('schema-builder API');
  });

  it('never pulls SQL out of the down migration', async () => {
    const result = await resolveFixture('typeorm');
    const all = result.migrations.map(m => m.sql).join('\n');
    expect(all).toContain('CREATE TABLE "users"');
    expect(all).toContain('CREATE INDEX "idx_users_email"');
    expect(all).not.toContain('DROP TABLE');
    expect(all).not.toContain('DROP INDEX');
  });
});

describe('Knex adapter', () => {
  it('reads the migrations directory out of knexfile.js', async () => {
    const result = await resolveFixture('knex');
    expect(result.id).toBe('knex');
    expect(result.sources).toEqual(['db/migrations']);
  });

  it('extracts knex.raw() literals and reports schema-builder migrations', async () => {
    const result = await resolveFixture('knex');
    expect(result.migrations).toHaveLength(1);
    expect(result.migrations[0]!.sql).toContain('CREATE INDEX idx_users_email');
    expect(result.skipped[0]!.reason).toContain('schema-builder API');
  });
});

describe('Sequelize adapter', () => {
  it('extracts sequelize.query() literals from the up property', async () => {
    const result = await resolveFixture('sequelize');
    expect(result.id).toBe('sequelize');
    expect(result.migrations).toHaveLength(1);
    expect(result.migrations[0]!.sql).toContain('CREATE INDEX idx_users_email');
    expect(result.migrations[0]!.sql).not.toContain('DROP INDEX');
  });
});

describe('Tier-2 recipe adapters', () => {
  it('Django reports its Python migrations and the sqlmigrate recipe', async () => {
    const result = await resolveFixture('django');
    expect(result.support).toBe('recipe');
    expect(result.migrations).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped[0]!.reason).toContain('sqlmigrate');
    expect(result.recipe?.fromCommand).toContain('manage.py sqlmigrate shop');
  });

  it('Alembic points at offline mode', async () => {
    const result = await resolveFixture('alembic');
    expect(result.support).toBe('recipe');
    expect(result.recipe?.fromCommand).toContain('alembic upgrade head --sql');
    expect(result.ordering).toContain('down_revision');
  });

  it('Rails explains that structure.sql is a dump, not a migration', async () => {
    const result = await resolveFixture('rails');
    expect(result.support).toBe('recipe');
    expect(result.skipped).toHaveLength(2);
    expect(result.notes.join(' ')).toContain('structure.sql');
    expect(result.recipe?.steps.join('\n')).toContain('AddEmailIndex');
  });
});

describe('adapter registry', () => {
  it('picks the framework that can deliver SQL', async () => {
    const result = await resolveFixture('prisma');
    expect(result.id).toBe('prisma');
  });

  it('returns null for a project with no migration framework', async () => {
    expect(await resolveFrameworkMigrations(fixture('empty'))).toBeNull();
  });

  it('returns null when a forced framework does not match', async () => {
    expect(await resolveFrameworkMigrations(fixture('prisma'), 'drizzle')).toBeNull();
    expect(await resolveFrameworkMigrations(fixture('prisma'), 'not-a-framework')).toBeNull();
  });

  it('exposes every adapter id', () => {
    expect(adapterIds).toContain('prisma');
    expect(adapterIds).toContain('sqitch');
    expect(adapterIds).toHaveLength(13);
    expect(getAdapter('PRISMA')?.name).toBe('Prisma');
    expect(getAdapter('nope')).toBeUndefined();
  });

  it('does not claim a framework it cannot find', async () => {
    const all = await resolveAllFrameworks(fixture('goose'));
    expect(all.map(r => r.id)).toContain('goose');
    expect(all.map(r => r.id)).not.toContain('prisma');
  });
});

describe('reporting', () => {
  it('says what was detected, how much, and from where', async () => {
    const result = await resolveFixture('prisma');
    expect(formatAdapterBanner(result)).toBe('Detected Prisma — analyzing 3 migrations from prisma/migrations/');
  });

  it('prints the ordering rule and every skip reason', async () => {
    const result = await resolveFixture('flyway');
    const details = formatAdapterDetails(result);
    expect(details).toContain('Ordering: Flyway version order');
    expect(details).toContain('Not analyzed (2):');
    expect(details).toContain('U2__add_email_index.sql');
  });

  it('reports a recipe framework as not analyzable rather than as clean', async () => {
    const result = await resolveFixture('django');
    expect(formatAdapterBanner(result)).toContain('none analyzable');
    expect(formatRecipe(result)).toContain('manage.py sqlmigrate');
  });
});

describe('ordering primitives', () => {
  it('compares versions numerically, part by part', () => {
    expect(compareVersions('2', '10')).toBeLessThan(0);
    expect(compareVersions('1.10', '1.9')).toBeGreaterThan(0);
    expect(compareVersions('1.1', '1.1')).toBe(0);
    expect(compareVersions('1_1', '1.1')).toBe(0);
    expect(compareVersions('1', '1.1')).toBeLessThan(0);
    expect(compareVersions('20240101000000', '20240202120000')).toBeLessThan(0);
  });

  it('reads change order out of a sqitch plan, ignoring pragmas and tags', () => {
    const plan = [
      '%syntax-version=1.0.0',
      '%project=app',
      '',
      '# a comment',
      'appschema 2024-01-02T10:00:00Z Dev <dev@example.com> # note',
      'users [appschema] 2024-01-02T10:05:00Z Dev <dev@example.com> # note',
      '@v1.0.0 2024-01-03T09:00:00Z Dev <dev@example.com> # tag',
      'add_user_index [users] 2024-02-11T14:20:00Z Dev <dev@example.com> # note',
    ].join('\n');
    expect(parsePlan(plan)).toEqual(['appschema', 'users', 'add_user_index']);
  });
});

describe('annotated SQL sections', () => {
  it('blanks the goose down section but keeps the line count', () => {
    const sql = '-- +goose Up\nCREATE TABLE t (id int);\n-- +goose Down\nDROP TABLE t;\n';
    const extracted = extractGooseUp(sql);
    expect(extracted.foundUp).toBe(true);
    expect(extracted.sql).toContain('CREATE TABLE t');
    expect(extracted.sql).not.toContain('DROP TABLE t');
    expect(extracted.sql.split('\n')).toHaveLength(sql.split('\n').length);
  });

  it('handles repeated dbmate up/down blocks', () => {
    const sql = [
      '-- migrate:up',
      'CREATE TABLE a (id int);',
      '-- migrate:down',
      'DROP TABLE a;',
      '-- migrate:up',
      'CREATE TABLE b (id int);',
      '-- migrate:down',
      'DROP TABLE b;',
    ].join('\n');
    const extracted = extractDbmateUp(sql);
    expect(extracted.sql).toContain('CREATE TABLE a');
    expect(extracted.sql).toContain('CREATE TABLE b');
    expect(extracted.sql).not.toContain('DROP TABLE');
  });

  it('recognizes a Liquibase formatted-SQL header only at the top of the file', () => {
    expect(isLiquibaseFormattedSql('--liquibase formatted sql\n--changeset a:b\nSELECT 1;')).toBe(true);
    expect(isLiquibaseFormattedSql('\n\n--liquibase formatted sql\n')).toBe(true);
    expect(isLiquibaseFormattedSql('SELECT 1;\n--liquibase formatted sql')).toBe(false);
    expect(isLiquibaseFormattedSql('CREATE TABLE t (id int);')).toBe(false);
  });
});
