#!/usr/bin/env bash
# Backs up the app database and the Canton ledger databases to backups/<timestamp>/.
# Restore with: bash scripts/restore-db.sh backups/<timestamp>
# Stop the API and the ledger first when restoring.
set -euo pipefail
PG="${CANTON_PG_CONTAINER:-cantonflow-pg}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT"

for db in cantonflow canton_participant canton_sequencer canton_sequencer_blocks canton_mediator; do
  exists="$(docker exec "$PG" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'")"
  if [[ "$exists" == "1" ]]; then
    docker exec "$PG" pg_dump -U postgres -Fc "$db" > "$OUT/$db.dump"
    echo "backed up $db ($(du -h "$OUT/$db.dump" | cut -f1))"
  fi
done
echo "Backup written to ${OUT#"$ROOT"/}"
