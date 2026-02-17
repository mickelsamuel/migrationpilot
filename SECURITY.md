# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in MigrationPilot, please report it responsibly:

**Email**: mickelsamuel.b@gmail.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to respond within 48 hours and will work with you to resolve the issue before public disclosure.

## Security Properties

### Read-Only Analysis
MigrationPilot is a **read-only analysis tool**. It never executes DDL or modifies any database. Production context queries (Pro tier) only read from `pg_catalog` system views (`pg_stat_user_tables`, `pg_stat_statements`, `pg_stat_activity`, `pg_class`).

### No User Data Access
Production context queries never read user table data. All queries target PostgreSQL system catalog tables only.

### Parameterized Queries
All database queries use parameterized statements (`$1`, `$2`) to prevent SQL injection.

### License Validation
License keys are validated client-side using Ed25519 asymmetric signature verification. The public key is embedded in the CLI; the private signing key is server-only. No telemetry or phone-home by default.

### Webhook Verification
Stripe webhook signatures are verified using Stripe's official `constructEvent` method before processing any payment events.

### No Secrets in Output
CLI output, PR comments, SARIF reports, and JSON output never include database credentials, license keys, or other secrets.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | Yes                |
| < 1.0   | No                 |

## Dependencies

We regularly audit dependencies with `pnpm audit` and keep packages up to date. The project uses a minimal dependency tree focused on well-maintained packages.
