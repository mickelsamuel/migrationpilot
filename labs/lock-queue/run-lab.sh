#!/usr/bin/env bash
# MigrationPilot lock-queue lab.
#
# Measures what an ACCESS EXCLUSIVE lock does to a live PostgreSQL workload, by
# running the same logical schema change two ways against two freshly seeded,
# identically configured databases:
#
#   unsafe   ALTER TABLE users ALTER COLUMN email SET NOT NULL
#   safe     ADD CONSTRAINT ... NOT VALID -> VALIDATE -> SET NOT NULL -> DROP
#
# Everything -- the workload, the sampler, the DDL -- runs inside the container,
# so every timestamp comes off one clock and no correction is needed.
#
# Usage: ./run-lab.sh [options]
#   --rows N          rows in users            (default 5000000)
#   --pg N            postgres major version   (default 18)
#   --clients N       pgbench client conns     (default 20)
#   --rate N          target TPS, all clients  (default 2000)
#   --duration N      seconds of workload      (default 24)
#   --ddl-at N        seconds before DDL fires (default 6)
#   --gap N           seconds between safe-path steps (default 2)
#   --sample-ms N     lock sampler interval    (default 50)
#   --reporter on|off periodic analytical read (default on)
#   --only PATH       unsafe | safe | both     (default both)
#   --run-id NAME     output subdirectory      (default run1)
#   --out DIR         artifact root            (default ./traces)
#   --tmpfs-gb N      size of the PGDATA tmpfs (default 16)
#   --keep            leave the container running afterwards

set -euo pipefail

# Git Bash / MSYS rewrites anything that looks like a Unix path before handing it
# to a native .exe, which turns the container-side path /lab/sql/seed.sql into
# C:/Program Files/Git/lab/sql/seed.sql. Turn that off, and convert host paths to
# Windows form explicitly where docker actually needs them.
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
    hostpath() { cygpath -w "$1"; }
    ;;
  *)
    hostpath() { printf '%s' "$1"; }
    ;;
esac

ROWS=5000000
PG=18
CLIENTS=20
RATE=2000
DURATION=24
DDL_AT=6
GAP=2
SAMPLE_MS=50
REPORTER=on
ONLY=both
RUN_ID=run1
LAB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$LAB_DIR/traces"
KEEP=0
SEED=42
TMPFS_GB=16

while [ $# -gt 0 ]; do
  case "$1" in
    --rows)      ROWS="$2"; shift 2 ;;
    --pg)        PG="$2"; shift 2 ;;
    --clients)   CLIENTS="$2"; shift 2 ;;
    --rate)      RATE="$2"; shift 2 ;;
    --duration)  DURATION="$2"; shift 2 ;;
    --ddl-at)    DDL_AT="$2"; shift 2 ;;
    --gap)       GAP="$2"; shift 2 ;;
    --sample-ms) SAMPLE_MS="$2"; shift 2 ;;
    --reporter)  REPORTER="$2"; shift 2 ;;
    --only)      ONLY="$2"; shift 2 ;;
    --run-id)    RUN_ID="$2"; shift 2 ;;
    --out)       OUT="$2"; shift 2 ;;
    --tmpfs-gb)  TMPFS_GB="$2"; shift 2 ;;
    --keep)      KEEP=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

CONTAINER=mp-lockqueue
DEST="$OUT/$RUN_ID"
mkdir -p "$DEST"

# psql's \watch takes an interval in seconds; the sampler count has to cover the
# whole run with headroom so it never stops early.
SAMPLE_INTERVAL=$(awk -v ms="$SAMPLE_MS" 'BEGIN{printf "%.3f", ms/1000}')
# Size both instruments to stop by themselves a beat after the workload does.
# Nothing gets signalled: sending a signal to a process inside the container is
# what took the cluster down before --init went on (see start_pg), so the sampler
# and the reporter simply run out of iterations and exit.
SAMPLE_COUNT=$(awk -v d="$DURATION" -v ms="$SAMPLE_MS" 'BEGIN{printf "%d", (d+1)*1000/ms}')
REPORT_COUNT=$(( (DURATION + 1) * 2 ))

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
q()   { docker exec -i "$CONTAINER" psql -U postgres -X -q "$@"; }

