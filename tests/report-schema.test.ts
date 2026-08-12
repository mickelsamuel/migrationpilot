/**
 * The published JSON schema has to describe the JSON the CLI actually emits.
 *
 * These two documents drift apart silently: the formatter grows a field, the
 * schema in site/public keeps `additionalProperties: false`, and nobody notices
 * until someone pipes `--format json` into a validator and gets told the tool's
 * own output is invalid. That is exactly how the 1.6.0 `reversibility` key
 * shipped against a schema that forbade it.
 *
 * So this runs the real formatter over a real analysis and validates the result
 * against the real schema file — no hand-written fixture on either side, and no
 * copy of the schema kept in the test. Add a field to the output without adding
 * it to the schema and this goes red.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { analyzeSQL } from '../src/analysis/analyze.js';
import { analyzeSequence } from '../src/sequence/analyze.js';
import { buildSequenceJson } from '../src/sequence/format.js';
import { formatJson, formatJsonMulti } from '../src/output/json.js';
import { allRules } from '../src/rules/index.js';

const SCHEMA_PATH = resolve(__dirname, '../site/public/schemas/report-v1.json');

/**
 * Migrations chosen to exercise the optional branches, not just the required
 * core: a destructive statement so `reversibility` grades RED and carries
 * reasons, and violations that come with `safeAlternative` text.
 */
const MIGRATIONS = [
  {
    path: '001_index.sql',
    sql: 'CREATE INDEX idx_users_email ON users (email);\n',
  },
  {
    path: '002_drop.sql',
    sql: 'ALTER TABLE users DROP COLUMN legacy_id;\nALTER TABLE users ADD COLUMN email text NOT NULL;\n',
  },
];

let validate: ValidateFunction;

/** ajv's errors are unreadable in a bare `expect(ok).toBe(true)` failure. */
function assertValid(doc: unknown, label: string): void {
  const ok = validate(doc);
  expect(
    ok,
    ok ? '' : `${label} does not match report-v1.json:\n${JSON.stringify(validate.errors, null, 2)}`,
  ).toBe(true);
}

beforeAll(() => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
  // `strict: false` matches how an outside consumer would load it — the schema
  // is draft-07 and ajv's strict mode rejects vocabulary it considers redundant.
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  validate = ajv.compile(schema);
});

describe('report-v1.json describes what the CLI emits', () => {
  it('validates a single-file report, reversibility included', async () => {
    const m = MIGRATIONS[1]!;
    const analysis = await analyzeSQL(m.sql, m.path, 17, allRules);

    // Guard the guard: a report with no reversibility would pass a schema that
    // forbids the key, and this test would prove nothing.
    expect(analysis.reversibility).toBeDefined();
    expect(analysis.reversibility!.reasons.length).toBeGreaterThan(0);

    assertValid(JSON.parse(formatJson(analysis, allRules)), 'single-file report');
  });

  it('validates a multi-file report, sequence findings included', async () => {
    const analyses = [];
    for (const m of MIGRATIONS) {
      analyses.push(await analyzeSQL(m.sql, m.path, 17, allRules));
    }
    const sequence = buildSequenceJson(
      await analyzeSequence(MIGRATIONS.map(m => ({ path: m.path, sql: m.sql }))),
    );

    expect(sequence.blastRadius.tables.length).toBeGreaterThan(0);

    assertValid(
      JSON.parse(formatJsonMulti(analyses, allRules, sequence)),
      'multi-file report',
    );
  });

  it('validates a multi-file report with sequence analysis off', async () => {
    const analyses = [await analyzeSQL(MIGRATIONS[0]!.sql, MIGRATIONS[0]!.path, 17, allRules)];
    assertValid(JSON.parse(formatJsonMulti(analyses, allRules)), 'multi-file report, --no-sequence');
  });

  // The point of `additionalProperties: false` is that it catches new fields.
  // If someone relaxes it to silence this file, the drift protection is gone
  // and every test above starts passing for the wrong reason.
  it('keeps both report branches closed to undeclared fields', () => {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
    expect(schema.definitions.JsonReport.additionalProperties).toBe(false);
    expect(schema.definitions.JsonMultiReport.additionalProperties).toBe(false);
  });
});
