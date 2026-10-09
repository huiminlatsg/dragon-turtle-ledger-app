#!/usr/bin/env bash
# Run the database migrations and security tests on a throwaway local Postgres
# (no Docker or Supabase needed). Uses a small stand-in for Supabase's auth schema.
#
#   ./scripts/db-test-local.sh
#
# Needs Postgres 15+ binaries (initdb, pg_ctl, psql). Set PGBIN if they aren't
# under /usr/lib/postgresql/<version>/bin.
set -euo pipefail
cd "$(dirname "$0")/.."

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PORT:-54329}"
DIR="$(mktemp -d)"

run() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown -R postgres "$DIR"

run "$PGBIN/initdb -D $DIR/data -U postgres -A trust >/dev/null"
run "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start >/dev/null"
trap 'run "$PGBIN/pg_ctl -D $DIR/data stop -m fast >/dev/null"; rm -rf "$DIR"' EXIT

URL="postgresql://postgres@localhost:$PORT/postgres"
psql "$URL" -q -v ON_ERROR_STOP=1 -f supabase/tests/local_stub/auth_stub.sql
for f in supabase/migrations/*.sql; do
  psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f"
done
psql "$URL" -q -v ON_ERROR_STOP=1 -o /dev/null -f supabase/tests/rls.test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
