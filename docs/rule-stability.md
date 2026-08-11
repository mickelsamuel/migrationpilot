# Rule Stability

MigrationPilot runs in CI, which means a version bump can turn a green build red without anyone touching a migration. This page says which upgrades can do that, so you can decide how tightly to pin.

The thing being versioned is the **exit code under the default configuration**. Everything below protects it.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Nothing found at or above your `failOn` threshold |
| `1` | Warnings found, and `failOn` is `warning` |
| `2` | At least one `critical` violation |

`failOn` defaults to `critical`, so out of the box warnings are informational and only criticals fail the build. Setting `failOn: warning` adds the `1` case; it doesn't change the `2` case. `failOn: never` always exits `0`.

Severity has exactly two values, `critical` and `warning`. There is no third level, and adding one would be a major.

## What each kind of change costs

### Major

- A new rule that reports `critical`. Every rule is on by default, so a new critical rule fails builds that passed yesterday.
- A rule's severity raised from `warning` to `critical`.
- An existing `critical` rule broadened to fire on SQL it used to accept.
- A new exit code, or an existing code taking on a meaning it didn't have.
- A changed default: `failOn`, the default PostgreSQL version, or the contents of a built-in preset.
- A rule ID removed, or pointed at a different check.

### Minor

- A new rule that reports `warning`. Under the default `failOn` it shows up in output and leaves the exit code alone. If you run `failOn: warning`, read the release notes — for you a new warning rule can turn `0` into `1`. That's the trade you made by opting into the stricter threshold.
- A rule's severity lowered from `critical` to `warning`. This can't break your build. It can quietly stop failing one, so every downgrade gets its own changelog entry under **Weakened** — nothing in CI will tell you it happened.
- An existing `warning` rule broadened.
- New commands, flags, output formats, framework adapters, presets.

### Patch

- A false positive fixed. This can turn a red build green, which is the whole point of fixing it.
- Message text, docs links, output formatting, performance.
- Parser and dependency updates that don't change which violations get reported.

## How a rule becomes critical

New checks don't arrive as build-breakers. A rule lands at `warning` in a minor, so you see it in output and get to decide what to do about it, then gets promoted to `critical` in the next major. Both steps show up in the changelog.

Nothing stops you from moving faster or slower than that. To fail on a new rule before the promotion lands:

```yaml
rules:
  MP042:
    severity: critical
```

To keep it a warning after the promotion, write the opposite. Explicit `rules` entries are applied after the rule's built-in severity, so your config wins across upgrades in both directions.

## Rule IDs are permanent

`MP041` means one thing forever. Retired rules keep their ID and it's never reissued, so a config that disables `MP037` can't silently start disabling something else two majors from now. Inline suppressions are safe for the same reason:

```sql
-- migrationpilot-disable MP001
CREATE INDEX idx_users_email ON users (email);
```

## Holding still

Pin to taste:

- `~1.5.0` — patches only. Bug fixes, no new rules.
- `^1.5.0` — minors. New warning rules, nothing that fails your build by default.
- `1.5.0` — nothing. Use it when your pipeline can't tolerate a surprise, and upgrade deliberately.

The GitHub Action tag `mickelsamuel/migrationpilot@v1` floats across the whole 1.x line, so it behaves like `^`. Pin to a release tag or a commit SHA to freeze it.

Config is the other lever, and it outranks the version. `failOn: never` never fails, whatever the rules say. Rules you've disabled stay disabled, and severities you've set stay set.

## Experimental surfaces

Anything documented as experimental sits outside this policy — `mutation-test` says so at the top of its page. Operators, output, and exit codes there can change in a minor.
