export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  readingTime: string;
  keywords: string[];
}

export const blogPosts: BlogPost[] = [
  {
    slug: 'postgresql-lock-types-guide',
    title: 'The Complete Guide to PostgreSQL Lock Types for Schema Changes',
    description: 'Understand every PostgreSQL lock level from ACCESS SHARE to ACCESS EXCLUSIVE, which DDL statements acquire which locks, and how they impact your running application.',
    date: '2026-02-24',
    readingTime: '12 min read',
    keywords: ['postgresql lock types', 'postgresql locks', 'access exclusive lock', 'share lock postgresql', 'ddl locks'],
  },
  {
    slug: 'add-column-default-postgresql',
    title: 'How to Safely Add a Column with a Default Value in PostgreSQL',
    description: 'Learn when adding a column with a DEFAULT value rewrites the entire table, what changed in PostgreSQL 11, and the safe patterns for every scenario.',
    date: '2026-02-24',
    readingTime: '10 min read',
    keywords: ['add column default postgresql', 'alter table add column default', 'postgresql add column', 'postgresql table rewrite'],
  },
  {
    slug: 'create-index-concurrently-postgresql',
    title: 'CREATE INDEX CONCURRENTLY: The Complete PostgreSQL Guide',
    description: 'Everything you need to know about CREATE INDEX CONCURRENTLY in PostgreSQL: why it matters, failure modes, retry patterns, and REINDEX CONCURRENTLY.',
    date: '2026-02-24',
    readingTime: '11 min read',
    keywords: ['create index concurrently postgresql', 'postgresql concurrent index', 'postgresql index without locking', 'reindex concurrently'],
  },
  {
    slug: 'postgresql-migration-best-practices',
    title: 'PostgreSQL Migration Best Practices for Zero-Downtime Deployments',
    description: 'A practical guide to running PostgreSQL schema migrations safely in production: lock_timeout, batched backfills, expand-contract, and CI integration.',
    date: '2026-02-24',
    readingTime: '14 min read',
    keywords: ['postgresql migration best practices', 'zero downtime migration postgresql', 'postgresql schema migration', 'database migration strategy'],
  },
  {
    slug: 'alter-table-lock-postgresql',
    title: 'Which ALTER TABLE Operations Lock Your PostgreSQL Table?',
    description: 'A complete reference of which ALTER TABLE operations acquire ACCESS EXCLUSIVE locks, which are safe, and the workarounds for every dangerous operation.',
    date: '2026-02-24',
    readingTime: '11 min read',
    keywords: ['alter table lock postgresql', 'postgresql alter table locks', 'access exclusive lock alter table', 'postgresql ddl locking'],
  },
  {
    slug: 'database-migration-ci-cd',
    title: 'How to Add Database Migration Checks to Your CI/CD Pipeline',
    description: 'Set up automated database migration linting in GitHub Actions, GitLab CI, and other CI/CD systems to catch dangerous schema changes before they reach production.',
    date: '2026-02-24',
    readingTime: '10 min read',
    keywords: ['database migration ci cd', 'database migration github actions', 'migration linting ci', 'postgresql ci cd'],
  },
  {
    slug: 'postgresql-not-null-constraint-safely',
    title: 'Adding NOT NULL Constraints to Existing PostgreSQL Columns Safely',
    description: 'The CHECK constraint NOT VALID + VALIDATE pattern for adding NOT NULL without locking your table. Includes version-specific advice for PG 11 and below vs PG 12+.',
    date: '2026-02-24',
    readingTime: '9 min read',
    keywords: ['postgresql add not null constraint', 'postgresql not null safely', 'check constraint not valid', 'alter column set not null'],
  },
  {
    slug: 'flyway-vs-liquibase-postgresql',
    title: 'Flyway vs Liquibase for PostgreSQL: An Honest Comparison',
    description: 'A practical comparison of Flyway and Liquibase for PostgreSQL migrations: features, syntax, rollbacks, team workflows, and where each tool falls short.',
    date: '2026-02-24',
    readingTime: '13 min read',
    keywords: ['flyway vs liquibase postgresql', 'flyway vs liquibase', 'postgresql migration tool', 'database migration framework'],
  },
];
