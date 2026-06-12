# migrationpilot-mcp

MCP server launcher for [MigrationPilot](https://github.com/mickelsamuel/migrationpilot) — catch dangerous PostgreSQL migrations before they hit production, straight from your AI assistant.

This is a thin launcher. The server itself ships inside the main [`migrationpilot`](https://www.npmjs.com/package/migrationpilot) package; this package just makes the documented `npx migrationpilot-mcp` command resolve to a real package on npm.

## Usage

Add this to your MCP client config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "migrationpilot": {
      "command": "npx",
      "args": ["migrationpilot-mcp"]
    }
  }
}
```

## Tools

The server exposes 4 tools over stdio:

- `analyze_migration` — analyze SQL for safety issues (violations, risk level, lock analysis)
- `suggest_fix` — get a safe alternative for a specific rule violation
- `explain_lock` — explain what lock a DDL statement acquires
- `list_rules` — list the available safety rules

## More

Full docs, the CLI, the GitHub Action, and the rule reference live in the main repo: <https://github.com/mickelsamuel/migrationpilot>.

MIT licensed.
