/**
 * Migration file ordering and dependency validation.
 *
 * Validates that migration files follow proper ordering conventions,
 * detects potential conflicts, and warns about missing dependencies.
 *
 * Supported naming patterns:
 * - Flyway: V001__description.sql (version prefix)
 * - Timestamp: 20230101120000_description.sql
 * - Sequential: 001_description.sql
 */

import { basename } from 'node:path';

export interface MigrationFile {
  path: string;
  name: string;
  /** Parsed version/sequence number */
  version: string;
  /** Tables created in this migration */
  createdTables: string[];
  /** Tables referenced (ALTER, INSERT, etc.) in this migration */
  referencedTables: string[];
}

export interface OrderingIssue {
  type: 'out-of-order' | 'duplicate-version' | 'missing-dependency' | 'gap' | 'invalid-name';
  severity: 'critical' | 'warning';
  message: string;
  files: string[];
}

/**
 * Validate the ordering and dependencies of migration files.
 */
export function validateOrdering(files: MigrationFile[]): OrderingIssue[] {
  const issues: OrderingIssue[] = [];

  if (files.length < 2) return issues;

  // 1. Check for duplicate versions
  const versionMap = new Map<string, string[]>();
  for (const f of files) {
    if (f.version === '') continue;
    const existing = versionMap.get(f.version) || [];
    existing.push(f.name);
    versionMap.set(f.version, existing);
  }

  for (const [version, names] of versionMap) {
    if (names.length > 1) {
      issues.push({
        type: 'duplicate-version',
        severity: 'critical',
        message: `Duplicate migration version "${version}": ${names.join(', ')}`,
        files: names,
      });
    }
  }

  // 2. Check for out-of-order files
  const sorted = [...files].filter(f => f.version !== '').sort((a, b) =>
    a.version.localeCompare(b.version, undefined, { numeric: true })
  );

  const original = files.filter(f => f.version !== '');

  for (let i = 0; i < original.length; i++) {
    if (original[i].name !== sorted[i]?.name) {
      issues.push({
        type: 'out-of-order',
        severity: 'warning',
        message: `Migration files are not in version order. "${original[i].name}" should come after "${sorted[i]?.name || '?'}"`,
        files: [original[i].name, sorted[i]?.name || ''],
      });
      break; // Only report first out-of-order
    }
  }

  // 3. Check for version gaps (sequential numbering only)
  const isSequential = sorted.every(f => /^\d+$/.test(f.version));
  if (isSequential && sorted.length >= 2) {
    for (let i = 1; i < sorted.length; i++) {
      const prev = parseInt(sorted[i - 1].version, 10);
      const curr = parseInt(sorted[i].version, 10);
      if (curr - prev > 1) {
        issues.push({
          type: 'gap',
          severity: 'warning',
          message: `Gap in migration sequence: ${prev} → ${curr} (missing ${curr - prev - 1} migration${curr - prev - 1 > 1 ? 's' : ''})`,
          files: [sorted[i - 1].name, sorted[i].name],
        });
      }
    }
  }

  // 4. Check for missing dependencies (table used before created)
  const createdSoFar = new Set<string>();

  for (const f of sorted) {
    for (const table of f.referencedTables) {
      if (!createdSoFar.has(table) && !f.createdTables.includes(table)) {
        // Table referenced but not created yet — check if it's created in another file
        const creator = sorted.find(sf => sf.createdTables.includes(table));
        if (creator && creator.version > f.version) {
          issues.push({
            type: 'missing-dependency',
            severity: 'warning',
            message: `"${f.name}" references table "${table}" which is created later in "${creator.name}"`,
            files: [f.name, creator.name],
          });
        }
      }
    }
    for (const table of f.createdTables) {
      createdSoFar.add(table);
    }
  }

  // 5. Check for invalid naming
  for (const f of files) {
    if (f.version === '') {
      issues.push({
        type: 'invalid-name',
        severity: 'warning',
        message: `"${f.name}" does not follow a recognized naming convention (V*__, timestamp_, or sequential numbering)`,
        files: [f.name],
      });
    }
  }

  return issues;
}

/**
 * Parse a migration filename into its version component.
 */
export function parseVersion(filename: string): string {
  const name = basename(filename, '.sql');

  // Flyway: V001__description → 001
  const flywayMatch = name.match(/^V(\d+(?:\.\d+)*)/i);
  if (flywayMatch) return flywayMatch[1];

  // Timestamp: 20230101120000_description → 20230101120000
  const timestampMatch = name.match(/^(\d{14})/);
  if (timestampMatch) return timestampMatch[1];

  // Prisma: 20230101120000_description → 20230101120000
  const prismaMatch = name.match(/^(\d{8,14})/);
  if (prismaMatch) return prismaMatch[1];

  // Sequential: 001_description → 001
  const seqMatch = name.match(/^(\d{1,6})(?:_|\.|-)/);
  if (seqMatch) return seqMatch[1];

  // Just a number
  const numMatch = name.match(/^(\d+)$/);
  if (numMatch) return numMatch[1];

  return '';
}

/**
 * Build MigrationFile objects from file paths and parsed SQL data.
 */
export function buildMigrationFiles(
  files: Array<{
    path: string;
    createdTables: string[];
    referencedTables: string[];
  }>
): MigrationFile[] {
  return files.map(f => ({
    path: f.path,
    name: basename(f.path),
    version: parseVersion(f.path),
    createdTables: f.createdTables,
    referencedTables: f.referencedTables,
  }));
}
