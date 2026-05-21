#!/usr/bin/env bash
# Initialize the local development database for naval-vessel-tracker.
#
# Uses the Homebrew Postgres 17 instance on port 5433 (PG 14 owns 5432 for
# other apps on this machine; postgis bottle is only built against PG 17/18).
#
# Safe to re-run: createdb is gated, CREATE EXTENSION uses IF NOT EXISTS.

set -euo pipefail

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
PGPORT="${PGPORT:-5433}"
DB_NAME="${DB_NAME:-naval_tracker_dev}"

if ! "$PG_BIN/pg_isready" -p "$PGPORT" -q; then
  echo "Postgres 17 is not running on port $PGPORT." >&2
  echo "Try: brew services start postgresql@17" >&2
  exit 1
fi

if "$PG_BIN/psql" -p "$PGPORT" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  echo "database $DB_NAME already exists"
else
  "$PG_BIN/createdb" -p "$PGPORT" "$DB_NAME"
  echo "created database $DB_NAME"
fi

"$PG_BIN/psql" -p "$PGPORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL

echo "postgis version:"
"$PG_BIN/psql" -p "$PGPORT" -d "$DB_NAME" -tAc "SELECT postgis_version();"
