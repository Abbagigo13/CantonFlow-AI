#!/usr/bin/env bash
# Builds the Daml contract and runs a local Canton ledger with it loaded.
# JSON Ledger API: http://127.0.0.1:6864  (gRPC: 6865)
#
#   bun run ledger            persistent: state lives in PostgreSQL and survives restarts
#   bun run ledger -- --memory  throwaway: state is erased when it stops
set -euo pipefail
export JAVA_HOME="${JAVA_HOME:-$HOME/jdk}"
export PATH="$JAVA_HOME/bin:$HOME/.dpm/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DAR="$ROOT/daml/.daml/dist/cantonflow-0.2.0.dar"

(cd "$ROOT/daml" && dpm build)

if [[ "${1:-}" == "--memory" ]]; then
  exec dpm sandbox --dar "$DAR"
fi

# The persistent ledger keeps its data in four PostgreSQL databases.
PG_CONTAINER="${CANTON_PG_CONTAINER:-cantonflow-pg}"
if docker inspect "$PG_CONTAINER" >/dev/null 2>&1; then
  for db in canton_participant canton_sequencer canton_sequencer_blocks canton_mediator; do
    exists="$(docker exec "$PG_CONTAINER" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'")"
    [[ "$exists" == "1" ]] || docker exec "$PG_CONTAINER" psql -U postgres -qc "CREATE DATABASE $db"
  done
fi

# `sandbox` cannot take a custom bootstrap script, so the persistent ledger
# runs the Canton daemon directly with its own config and bootstrap.
# Use the Canton version that matches the SDK the contract is built with.
SDK_VERSION="$(sed -n 's/^sdk-version: *//p' "$ROOT/daml/daml.yaml" | head -1)"
CANTON_JAR="$HOME/.dpm/cache/components/canton-open-source/$SDK_VERSION/lib/canton-open-source-$SDK_VERSION.jar"
mkdir -p "$ROOT/ledger/log"
cd "$ROOT/ledger"
export CF_DAR="$DAR"
exec java -jar "$CANTON_JAR" daemon -c "$ROOT/ledger/canton.conf" --bootstrap "$ROOT/ledger/bootstrap.canton" --no-tty --log-file-name "$ROOT/ledger/log/canton.log"