# Unused on the tmpfs path (below), kept for anyone pointing this lab at a
# disk-backed postgres: a seed this size can fill the host disk, which is how the
# docker VM died the first time this lab ran at 50M rows.
#
# Check the *host* filesystem, not the container's. On Docker Desktop `df /`
# inside a container reports the virtual size of the backing disk image (it read
# 866G free on a host that had 43G), so asking the container is worse than not
# checking at all.
require_disk() {
  local need_gb="$1" free_gb
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) free_gb=$(df -BG /c 2>/dev/null | tail -1 | awk '{print $4}' | tr -dc '0-9') ;;
    *)                    free_gb=$(df -BG /var/lib/docker 2>/dev/null || df -BG /; ) ;;
  esac
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) : ;;
    *) free_gb=$(printf '%s' "$free_gb" | tail -1 | awk '{print $4}' | tr -dc '0-9') ;;
  esac
  if [ -z "$free_gb" ]; then
    echo "  (could not read free disk space; continuing)" >&2
    return 0
  fi
  echo "  host disk free: ${free_gb}G (need ${need_gb}G)"
  if [ "$free_gb" -lt "$need_gb" ]; then
    echo "not enough free disk: ${free_gb}G available, ${need_gb}G needed" >&2; exit 1
  fi
}

# PGDATA lives on a tmpfs, for two reasons.
#
# Practical: a disk-backed run of this size grew the Docker VM's virtual disk by
# tens of gigabytes per seed and eventually took the daemon down with it. tmpfs
# costs nothing on disk and leaves nothing behind.
#
# Methodological: it takes storage latency out of the measurement, which biases
# *against* what this lab reports. The unsafe path's cost is a full table scan
# held under ACCESS EXCLUSIVE; on real storage that scan takes longer than it
# does here, so the queue lasts longer and the latency tail is worse. The
# numbers this lab produces are a floor, not a ceiling.
pgdata_mount() {
  # The official images moved PGDATA in 18, and the tmpfs has to shadow the
  # image's declared VOLUME -- otherwise docker creates an anonymous volume
  # underneath it and quietly writes to disk anyway.
  if [ "$PG" -ge 18 ] 2>/dev/null; then
    echo /var/lib/postgresql
  else
    echo /var/lib/postgresql/data
  fi
}

start_pg() {
  docker rm -fv "$CONTAINER" >/dev/null 2>&1 || true
  # --init matters more than it looks. Without it PID 1 in this image is the
  # postmaster, so every `docker exec` process gets reparented to it; postgres
  # then reports them as "untracked child process" and, if one is killed by a
  # signal, treats it as a backend crash and reinitialises the entire cluster
  # mid-run. tini as PID 1 keeps the workload processes away from the postmaster.
  docker run -d --name "$CONTAINER" --init \
    --mount "type=tmpfs,destination=$(pgdata_mount),tmpfs-size=${TMPFS_GB}000000000" \
    -e POSTGRES_PASSWORD=lab \
    postgres:"$PG" >/dev/null
  # Wait for the *real* server over TCP, not the socket.
  #
  # The official entrypoint runs a temporary server during initialisation with
  # listen_addresses='' so that init scripts can connect over the Unix socket.
  # `pg_isready` against that socket returns "accepting connections" while the
  # cluster is still initialising; the entrypoint then shuts it down and starts
  # the real server. Polling the socket therefore hands you a database that is
  # about to disappear -- seeding races the restart and the run dies with
  # "the database system is not yet accepting connections". TCP is only open once
  # the real server is up, so it is the honest readiness signal.
  local ok=0
  for _ in $(seq 1 90); do
    if docker exec "$CONTAINER" pg_isready -U postgres -h 127.0.0.1 -q 2>/dev/null; then
      ok=$((ok + 1))
      [ "$ok" -ge 2 ] && return 0
    else
      ok=0
    fi
    sleep 1
  done
  echo "postgres did not come up" >&2
  docker logs "$CONTAINER" 2>&1 | tail -20 >&2
  exit 1
}

seed_pg() {
  docker exec "$CONTAINER" mkdir -p /lab /lab/out
  docker cp "$(hostpath "$LAB_DIR/sql")"     "$CONTAINER":/lab/
  docker cp "$(hostpath "$LAB_DIR/pgbench")" "$CONTAINER":/lab/
  q -v rows="$ROWS" -f /lab/sql/seed.sql
}

