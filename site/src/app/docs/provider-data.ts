export interface ProviderGuide {
  slug: string;
  name: string;
  description: string;
  connectionNote: string;
  tips: string[];
  setup: string;
}

export const providers: ProviderGuide[] = [
  {
    slug: 'aws-rds',
    name: 'Amazon RDS for PostgreSQL',
    description: 'Amazon RDS manages PostgreSQL instances with automated backups, failover, and scaling.',
    connectionNote: 'Use the RDS endpoint as your database URL. Ensure your security group allows connections from your CI environment.',
    tips: [
      'RDS enforces statement_timeout at the parameter group level — verify your migration timeout settings',
      'Multi-AZ deployments add replication lag to DDL operations',
      'Use RDS Proxy for connection pooling in high-traffic environments',
      'RDS Performance Insights can help identify high-traffic tables for MP013/MP014 thresholds',
    ],
    setup: `# Connection string format
postgresql://user:password@mydb.abcdef.us-east-1.rds.amazonaws.com:5432/mydb

# Analyze with production context (Pro)
migrationpilot analyze migration.sql \\
  --database-url "postgresql://user:pass@mydb.cluster-abc.us-east-1.rds.amazonaws.com/mydb" \\
  --license-key $MIGRATIONPILOT_LICENSE`,
  },
  {
    slug: 'gcp-cloud-sql',
    name: 'Google Cloud SQL',
    description: 'Cloud SQL provides fully managed PostgreSQL instances on Google Cloud.',
    connectionNote: 'Use Cloud SQL Auth Proxy or direct IP connection. Enable the Cloud SQL Admin API.',
    tips: [
      'Cloud SQL supports all PostgreSQL versions from 12 to 16',
      'Use database flags to set statement_timeout at the instance level',
      'High availability instances use synchronous replication — DDL operations may be slower',
      'Use Cloud SQL Insights to identify table access patterns',
    ],
    setup: `# Using Cloud SQL Proxy
cloud-sql-proxy myproject:us-central1:mydb &

# Then connect via localhost
migrationpilot analyze migration.sql \\
  --database-url "postgresql://user:pass@localhost:5432/mydb"

# Or use direct IP
migrationpilot analyze migration.sql \\
  --database-url "postgresql://user:pass@34.123.45.67/mydb"`,
  },
  {
    slug: 'neon',
    name: 'Neon',
    description: 'Neon is serverless PostgreSQL with branching, autoscaling, and instant provisioning.',
    connectionNote: 'Use the connection string from your Neon dashboard. Neon supports connection pooling via PgBouncer.',
    tips: [
      'Neon branches let you test migrations on a copy of production data before deploying',
      'Use the pooled connection string for analysis to avoid connection limits',
      'Neon autoscaler may affect table size estimates — use a branch of production for accurate context',
      'Neon supports PostgreSQL 14-17',
    ],
    setup: `# Connection string from Neon dashboard
migrationpilot analyze migration.sql \\
  --database-url "postgresql://user:pass@ep-abc-123.us-east-2.aws.neon.tech/mydb?sslmode=require"

# Test on a Neon branch first
neonctl branches create --name migration-test
migrationpilot analyze migration.sql \\
  --database-url "postgresql://user:pass@ep-branch-456.us-east-2.aws.neon.tech/mydb"`,
  },
  {
    slug: 'supabase',
    name: 'Supabase',
    description: 'Supabase provides a PostgreSQL database with auth, storage, and realtime built in.',
    connectionNote: 'Use the direct connection string from your Supabase project settings (not the pooled/API URL).',
    tips: [
      'Supabase uses PostgreSQL 15 by default — set pgVersion: 15 in your config',
      'The auth and storage schemas contain Supabase internals — only analyze your own schemas',
      'Use supabase db diff to generate migration SQL from schema changes',
      'Supabase CLI migrations are stored in supabase/migrations/',
    ],
    setup: `# Get connection string from Supabase dashboard > Settings > Database
migrationpilot analyze migration.sql \\
  --database-url "postgresql://postgres:[PASSWORD]@db.abcdefghijk.supabase.co:5432/postgres"

# Using Supabase CLI migrations
npx migrationpilot check supabase/migrations/`,
  },
  {
    slug: 'railway',
    name: 'Railway',
    description: 'Railway provides instant PostgreSQL databases with automatic backups and easy deployment.',
    connectionNote: 'Use the DATABASE_URL from your Railway service variables.',
    tips: [
      'Railway provisions PostgreSQL 16 by default',
      'Connection strings are available in the Railway dashboard under Variables',
      'Railway databases have generous connection limits but watch for pooler settings',
    ],
    setup: `# Get DATABASE_URL from Railway dashboard
migrationpilot analyze migration.sql \\
  --database-url "$DATABASE_URL"

# Or use the explicit connection string
migrationpilot analyze migration.sql \\
  --database-url "postgresql://postgres:pass@roundhouse.proxy.rlwy.net:12345/railway"`,
  },
  {
    slug: 'crunchy-data',
    name: 'Crunchy Data (PGO)',
    description: 'Crunchy Data provides enterprise PostgreSQL via PGO (Postgres Operator) on Kubernetes.',
    connectionNote: 'Connect via the PGO service endpoint or port-forward from your Kubernetes cluster.',
    tips: [
      'PGO supports PostgreSQL 13-17 with full extension support',
      'Use pgBackRest point-in-time recovery to test migrations safely',
      'Crunchy Data Bridge provides managed PostgreSQL with enterprise support',
      'PGO connection pooling uses PgBouncer — use the direct service for schema queries',
    ],
    setup: `# Port-forward to your PGO instance
kubectl port-forward svc/hippo-primary 5432:5432 -n postgres

# Analyze with production context
migrationpilot analyze migration.sql \\
  --database-url "postgresql://user:pass@localhost:5432/mydb"`,
  },
  {
    slug: 'aiven',
    name: 'Aiven for PostgreSQL',
    description: 'Aiven provides managed PostgreSQL with multi-cloud support and advanced monitoring.',
    connectionNote: 'Use the Service URI from the Aiven Console overview page. SSL is required.',
    tips: [
      'Aiven supports PostgreSQL 13-17 across AWS, GCP, and Azure',
      'Use Aiven\'s query statistics to identify high-traffic tables',
      'Connection pooling is available via PgBouncer — use the direct URI for schema queries',
      'Aiven enforces SSL by default — include sslmode=require in your connection string',
    ],
    setup: `# Connection string from Aiven Console
migrationpilot analyze migration.sql \\
  --database-url "postgresql://avnadmin:pass@pg-abc-project.aivencloud.com:12345/defaultdb?sslmode=require"`,
  },
  {
    slug: 'cockroachdb',
    name: 'CockroachDB',
    description: 'CockroachDB is a distributed SQL database with PostgreSQL wire compatibility.',
    connectionNote: 'CockroachDB supports the PostgreSQL wire protocol. Some DDL behavior differs from PostgreSQL.',
    tips: [
      'CockroachDB handles schema changes differently — online schema changes are the default',
      'Lock-related rules (MP001, MP004) may not apply since CockroachDB uses a different locking model',
      'Set pgVersion to match your CockroachDB PostgreSQL compatibility level',
      'Some PostgreSQL-specific features (e.g., CONCURRENTLY) may not be available',
    ],
    setup: `# CockroachDB Serverless
migrationpilot analyze migration.sql \\
  --database-url "postgresql://user:pass@free-tier.gcp-us-central1.cockroachlabs.cloud:26257/mydb"

# Consider excluding lock-related rules
migrationpilot analyze migration.sql \\
  --database-url "$COCKROACH_URL" \\
  --exclude MP001,MP004,MP006`,
  },
  {
    slug: 'digitalocean',
    name: 'DigitalOcean Managed Databases',
    description: 'DigitalOcean provides managed PostgreSQL with automated failover, backups, and scaling.',
    connectionNote: 'Use the connection string from your DigitalOcean database cluster dashboard. SSL is required.',
    tips: [
      'DigitalOcean supports PostgreSQL 13-16',
      'Connection pooling is available via PgBouncer in the cluster settings',
      'Use the private network URI for CI runners deployed on DigitalOcean',
      'Trusted sources can restrict database access to specific IP addresses or droplets',
    ],
    setup: `# Connection string from DigitalOcean dashboard
migrationpilot analyze migration.sql \\
  --database-url "postgresql://doadmin:pass@db-pg-nyc1-12345-do-user.b.db.ondigitalocean.com:25060/defaultdb?sslmode=require"`,
  },
];
