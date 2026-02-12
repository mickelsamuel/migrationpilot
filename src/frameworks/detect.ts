/**
 * Migration framework auto-detection.
 *
 * Detects popular PostgreSQL migration frameworks from project structure,
 * config files, and migration file naming patterns. Used to:
 * - Automatically find migration directories
 * - Suggest correct --migration-path patterns
 * - Adapt rule behavior (e.g., Flyway uses V__*.sql naming)
 */

import { stat, readdir, readFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';

export interface DetectedFramework {
  /** Framework name */
  name: string;
  /** Short identifier */
  id: FrameworkId;
  /** Confidence: high (config file found), medium (directory pattern), low (heuristic) */
  confidence: 'high' | 'medium' | 'low';
  /** Detected migration directory path (relative) */
  migrationPath?: string;
  /** Suggested glob pattern for migration files */
  filePattern?: string;
  /** Evidence that led to detection */
  evidence: string;
}

export type FrameworkId =
  | 'flyway'
  | 'liquibase'
  | 'alembic'
  | 'django'
  | 'knex'
  | 'prisma'
  | 'typeorm'
  | 'drizzle'
  | 'sequelize'
  | 'goose'
  | 'dbmate'
  | 'sqitch'
  | 'rails'
  | 'ecto'
  | 'unknown';

/**
 * Auto-detect migration framework(s) in the given directory.
 * Returns all detected frameworks, sorted by confidence (highest first).
 */
export async function detectFrameworks(dir: string): Promise<DetectedFramework[]> {
  const results: DetectedFramework[] = [];

  // Run all detectors in parallel
  const detectors = [
    detectFlyway(dir),
    detectLiquibase(dir),
    detectAlembic(dir),
    detectDjango(dir),
    detectKnex(dir),
    detectPrisma(dir),
    detectTypeORM(dir),
    detectDrizzle(dir),
    detectSequelize(dir),
    detectGoose(dir),
    detectDbmate(dir),
    detectSqitch(dir),
    detectRails(dir),
    detectEcto(dir),
  ];

  const detected = await Promise.all(detectors);
  for (const d of detected) {
    if (d) results.push(d);
  }

  // Sort by confidence: high > medium > low
  const order = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => order[a.confidence] - order[b.confidence]);

  return results;
}

/**
 * Get the suggested migration path for a detected framework.
 */
export function getSuggestedPattern(framework: DetectedFramework): string {
  return framework.filePattern || '**/*.sql';
}

// --- Individual framework detectors ---

async function detectFlyway(dir: string): Promise<DetectedFramework | null> {
  // Check for flyway.conf or flyway.toml
  if (await exists(join(dir, 'flyway.conf')) || await exists(join(dir, 'flyway.toml'))) {
    return {
      name: 'Flyway',
      id: 'flyway',
      confidence: 'high',
      migrationPath: 'sql',
      filePattern: 'sql/V*.sql',
      evidence: 'flyway.conf or flyway.toml found',
    };
  }

  // Check for sql/ directory with V__*.sql files
  const sqlDir = join(dir, 'sql');
  if (await exists(sqlDir) && await hasMatchingFiles(sqlDir, /^V\d/)) {
    return {
      name: 'Flyway',
      id: 'flyway',
      confidence: 'medium',
      migrationPath: 'sql',
      filePattern: 'sql/V*.sql',
      evidence: 'sql/ directory with V*.sql files',
    };
  }

  // Check for db/migration with V__*.sql
  const dbMigDir = join(dir, 'db', 'migration');
  if (await exists(dbMigDir) && await hasMatchingFiles(dbMigDir, /^V\d/)) {
    return {
      name: 'Flyway',
      id: 'flyway',
      confidence: 'medium',
      migrationPath: 'db/migration',
      filePattern: 'db/migration/V*.sql',
      evidence: 'db/migration/ directory with V*.sql files',
    };
  }

  return null;
}

async function detectLiquibase(dir: string): Promise<DetectedFramework | null> {
  if (await exists(join(dir, 'liquibase.properties'))) {
    return {
      name: 'Liquibase',
      id: 'liquibase',
      confidence: 'high',
      migrationPath: 'migrations',
      filePattern: 'migrations/**/*.sql',
      evidence: 'liquibase.properties found',
    };
  }

  // Check for changelog files
  const changelogPatterns = ['db.changelog-master.xml', 'db.changelog-master.yaml', 'db.changelog-master.sql'];
  for (const p of changelogPatterns) {
    if (await exists(join(dir, p))) {
      return {
        name: 'Liquibase',
        id: 'liquibase',
        confidence: 'high',
        filePattern: '**/*.sql',
        evidence: `${p} found`,
      };
    }
  }

  return null;
}