# run_path <name> <ddl-sql-file>
#
# Fresh container, fresh seed, then: sampler + reporter + pgbench all start
# together, the DDL fires DDL_AT seconds in, and everything is collected once
# pgbench finishes on its own.
run_path() {
  local name="$1" ddl="$2"

  say "$name path: fresh postgres:$PG, $ROWS rows"
  start_pg
  seed_pg

  local d="$DEST/$name"
  mkdir -p "$d"
  docker exec "$CONTAINER" bash -c 'rm -rf /lab/out && mkdir -p /lab/out'

  # Lock sampler: one JSON object per line, server clock.
  docker exec -i "$CONTAINER" bash -c \
    "psql -U postgres -X -q -v interval=$SAMPLE_INTERVAL -v count=$SAMPLE_COUNT \
       -f /lab/sql/sampler.sql > /lab/out/locks.jsonl 2>/lab/out/locks.err" &
  local sampler_pid=$!

  # Reporting client (optional), holding ACCESS SHARE for the length of each read.
  local reporter_pid=""
  if [ "$REPORTER" = on ]; then
    docker exec -i "$CONTAINER" bash -c \
      "psql -U postgres -X -q -v interval=0.5 -v count=$REPORT_COUNT \
         -f /lab/sql/reporter.sql > /lab/out/reporter.log 2>&1" &
    reporter_pid=$!
  fi

  # OLTP workload: CLIENTS connections, 80% point SELECT / 20% point UPDATE,
  # rate-limited so the box is busy rather than saturated. --log writes one line
  # per transaction: client, txn number, latency in us, script, end timestamp.
  docker exec -i "$CONTAINER" bash -c \
    "pgbench -U postgres -d postgres -n \
       -c $CLIENTS -j 4 -T $DURATION -R $RATE --random-seed=$SEED \
       -D range=$ROWS \
       -f /lab/pgbench/oltp_select.sql@8 \
       -f /lab/pgbench/oltp_update.sql@2 \
       --log --log-prefix=/lab/out/tx \
       > /lab/out/pgbench.log 2>&1" &
  local bench_pid=$!

  sleep "$DDL_AT"
  say "$name path: firing DDL"
  docker exec -i "$CONTAINER" psql -U postgres -X -q -v gap="$GAP" -f "$ddl" \
    > "$d/events.raw" 2> "$d/ddl.err" || {
      echo "DDL failed:"; cat "$d/ddl.err"; }

  wait "$bench_pid" || true
  wait "$sampler_pid" 2>/dev/null || true
  if [ -n "$reporter_pid" ]; then wait "$reporter_pid" 2>/dev/null || true; fi

  docker exec "$CONTAINER" bash -c 'cat /lab/out/tx.* > /lab/out/tx.log 2>/dev/null || true'
  docker cp "$CONTAINER":/lab/out/locks.jsonl  "$(hostpath "$d/locks.jsonl")"
  docker cp "$CONTAINER":/lab/out/tx.log       "$(hostpath "$d/tx.log")"
  docker cp "$CONTAINER":/lab/out/pgbench.log  "$(hostpath "$d/pgbench.log")"
  if [ "$REPORTER" = on ]; then
    docker cp "$CONTAINER":/lab/out/reporter.log "$(hostpath "$d/reporter.log")"
  fi

  # Prove the change actually landed -- a trace of a migration that silently
  # failed would be worthless.
  q -c "SELECT attnotnull FROM pg_attribute
        WHERE attrelid='users'::regclass AND attname='email';" > "$d/final-state.txt"
  q -c "SELECT conname, contype, convalidated FROM pg_constraint
        WHERE conrelid='users'::regclass;" >> "$d/final-state.txt"

  echo "  -> $d"
}

cleanup() { if [ "$KEEP" = 0 ]; then docker rm -fv "$CONTAINER" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT INT TERM

say "lock-queue lab | pg$PG | ${ROWS} rows | ${CLIENTS} conns | ${RATE} tps | reporter=$REPORTER"

if [ "$ONLY" = both ] || [ "$ONLY" = unsafe ]; then run_path unsafe /lab/sql/unsafe.sql; fi
if [ "$ONLY" = both ] || [ "$ONLY" = safe   ]; then run_path safe   /lab/sql/safe.sql;   fi

# Environment record, so a trace can always be traced back to what produced it.
{
  echo "runId=$RUN_ID"
  echo "capturedAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "pgImage=postgres:$PG"
  docker run --rm postgres:"$PG" postgres --version | sed 's/^/pgVersion=/'
  echo "rows=$ROWS"
  echo "clients=$CLIENTS"
  echo "rateTps=$RATE"
  echo "durationSec=$DURATION"
  echo "ddlAtSec=$DDL_AT"
  echo "gapSec=$GAP"
  echo "sampleMs=$SAMPLE_MS"
  echo "reporter=$REPORTER"
  echo "pgbenchSeed=$SEED"
  echo "commitSha=$(git -C "$(hostpath "$LAB_DIR")" rev-parse HEAD 2>/dev/null || echo unknown)"
} > "$DEST/meta.txt"

if [ "$KEEP" = 0 ]; then docker rm -fv "$CONTAINER" >/dev/null 2>&1 || true; fi

say "done: $DEST"
cat "$DEST/meta.txt"
