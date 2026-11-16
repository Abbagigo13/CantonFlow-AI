#!/usr/bin/env bash
# Restores a backup made by scripts/backup-db.sh. This REPLACES the current data.
# Usage: bash scripts/restore-db.sh backups/<timestamp>
# Stop the API (bun run server) and the ledger (bun run ledger) first.
# Dry run: RESTORE_SUFFIX=_check restores into cantonflow_check etc. and leaves live data alone.
set -euo pipefail
DIR="${1:?Usage: restore-db.sh backups/<timestamp>}"
PG="${CANTON_PG_CONTAINER:-cantonflow-pg}"

shopt -s nullglob
dumps=("$DIR"/*.dump)
[[ ${#dumps[@]} -gt 0 ]] || { echo "No .dump files in $DIR" >&2; exit 1; }

for dump in "${dumps[@]}"; do
  db="$(basename "$dump" .dump)${RESTORE_SUFFIX:-}"
  docker exec "$PG" psql -U postgres -qc "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)"
  docker exec "$PG" psql -U postgres -qc "CREATE DATABASE \"$db\""
  docker exec -i "$PG" pg_restore -U postgres -d "$db" --no-owner < "$dump"
  echo "restored $db"
done