async function detectAlembic(dir: string): Promise<DetectedFramework | null> {
  if (await exists(join(dir, 'alembic.ini'))) {
    return {
      name: 'Alembic (SQLAlchemy)',
      id: 'alembic',
      confidence: 'high',
      migrationPath: 'alembic/versions',
      filePattern: 'alembic/versions/*.sql',
      evidence: 'alembic.ini found',
    };
  }

  if (await exists(join(dir, 'alembic', 'versions'))) {
    return {
      name: 'Alembic (SQLAlchemy)',
      id: 'alembic',
      confidence: 'medium',
      migrationPath: 'alembic/versions',
      filePattern: 'alembic/versions/*.sql',
      evidence: 'alembic/versions/ directory found',
    };
  }

  return null;
}

async function detectDjango(dir: string): Promise<DetectedFramework | null> {
  if (await exists(join(dir, 'manage.py'))) {
    // Look for any app with migrations/ directory
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && await exists(join(dir, entry.name, 'migrations'))) {
          return {
            name: 'Django',
            id: 'django',
            confidence: 'high',
            migrationPath: `${entry.name}/migrations`,
            filePattern: '**/migrations/*.sql',
            evidence: `manage.py + ${entry.name}/migrations/ found`,
          };
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  return null;
}

async function detectKnex(dir: string): Promise<DetectedFramework | null> {
  const knexfiles = ['knexfile.js', 'knexfile.ts', 'knexfile.mjs'];
  for (const f of knexfiles) {
    if (await exists(join(dir, f))) {
      return {
        name: 'Knex.js',
        id: 'knex',
        confidence: 'high',
        migrationPath: 'migrations',
        filePattern: 'migrations/*.sql',
        evidence: `${f} found`,
      };
    }
  }

  if (await exists(join(dir, 'migrations')) && await hasMatchingFiles(join(dir, 'migrations'), /^\d{14}/)) {
    return {
      name: 'Knex.js',
      id: 'knex',
      confidence: 'low',
      migrationPath: 'migrations',
      filePattern: 'migrations/*.sql',
      evidence: 'migrations/ with timestamp-named files',
    };
  }

  return null;
}

async function detectPrisma(dir: string): Promise<DetectedFramework | null> {
  if (await exists(join(dir, 'prisma', 'schema.prisma'))) {
    return {
      name: 'Prisma',
      id: 'prisma',
      confidence: 'high',
      migrationPath: 'prisma/migrations',
      filePattern: 'prisma/migrations/**/migration.sql',
      evidence: 'prisma/schema.prisma found',
    };
  }

  if (await exists(join(dir, 'prisma', 'migrations'))) {
    return {
      name: 'Prisma',
      id: 'prisma',
      confidence: 'medium',
      migrationPath: 'prisma/migrations',
      filePattern: 'prisma/migrations/**/migration.sql',
      evidence: 'prisma/migrations/ directory found',
    };
  }

  return null;
}

async function detectTypeORM(dir: string): Promise<DetectedFramework | null> {
  const configs = ['ormconfig.json', 'ormconfig.js', 'ormconfig.ts'];
  for (const f of configs) {
    if (await exists(join(dir, f))) {
      return {
        name: 'TypeORM',
        id: 'typeorm',
        confidence: 'high',
        migrationPath: 'src/migrations',
        filePattern: 'src/migrations/*.ts',
        evidence: `${f} found`,
      };
    }
  }

  // Check package.json for typeorm dependency
  const pkg = await readPackageJson(dir);
  if (pkg && (pkg.dependencies?.typeorm || pkg.devDependencies?.typeorm)) {
    return {
      name: 'TypeORM',
      id: 'typeorm',
      confidence: 'medium',
      migrationPath: 'src/migrations',
      filePattern: 'src/migrations/*.ts',
      evidence: 'typeorm in package.json dependencies',
    };
  }

  return null;
}

async function detectDrizzle(dir: string): Promise<DetectedFramework | null> {
  const configs = ['drizzle.config.ts', 'drizzle.config.js'];
  for (const f of configs) {
    if (await exists(join(dir, f))) {
      return {
        name: 'Drizzle',
        id: 'drizzle',
        confidence: 'high',
        migrationPath: 'drizzle',
        filePattern: 'drizzle/*.sql',
        evidence: `${f} found`,
      };
    }
  }

  if (await exists(join(dir, 'drizzle')) && await hasMatchingFiles(join(dir, 'drizzle'), /\.sql$/)) {
    return {
      name: 'Drizzle',
      id: 'drizzle',
      confidence: 'medium',
      migrationPath: 'drizzle',
      filePattern: 'drizzle/*.sql',
      evidence: 'drizzle/ directory with .sql files',
    };
  }

  return null;
}

async function detectSequelize(dir: string): Promise<DetectedFramework | null> {
  if (await exists(join(dir, '.sequelizerc'))) {
    return {
      name: 'Sequelize',
      id: 'sequelize',
      confidence: 'high',
      migrationPath: 'migrations',
      filePattern: 'migrations/*.js',
      evidence: '.sequelizerc found',
    };
  }

  const pkg = await readPackageJson(dir);
  if (pkg && (pkg.dependencies?.sequelize || pkg.devDependencies?.sequelize)) {
    if (await exists(join(dir, 'migrations'))) {
      return {
        name: 'Sequelize',
        id: 'sequelize',
        confidence: 'medium',
        migrationPath: 'migrations',
        filePattern: 'migrations/*.js',
        evidence: 'sequelize in package.json + migrations/ directory',
      };
    }
  }

  return null;
}

async function detectGoose(dir: string): Promise<DetectedFramework | null> {
  // Goose uses db/migrations with numbered .sql files
  const dirs = ['db/migrations', 'migrations'];
  for (const d of dirs) {
    const fullPath = join(dir, d);
    if (await exists(fullPath) && await hasMatchingFiles(fullPath, /^\d{14}.*\.sql$/)) {
      // Check if it's Go project
      if (await exists(join(dir, 'go.mod'))) {
        return {
          name: 'goose',
          id: 'goose',
          confidence: 'medium',
          migrationPath: d,
          filePattern: `${d}/*.sql`,
          evidence: `go.mod + ${d}/ with numbered .sql files`,
        };
      }
    }
  }

  return null;
}

async function detectDbmate(dir: string): Promise<DetectedFramework | null> {
  if (await exists(join(dir, 'db', 'migrations')) && await exists(join(dir, '.env'))) {
    const envContent = await safeReadFile(join(dir, '.env'));
    if (envContent && envContent.includes('DATABASE_URL')) {
      if (await hasMatchingFiles(join(dir, 'db', 'migrations'), /^\d{14}/)) {
        return {
          name: 'dbmate',
          id: 'dbmate',
          confidence: 'low',
          migrationPath: 'db/migrations',
          filePattern: 'db/migrations/*.sql',
          evidence: 'db/migrations/ with timestamp files + .env with DATABASE_URL',
        };
      }
    }
  }

  return null;
}

async function detectSqitch(dir: string): Promise<DetectedFramework | null> {
  if (await exists(join(dir, 'sqitch.plan'))) {
    return {
      name: 'Sqitch',
      id: 'sqitch',
      confidence: 'high',
      migrationPath: 'deploy',
      filePattern: 'deploy/*.sql',
      evidence: 'sqitch.plan found',
    };
  }

  return null;
}

async function detectRails(dir: string): Promise<DetectedFramework | null> {
  if (await exists(join(dir, 'Gemfile')) && await exists(join(dir, 'db', 'migrate'))) {
    return {
      name: 'Rails ActiveRecord',
      id: 'rails',
      confidence: 'high',
      migrationPath: 'db/migrate',
      filePattern: 'db/migrate/*.rb',
      evidence: 'Gemfile + db/migrate/ found',
    };
  }

  return null;
}

async function detectEcto(dir: string): Promise<DetectedFramework | null> {
  if (await exists(join(dir, 'mix.exs')) && await exists(join(dir, 'priv', 'repo', 'migrations'))) {
    return {
      name: 'Ecto (Elixir)',
      id: 'ecto',
      confidence: 'high',
      migrationPath: 'priv/repo/migrations',
      filePattern: 'priv/repo/migrations/*.exs',
      evidence: 'mix.exs + priv/repo/migrations/ found',
    };
  }

  return null;
}

// --- Helpers ---

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function hasMatchingFiles(dir: string, pattern: RegExp): Promise<boolean> {
  try {
    const entries = await readdir(dir);
    return entries.some(e => pattern.test(e));
  } catch {
    return false;
  }
}

async function readPackageJson(dir: string): Promise<Record<string, Record<string, string>> | null> {
  try {
    const content = await readFile(join(dir, 'package.json'), 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function safeReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}
