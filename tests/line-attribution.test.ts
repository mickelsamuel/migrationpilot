/**
 * Where a violation says it is.
 *
 * Every one of these asserts an exact line, end to end through the real
 * pipeline, because that is what shipped wrong: libpg-query reports
 * `stmt_location` at the boundary *after* the previous statement, so reading a
 * line off it put every statement on the line its predecessor ended on. SARIF
 * gets its own pass — those line numbers become GitHub Code Scanning
 * annotations, and the earlier SARIF tests all fed the formatter hand-written
 * violations, so nothing checked the number the engine actually produced.
 */

import { describe, it, expect } from 'vitest';
import { analyzeSQL } from '../src/analysis/analyze.js';
import { allRules } from '../src/rules/index.js';
import { buildSarifLog } from '../src/output/sarif.js';
import { parseMigration } from '../src/parser/parse.js';
import { statementStart, lineOf } from '../src/parser/position.js';

/** Every distinct line a rule reported, ascending. */
async function reportedLines(sql: string): Promise<number[]> {
  const analysis = await analyzeSQL(sql, 'migration.sql', 17, allRules);
  return [...new Set(analysis.violations.map(v => v.line))].sort((a, b) => a - b);
}

/** The line each rule reported, as `MP004@2` pairs. */
async function reported(sql: string): Promise<string[]> {
  const analysis = await analyzeSQL(sql, 'migration.sql', 17, allRules);
  return analysis.violations.map(v => `${v.ruleId}@${v.line}`);
}

describe('violation line attribution', () => {
  it('gives each statement of a multi-statement file its own line', async () => {
    const sql = 'DROP TABLE a;\nDROP TABLE b;\n';
    expect(await reported(sql)).toEqual([
      'MP004@1', 'MP026@1',
      'MP004@2', 'MP026@2',
    ]);
  });

  it('counts the blank lines above the first statement', async () => {
    expect(await reportedLines('\n\n\nDROP TABLE a;\n')).toEqual([4]);
  });

  it('reports the statement, not the comment introducing it', async () => {
    const sql = [
      '-- migration: drop the legacy table',   // 1
      '-- author: someone',                    // 2
      '',                                      // 3
      'CREATE TABLE t (id int);',              // 4
      '',                                      // 5
      'DROP TABLE a;',                         // 6
    ].join('\n');
    expect(await reportedLines(sql)).toEqual([4, 6]);
  });

  it('reports through a comment inside BEGIN/COMMIT', async () => {
    const sql = [
      '-- wrap it up',                          // 1
      'BEGIN;',                                 // 2
      '',                                       // 3
      '-- this one cannot run in a transaction', // 4
      'CREATE INDEX CONCURRENTLY i ON t (c);',  // 5
      '',                                       // 6
      'COMMIT;',                                // 7
    ].join('\n');

    const analysis = await analyzeSQL(sql, 'migration.sql', 17, allRules);
    const mp025 = analysis.violations.filter(v => v.ruleId === 'MP025');
    expect(mp025).toHaveLength(1);
    expect(mp025[0]!.line).toBe(5);
  });

  it('counts CRLF lines the same as LF lines', async () => {
    const lf = 'DROP TABLE a;\nDROP TABLE b;\n';
    const crlf = 'DROP TABLE a;\r\nDROP TABLE b;\r\n';
    expect(await reported(crlf)).toEqual(await reported(lf));
    expect(await reportedLines(crlf)).toEqual([1, 2]);
  });

  it('counts CRLF lines with a comment header', async () => {
    const sql = '-- header\r\n\r\nDROP TABLE a;\r\n';
    expect(await reportedLines(sql)).toEqual([3]);
  });

  it('keeps two statements sharing one line on that line, and apart', async () => {
    const analysis = await analyzeSQL('DROP TABLE a; DROP TABLE b;', 'migration.sql', 17, allRules);
    expect(analysis.violations.every(v => v.line === 1)).toBe(true);
    // Grouping by line alone would hand every violation to both statements.
    expect(analysis.statements.map(s => s.violations.map(v => v.ruleId))).toEqual([
      ['MP004', 'MP026'],
      ['MP004', 'MP026'],
    ]);
  });

  it('strips the leading comment off the statement text', async () => {
    const analysis = await analyzeSQL('-- a note\nDROP TABLE a;', 'migration.sql', 17, allRules);
    expect(analysis.statements[0]!.sql).toBe('DROP TABLE a');
  });

  it('records the start line on each statement', async () => {
    const analysis = await analyzeSQL('DROP TABLE a;\n\n\nDROP TABLE b;', 'migration.sql', 17, allRules);
    expect(analysis.statements.map(s => s.line)).toEqual([1, 4]);
  });
});

describe('SARIF regions carry the same lines', () => {
  it('annotates the real line of each statement', async () => {
    const sql = [
      '-- add an index and drop a table',  // 1
      '',                                  // 2
      'CREATE INDEX i ON t (c);',          // 3
      '',                                  // 4
      'DROP TABLE legacy;',                // 5
    ].join('\n');

    const analysis = await analyzeSQL(sql, 'migrations/001.sql', 17, allRules);
    const log = buildSarifLog(analysis.violations, 'migrations/001.sql', allRules);

    const byRule = new Map(
      log.runs[0]!.results.map(r => [r.ruleId, r.locations[0]!.physicalLocation.region.startLine]),
    );
    expect(byRule.get('MP001')).toBe(3);
    expect(byRule.get('MP026')).toBe(5);

    // No annotation may land on a line the file does not have a statement on.
    const statementLines = new Set(analysis.statements.map(s => s.line));
    for (const r of log.runs[0]!.results) {
      expect(statementLines).toContain(r.locations[0]!.physicalLocation.region.startLine);
    }
  });
});

describe('parser positions', () => {
  it('separates the reported offset from the statement start', async () => {
    const sql = 'DROP TABLE a;\n\n-- why\nDROP TABLE b;';
    const { statements } = await parseMigration(sql);

    // libpg-query points at the character just past the first `;` …
    expect(statements[1]!.stmtLocation).toBe(13);
    // … and the statement itself starts after the blank line and the comment.
    expect(statements[1]!.startOffset).toBe(sql.indexOf('DROP TABLE b'));
    expect(statements[1]!.line).toBe(4);
  });

  it('skips nested block comments', () => {
    const sql = '/* outer /* inner */ still outer */ SELECT 1;';
    expect(statementStart(sql, 0, sql.length)).toBe(sql.indexOf('SELECT'));
  });

  it('leaves an all-trivia span alone', () => {
    const sql = '-- nothing but a comment\n';
    expect(statementStart(sql, 0, sql.length)).toBe(0);
  });

  it('counts lines from an offset', () => {
    const sql = 'a\nb\r\nc';
    expect(lineOf(sql, 0)).toBe(1);
    expect(lineOf(sql, sql.indexOf('b'))).toBe(2);
    expect(lineOf(sql, sql.indexOf('c'))).toBe(3);
  });
});
