#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
preview_port="${INFLUENCERS_PREVIEW_PORT:-3000}"
mkdir -p .preview
export INFLUENCERS_DB_PATH="${INFLUENCERS_DB_PATH:-$PWD/.preview/influencers.sqlite}"
export NEXT_TELEMETRY_DISABLED=1
if curl --fail --silent "http://127.0.0.1:$preview_port/api/health" >/dev/null; then
  echo 'Preview is already running.'
  exit 0
fi
nohup node node_modules/next/dist/bin/next dev --webpack --hostname 0.0.0.0 --port "$preview_port" > ".preview/server-$preview_port.log" 2>&1 < /dev/null &
echo "$!" > ".preview/server-$preview_port.pid"
for attempt in {1..45}; do
  if curl --fail --silent "http://127.0.0.1:$preview_port/api/health" >/dev/null; then
    echo 'Preview is ready. Open forwarded port 3000 from the Codespaces Ports tab; keep visibility Private.'
    exit 0
  fi
  if ! kill -0 "$(cat ".preview/server-$preview_port.pid")" 2>/dev/null; then break; fi
  sleep 1
done
tail -n 30 ".preview/server-$preview_port.log"
exit 1
