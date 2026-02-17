# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in MigrationPilot, please report it through one of these channels:

1. **GitHub Private Vulnerability Reporting** (preferred): Go to our [Security tab](https://github.com/mickelsamuel/migrationpilot/security/advisories/new) and click "Report a vulnerability"
2. **Email**: security@migrationpilot.dev or mickelsamuel.b@gmail.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

**Response timeline:**
- Acknowledgment within 48 hours
- Fix within 90 days for confirmed vulnerabilities
- Coordinated disclosure — we'll work with you on timing

## Scope

**In scope**: CLI tool, GitHub Action, website (migrationpilot.dev), API endpoints, license validation, billing system

**Out of scope**: Social engineering, DDoS attacks, third-party services (Stripe, Vercel, GitHub, Resend)

## Security Properties

### Read-Only Analysis
MigrationPilot is a **read-only analysis tool**. It never executes DDL or modifies any database. Production context queries (Pro tier) only read from `pg_catalog` system views (`pg_stat_user_tables`, `pg_stat_statements`, `pg_stat_activity`, `pg_class`).

### No User Data Access
Production context queries never read user table data. All queries target PostgreSQL system catalog tables only.

### Parameterized Queries
All database queries use parameterized statements (`$1`, `$2`) to prevent SQL injection.

### License Validation
License keys are validated client-side using Ed25519 asymmetric signature verification with versioned public keys. The private signing key is server-only. No telemetry or phone-home by default.

### Key Rotation
License keys support versioning (e.g., `MP-v1-PRO-20261231-<signature>`). Multiple public keys can be active simultaneously during rotation windows. If a private key is compromised:
1. A new key pair is generated and deployed to the server
2. The new public key is added to the CLI with a new version number
3. Existing licenses continue to validate until expiry
4. The compromised key version is removed after all affected licenses expire

### Webhook Verification
Stripe webhook signatures are verified using Stripe's official `constructEvent` method with constant-time comparison before processing any payment events.

### API Security
- All API endpoints enforce CORS origin restrictions (`migrationpilot.dev` only)
- Rate limiting on all billing endpoints
- Generic error messages — no internal details leaked to clients
- Email lookups return constant-time responses to prevent enumeration

### No Secrets in Output
CLI output, PR comments, SARIF reports, and JSON output never include database credentials, license keys, or other secrets.

### Supply Chain
- All GitHub Actions pinned to commit SHAs (not mutable tags)
- CI workflows scoped to minimum required permissions
- npm packages published with provenance attestation via OIDC trusted publishing
- Dependencies audited regularly; vulnerable transitive deps overridden

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | Yes                |
| < 1.0   | No                 |

## Dependencies

We regularly audit dependencies with `pnpm audit` and keep packages up to date. The project uses a minimal dependency tree focused on well-maintained packages. Vulnerable transitive dependencies are overridden via pnpm when upstream fixes are unavailable.
