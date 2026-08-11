# bench/ — the agent-migration safety benchmark

A labelled corpus of PostgreSQL migrations and a runner that scores MigrationPilot,
Squawk and pgfence against it. Results live in [RESULTS.md](RESULTS.md), regenerated
by the runner; nothing in that file is written by hand except the clearly marked
defects section.

```bash
node bench/run.mjs
```

Zero dependencies beyond Node 22+. The competitors are fetched with `npx` at pinned
versions, so the first run needs network access and later ones do not.

```bash
node bench/run.mjs --dump-rules   # list every rule id each tool emitted, with the files
node bench/run.mjs --tools=mp     # one tool only (mp, squawk, pgfence)
node bench/run.mjs --latest       # ignore the pins, use @latest
node bench/run.mjs --no-timing    # skip the throughput phase
```

## Layout

| Path | What it is |
|---|---|
| `corpus/unsafe/` | One primary named hazard per file |
| `corpus/safe/` | The handbook's own safe SQL. False-positive bait |
| `corpus/context/` | Real hazards that are harmless at the stated scale. Unscored |
| `corpus/agent-flavored/` | Multi-statement migrations in the register coding agents emit |
| `run.mjs` | Runner, scorer and report generator |
| `rule-map.json` | Every emitted rule id, classified, with the reasoning |
| `RESULTS.md` | Generated report |
| `results.json` | Generated raw findings, every rule id and message per file |

## Corpus conventions

Every file opens with a YAML header inside a SQL block comment:

```sql
/* ---
id: u01
category: unsafe
verdict: dangerous
hazards: [non-concurrent-index]
handbook: MPH-001
description: ...
--- */
```

- `id` is stable and is what the tables key on.
- `verdict` is `dangerous`, `safe`, or `context-dependent`.
- `hazards` lists the hazard slugs the file asserts; the first is the primary one and
  is what strict detection is measured against.
- `handbook` cites the entry in `docs/handbook/` the hazard comes from.

The runner validates all of this on load and refuses to run on a header that is
missing, malformed, or internally inconsistent (a `safe` file listing hazards, a
`dangerous` file listing none).

The header is a block comment, and a leading comment turns out to change what some
linters report. So the scored run uses copies with the header stripped, written to
`bench/.stripped/` (gitignored, rewritten every run), and the originals are run
separately as a control. The difference is published as its own section.

## Where the corpus came from

Every hazard is drawn from [the handbook](../docs/handbook/README.md) — twenty entries,
each pinned to the PostgreSQL manual with a runnable lab. The corpus was written from
those entries, not from MigrationPilot's rule list, which is why hazards MigrationPilot
does not catch are in it. Those stay in, and they are reported as our misses.

Two conventions the safe files follow, both taken from the handbook rather than from
what makes any tool look good:

- **Concurrent index builds drop first,** with one exception. `DROP INDEX CONCURRENTLY
  IF EXISTS` before `CREATE INDEX CONCURRENTLY`, never `CREATE ... IF NOT EXISTS`,
  because MPH-012 is explicit that `IF NOT EXISTS` reports success over an index left
  invalid by a failed build. The exception is `s06`, where the index is adopted by a
  `UNIQUE` constraint: `DROP INDEX` is then rejected outright, and MPH-012's retry path
  for a constraint-backed index is `REINDEX INDEX CONCURRENTLY` instead. An earlier
  draft applied the convention blindly and shipped broken SQL; MP097 caught it.
- **`NOT VALID` and `VALIDATE CONSTRAINT` are in separate transactions,** written with
  explicit `BEGIN` / `COMMIT`. MPH-004 says validating inside the transaction that
  created the constraint holds one lock across both and buys nothing.

Both were applied after a first run showed the safe files were not actually following
the handbook they claim to represent. That is a corpus fix, not a tuning pass, and it
is recorded here so you can check the diff.

## Adding a case

1. Write the `.sql` file in the right category directory with a complete header.
2. If it asserts a hazard slug that does not exist yet, add it to `hazards` in
   `rule-map.json`.
3. Run `node bench/run.mjs --dump-rules` and classify any rule id that fires and is not
   already in the map. Unmapped rules are scored as hazards and are listed in the report,
   so nothing hides, but leaving them unclassified is sloppy.
4. Run `node bench/run.mjs` and commit the regenerated `RESULTS.md` and `results.json`
   alongside the new case.

A case that MigrationPilot fails is worth more than one it passes.
