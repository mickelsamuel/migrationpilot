# The lock-queue lab

A measured answer to the question the whole `SET NOT NULL` rule rests on: *how bad is it, actually?*

Two paths to the same logical schema change, same workload, same hardware, fresh database each
time. Figures below are run 1; run 2 repeated it and is in `traces/run2`.

| | unsafe path | safe path |
|---|---|---|
| time under `ACCESS EXCLUSIVE` | **2,190.9 ms** | **3.2 ms** (2.04 + 0.50 + 0.66) |
| peak queue depth | **20 of 20 connections** | **0** |
| time with anything queued | **2.15 s** | **0 s** |
| latency p50 | 0.290 ms | 0.300 ms |
| latency p95 | **1,310 ms** | 0.47 ms |
| latency p99 | **2,028 ms** | 0.57 ms |
| worst single query | **2,190 ms** | 1.48 ms |

Both migrations landed. Every run queries `pg_attribute` and `pg_constraint` afterwards and writes
the answer to `final-state.txt`; `attnotnull` is true on `users.email` in all of them. A trace of a
migration that silently did nothing would look identical on the safe side, so this is worth
checking rather than assuming.

The safe path still read all 50 million rows. It just did the reading under a lock that does not
conflict with `SELECT` or `UPDATE`, so nothing queued behind it — `p50` during the 1.75-second
validation scan is 0.27 ms, indistinguishable from idle.

## Reproducing it

Needs Docker and about six minutes. Nothing is written to disk: `PGDATA` is a tmpfs, and the
container is removed on exit.

```bash
cd labs/lock-queue
./run-lab.sh --rows 50000000 --duration 18 --ddl-at 4 --gap 2 \
             --sample-ms 50 --reporter off --tmpfs-gb 16 --run-id run1

node distill.mjs --run run1 --bucket-ms 100   # -> site/src/data/lock-trace.json
node validate.mjs                             # schema + sanity gate
```

`--tmpfs-gb 16` needs 16 GB of RAM available to the Docker VM. On a smaller machine, drop the row
count: `--rows 10000000 --tmpfs-gb 4` reproduces the same shape with a shorter stall.

Every raw artifact under `traces/` is gzipped. `distill.mjs` reads either form, so
`gunzip` is optional.

## What is in here

```
run-lab.sh              orchestrates everything: seed, workload, sampler, both DDL paths
sql/seed.sql            deterministic 50M-row users table (no random(), same bytes every time)
sql/sampler.sql         pg_locks x pg_stat_activity, one JSON line per sample
sql/unsafe.sql          ALTER TABLE ... SET NOT NULL
sql/safe.sql            ADD CONSTRAINT NOT VALID -> VALIDATE -> SET NOT NULL -> DROP
sql/reporter.sql        optional long analytical read (off for the published runs; see below)
pgbench/oltp_select.sql point SELECT by primary key
pgbench/oltp_update.sql point UPDATE by primary key
distill.mjs             raw artifacts -> site/src/data/lock-trace.json
validate.mjs            schema + sanity checks on the distilled file
traces/run1             the published run (distilled into lock-trace.json)
traces/run2             same command, run again, to show the shape reproduces
traces/run3-reporter    --reporter on, the slow-reader variant discussed below
```

`validate.mjs` is a gate, not a rubber stamp: point it at a distillation of `run3-reporter` and it
fails on `unsafe peak queue depth exceeds safe (unsafe=21 safe=21)`, because with a slow reader in
the mix the safe path queues just as deep. That is the check doing its job.

