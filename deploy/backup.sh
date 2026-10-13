#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
mkdir -p backups
backup_name="influencers-$(date -u +%Y%m%dT%H%M%S%NZ).sqlite"
docker compose --env-file .env.production exec -T app node deploy/database.mjs backup "/app/data/backups/$backup_name"
docker compose --env-file .env.production cp "app:/app/data/backups/$backup_name" "backups/$backup_name"
chmod 600 "backups/$backup_name"
echo "Verified backup saved under backups/$backup_name"
