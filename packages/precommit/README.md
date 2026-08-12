# migrationpilot-precommit

Launcher package for the [MigrationPilot](https://migrationpilot.dev) hook for the
[pre-commit](https://pre-commit.com) framework. It has no logic of its own — it
resolves the `migrationpilot` CLI and runs its `precommit` subcommand against the
files pre-commit passes in.

You don't install this directly. Add the hook to `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/mickelsamuel/migrationpilot
    rev: v1.6.0
    hooks:
      - id: migrationpilot
```

Then `pre-commit install`. Every commit that touches a `.sql` file gets analyzed,
and the commit is blocked if a migration has a critical violation.

## Why this package exists

`language: node` hooks are installed by running
`npm install -g git+file://<hook repo>` in a throwaway node environment.
MigrationPilot doesn't commit its build output, and npm runs a git dependency's
`prepare` script in a staging clone that has **no `node_modules`** — so the CLI
can't be built during hook install. The hook instead names this package in
`additional_dependencies`, which npm resolves from the registry with the CLI
already built.

The name matters. A dependency called `migrationpilot` would collide with the
hook repo's own package name and lose to it, leaving no working bin. Publishing
the launcher under a separate name sidesteps that, the same way
[`migrationpilot-mcp`](../mcp) does for the MCP server.

## Configuration

Pass CLI flags through `args`:

```yaml
repos:
  - repo: https://github.com/mickelsamuel/migrationpilot
    rev: v1.6.0
    hooks:
      - id: migrationpilot
        args: [--fail-on, warning, --pg-version, '16']
```

`.migrationpilotrc.yml` in the repo root is picked up automatically. Clean files
print nothing; only files with violations are reported.

## Release

This package is versioned independently of the CLI. When its version changes,
update the pin in the repo root's `.pre-commit-hooks.yaml` —
`tests/precommit-hook.test.ts` fails the build if they drift apart.

## License

MIT