Per run and per path, `traces/` holds `locks.jsonl` (raw lock samples), `tx.log` (pgbench's
per-transaction log), `events.raw` (DDL phase boundaries with server timestamps), `pgbench.log`
(pgbench's own summary), and `final-state.txt` (proof the migration landed). `meta.txt` records
what produced the run.

## Environment

- **PostgreSQL 18.4** (Debian 18.4-1.pgdg13+1), official `postgres:18` image
- **50,000,000 rows**, 4,794 MB heap / 5,866 MB including the primary key
- **Intel Core i9-14900KF** (24 cores / 32 threads), 32 GB DDR5-6400, Kingston SNV3S2000G NVMe
  (the drive is incidental — `PGDATA` is on tmpfs)
- Windows 11 Home 26200, Docker Desktop 4.86.0, engine 29.7.2, WSL2 backend
- The container saw 12 CPUs and 28 GB of RAM; `shared_buffers` left at the default 128 MB
- MigrationPilot commit `8785fdc9b3eed3d9559328a5882de0128b38fbce`
- Captured 2026-08-12

## Method

**The workload is declared, not invented.** 20 connections through `pgbench`, 80% point `SELECT`
by primary key and 20% point `UPDATE` by primary key, rate-limited to a target of 2,000
transactions per second so the box stays busy rather than saturated. Fixed random seed. Both runs
get the identical workload, and pgbench logs every transaction's latency and completion time.
That is what makes the latency numbers measurements instead of estimates.

**One clock.** The workload generator, the lock sampler and the DDL session all run inside the
container. Sample timestamps and DDL phase boundaries both come from `clock_timestamp()` on the
server; pgbench stamps its log from the same kernel. Nothing needs correcting after the fact.

**The sampler** joins `pg_locks` to `pg_stat_activity` every 50 ms for every relation lock held or
awaited on `users` and its indexes, recording per backend: granted or waiting, lock mode, state,
wait event, `pg_blocking_pids()`, and how long the statement has been running. Raw output is one
JSON object per line, untouched.

**Fresh database per path.** Each path gets a new container and a fresh 50M-row seed, so neither
inherits the other's cache state or bloat.

### Two aggregation choices worth knowing about

`distill.mjs` reduces the raw samples to 100 ms buckets. Two decisions there change what the
picture looks like, so both are stated rather than buried.

**Latency is attributed to every bucket a transaction was in flight during, at its full latency.**
The obvious alternative — bucket each transaction at the moment it completed — draws a flat,
healthy-looking line straight through the outage and then one tall spike after it, because nothing
completes while the queue is stalled. That is arithmetically true and completely misleading. A
client blocked for two seconds was having a bad time for two seconds, not at the instant it was
finally answered.

**Queue depth is the peak within each bucket, not the mean.** A queue that forms and drains inside
100 ms still happened.

## Results

Run 1 and run 2 are the same command run twice. Numbers move; the shape does not.

| | unsafe run 1 | unsafe run 2 | safe run 1 | safe run 2 |
|---|---:|---:|---:|---:|
| total `ACCESS EXCLUSIVE` | 2,190.9 ms | 2,469.7 ms | 3.20 ms | 2.48 ms |
| scan under a blocking lock | 2,190.9 ms | 2,469.7 ms | — | — |
| scan under a non-blocking lock | — | — | 1,748.9 ms | 1,715.2 ms |
| peak queue depth | 20 | 20 | 0 | 0 |
| time with anything queued | 2.15 s | 2.50 s | 0 s | 0 s |
| p50 | 0.290 ms | 0.298 ms | 0.300 ms | 0.287 ms |
| p95 | 1,310 ms | 1,581 ms | 0.47 ms | 0.41 ms |
| p99 | 2,028 ms | 2,302 ms | 0.57 ms | 0.49 ms |
| worst query | 2,190 ms | 2,468 ms | 1.48 ms | 1.59 ms |

The unsafe scan varied by 13% between runs and the validation scan by 2%. Peak queue depth was 20
both times on the unsafe path and 0 both times on the safe path. `site/src/data/lock-trace.json`
is distilled from run 1.

### The unsafe path

`ALTER TABLE users ALTER COLUMN email SET NOT NULL` held `ACCESS EXCLUSIVE` for 2,190.9 ms while
it scanned 50 million rows. Within one 50 ms sample of the lock being taken, all 20 connections
were waiting — 14 on `AccessShareLock` (the reads) and 6 on `RowExclusiveLock` (the writes),
which is the workload's 80/20 mix showing up in the lock table. The queue stayed at 20 until the
scan finished.

Note what the queue is made of. `AccessShareLock` requests do not conflict with each other; those
14 `SELECT`s could all have run concurrently. They are queued because PostgreSQL grants locks in
order, and an `ACCESS EXCLUSIVE` request sits in front of them. That is the mechanism the site
calls the lock queue, and it is why "it's only a metadata change" is the wrong instinct.

### The safe path

Four statements, three of them metadata-only:

```
    2.039 ms  ACCESS EXCLUSIVE        ADD CONSTRAINT users_email_nn CHECK (email IS NOT NULL) NOT VALID
1,748.863 ms  SHARE UPDATE EXCLUSIVE  VALIDATE CONSTRAINT users_email_nn
    0.500 ms  ACCESS EXCLUSIVE        ALTER COLUMN email SET NOT NULL
    0.663 ms  ACCESS EXCLUSIVE        DROP CONSTRAINT users_email_nn
```

The expensive step is still expensive — validation read all 50 million rows and took 1.75 seconds.
It just held `SHARE UPDATE EXCLUSIVE`, which does not conflict with `ACCESS SHARE` or
`ROW EXCLUSIVE`. Throughout those 1.75 seconds the sampler recorded one backend running and zero
waiting, and p50 latency sat at 0.27–0.34 ms, the same as before the migration started.

Then `SET NOT NULL` took 0.5 ms instead of 2,190 ms, because the now-valid `CHECK` proves no NULL
can exist and the scan is skipped.

### What we could not measure

The brief `ACCESS EXCLUSIVE` steps on the safe path are real, and the honest finding is that they
are close to invisible at this resolution.

Peak queue depth on the safe path is 0 for the entire run — a 2 ms lock at 2,000 transactions per
second blocks a handful of queries for about 2 ms, and a 50 ms sampler will almost never catch it.
The only trace they leave is in the latency signal: the 100 ms bucket containing the
`ADD CONSTRAINT` step has a worst-case latency of 1.29 ms against a 0.60 ms median, and the 0.50 ms
and 0.66 ms steps do not rise above noise at all. The single worst bucket in the whole safe run is
the very first one (1.48 ms), which is connection warm-up, not a lock.

So: measurable, barely, for the longest of the three. Not measurable for the other two. Anyone
drawing three dramatic spikes on the safe timeline would be drawing something we did not observe.

## Honest notes

**These numbers are a floor, not a ceiling.** `PGDATA` is on a tmpfs, so the table is in RAM and
the scan runs at memory speed. On real storage the same scan takes longer, the `ACCESS EXCLUSIVE`
lock is held longer, and the queue is worse. The safe path's validation scan gets slower too, but
it is not blocking anything while it runs, so slower storage widens the gap rather than narrowing
it.

**Table size is the dial.** The unsafe scan is close to linear in table bytes. Measured idle on
this machine, `postgres:18`, same schema, one measurement each against a warm cache on disk-backed
storage rather than the tmpfs the published runs use:

| rows | heap | `SET NOT NULL` (unsafe) | `VALIDATE CONSTRAINT` (safe) |
|---:|---:|---:|---:|
| 5,000,000 | 465 MB | 248.9 ms | 155.6 ms |
| 50,000,000 | 4,794 MB | 2,014.3 ms | 1,427.9 ms |

Under live load the same 50M-row `SET NOT NULL` took 2,190.9 ms rather than 2,014.3 ms — the scan
competes with the workload it is blocking. Scale to your own table: a 500 GB table is not going to
be 2 seconds.

**Run-to-run variance.** Latency percentiles move by a few percent between runs; the DDL durations
move by more, because a table scan on a busy box is at the mercy of scheduling. What does not move
is the shape: sustained full-depth queue on the unsafe path, no queue at all on the safe path.
Two runs is enough to show the shape reproduces and not enough to put error bars on any single
number. Do not quote a millisecond figure from here as though it were a constant.

**Peak queue depth is capped by the client count.** It reads 20 because there are 20 connections
and all of them were blocked. A real application with a 100-connection pool would show 100, then
start refusing connections. The interesting fact is not the number 20, it is that the number is
*everything*.

**The reporting client is off in the published runs**, and turning it on changes the conclusion
enough that it gets its own section below.

**What is not modelled.** No connection pooler, no replicas, no `lock_timeout`, no application
retry behaviour, no other tables. The lab isolates one table and one statement on purpose.

## Add one slow reader and the safe path blocks too

This is the result that most deserves to be read carefully, because it is the one that could be
used to overclaim.

`--reporter on` adds a single extra connection running a periodic analytical read over the same
table — a dashboard aggregate, the kind of query every production database has. Nothing else
changes. In `traces/run3-reporter` those reads took between 2.3 and 6.9 seconds each.

| | unsafe, no reader | unsafe, one reader | safe, no reader | safe, one reader |
|---|---:|---:|---:|---:|
| total `ACCESS EXCLUSIVE` | 2,190.9 ms | **5,254.9 ms** | 3.20 ms | **4,484.2 ms** |
| peak queue depth | 20 | 21 | 0 | **21** |
| time with anything queued | 2.15 s | 5.25 s | 0 s | **4.45 s** |
| p99 | 2,028 ms | 5,079 ms | 0.57 ms | **2,288 ms** |
| worst query | 2,190 ms | 5,253 ms | 1.48 ms | **2,455 ms** |

The safe path's four statements, with a reader present:

```
1,191.8 ms  ACCESS EXCLUSIVE        ADD CONSTRAINT ... NOT VALID
1,735.0 ms  SHARE UPDATE EXCLUSIVE  VALIDATE CONSTRAINT
2,456.2 ms  ACCESS EXCLUSIVE        ALTER COLUMN email SET NOT NULL
  836.3 ms  ACCESS EXCLUSIVE        DROP CONSTRAINT
```

Compare those to 2.04 / 1,748.9 / 0.50 / 0.66 ms without the reader. The validation step is
unchanged — 1,735 ms against 1,749 ms — because `SHARE UPDATE EXCLUSIVE` genuinely does not care
what else is reading the table. Everything else got thousands of times slower.

The metadata steps did not become expensive. They became *stuck*. Each one still does about a
millisecond of work, but it cannot start until every transaction already touching the table has
finished, and while it waits at the front of the queue, every new query piles up behind it. The
lock is brief; acquiring it is not.

Two things follow, and the second one matters more.

**The safe path is still better.** Worst query 2,455 ms against 5,253 ms, and the part that does
the actual work — reading 50 million rows — never blocks anything at all. The unsafe path pays the
reader wait *and* the scan, one after the other, with the whole queue behind it the entire time.

**But "use the safe pattern" is not sufficient on its own.** Anyone reading the first table on this
page and concluding that the choreography makes schema changes free is reading it wrong. It makes
the *scan* free. It does nothing about lock acquisition, which is why every `ACCESS EXCLUSIVE`
statement in the handbook's safe SQL is preceded by `SET lock_timeout` — so the statement gives up
and gets retried instead of holding the door shut. This lab deliberately sets no `lock_timeout`,
which is why you can see the full cost here.

## PostgreSQL 18 notes

Two things worth knowing, both verified here against 18.4.

**`SET NOT NULL` still scans on 18.** PostgreSQL 18 stores `NOT NULL` constraints in
`pg_constraint` and added the ability to mark them `NOT VALID`, which might suggest the naive form
got cheaper. It did not: the unsafe path above *is* PostgreSQL 18, and it scanned all 50 million
rows under `ACCESS EXCLUSIVE`. The rule still applies on the newest release.

**The `CHECK` scaffolding still works on 18, and there is now a shorter route.** Measured idle at
5M rows on 18.4:

```
1.136 ms   ALTER TABLE users ADD CONSTRAINT users_email_nn18 NOT NULL email NOT VALID
229.063 ms ALTER TABLE users VALIDATE CONSTRAINT users_email_nn18
```

Two statements instead of four, no throwaway `CHECK` constraint to remember to drop, and the
column ends up genuinely `NOT NULL`. The published safe path uses the `CHECK` choreography because
that is the pattern that works on every supported version (12 through 18); on 18-only estates the
native form above is better. Handbook entries
[MPH-004](../../docs/handbook/04-check-then-not-null.md) and
[MPH-005](../../docs/handbook/05-pg18-not-null-not-valid.md) cover both, including the syntax that
looks right and does not parse.

## Things that will bite you if you rebuild this

Three real failures hit while building this lab, all of them interesting.

**`docker exec` processes are children of the postmaster.** In the official image PID 1 *is*
PostgreSQL, so anything started with `docker exec` gets reparented to it. Send one of those a
signal — `pkill` the sampler, say — and the postmaster logs `untracked child process ... was
terminated by signal 15`, decides a backend crashed, and reinitialises the entire cluster
mid-measurement. The fix is `docker run --init`, so tini holds PID 1 and the workload processes
never touch the postmaster. The lab also never signals anything now: the sampler and the reporter
are sized to run out of iterations on their own.

**`pg_isready` lies during startup.** The entrypoint runs a temporary server with
`listen_addresses=''` so init scripts can use the Unix socket, then shuts it down and starts the
real one. Polling the socket returns "accepting connections" against a server that is about to
disappear, and the seed races the restart. Poll TCP instead — the temporary server does not listen
on it.

**`df` inside a container tells you about the disk image, not the disk.** It reported 866 GB free
on a host that had 43 GB. The first attempt at this lab filled the host drive and took the Docker
daemon down with it. `PGDATA` on tmpfs sidesteps the whole problem; the host-side check in
`require_disk()` is there for anyone pointing this at a real volume.

On Windows, `run-lab.sh` sets `MSYS_NO_PATHCONV` before touching Docker. Without it, Git Bash
rewrites the container path `/lab/sql/seed.sql` into `C:/Program Files/Git/lab/sql/seed.sql`.
