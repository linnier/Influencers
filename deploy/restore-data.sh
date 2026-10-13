#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "$#" -ne 1 ]; then
  echo "Usage: bash deploy/restore-data.sh /absolute/path/to/influencers.sqlite" >&2
  exit 1
fi
source_database=$(realpath "$1")
test -f "$source_database"
if docker compose --env-file .env.production ps --status running --services | grep -x -q app; then
  echo "Stop the app before restoring data; only an empty destination can be restored." >&2
  exit 1
fi
docker compose --env-file .env.production run --rm --no-deps --user 0:0 --cap-add CHOWN --cap-add DAC_OVERRIDE -v "$source_database:/restore.sqlite:ro" app node deploy/database.mjs restore /restore.sqlite
