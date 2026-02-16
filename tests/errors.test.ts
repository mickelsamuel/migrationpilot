import { describe, it, expect } from 'vitest';
import { formatParseError, formatFileError, formatConnectionError, formatLicenseError } from '../src/output/errors.js';

describe('formatFileError', () => {
  it('shows the file path', () => {
    const output = formatFileError('/path/to/migration.sql');
    expect(output).toContain('/path/to/migration.sql');
  });

  it('shows common causes', () => {
    const output = formatFileError('/path/to/migration.sql');
    expect(output).toContain('misspelled');
    expect(output).toContain('permissions');
  });
});

describe('formatParseError', () => {
  it('shows file and error message', () => {
    const output = formatParseError({ file: 'test.sql', error: 'syntax error at position 42' });
    expect(output).toContain('test.sql');
    expect(output).toContain('syntax error at position 42');
  });

  it('shows SQL preview when provided', () => {
    const output = formatParseError({ file: 'test.sql', error: 'bad syntax', sql: 'ALTER TABLE users ADD COLUMN;' });
    expect(output).toContain('ALTER TABLE');
  });

  it('shows issue tracker link', () => {
    const output = formatParseError({ file: 'test.sql', error: 'bad syntax' });
    expect(output).toContain('issues');
  });
});

describe('formatConnectionError', () => {
  it('shows the error message', () => {
    const output = formatConnectionError('ECONNREFUSED 127.0.0.1:5432');
    expect(output).toContain('ECONNREFUSED');
  });

  it('shows helpful hints', () => {
    const output = formatConnectionError('connection refused');
    expect(output).toContain('not running');
    expect(output).toContain('Connection string');
  });

  it('mentions static analysis fallback', () => {
    const output = formatConnectionError('timeout');
    expect(output).toContain('Static analysis will continue');
  });
});

describe('formatLicenseError', () => {
  it('shows the error message', () => {
    const output = formatLicenseError('License expired');
    expect(output).toContain('License expired');
  });

  it('shows renewal link', () => {
    const output = formatLicenseError('Invalid key');
    expect(output).toContain('migrationpilot.dev/pricing');
  });

  it('mentions free tier fallback', () => {
    const output = formatLicenseError('expired');
    expect(output).toContain('Free static analysis');
  });
});
