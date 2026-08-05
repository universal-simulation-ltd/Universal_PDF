#!/usr/bin/env bash
# Launch a local preview of Universal PDF (Vite + React 18, local-first PWA).
# Runs the dev server in the foreground — press Ctrl-C to stop.
#
# Usage:  ./scripts/preview.sh [port]      (default 5174)
#
# Default port is offset from Vite's 5173 so PDF / Webinar / Images can run
# at the same time without clashing. First run installs deps if missing.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PORT="${1:-5174}"

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies (first run)…"
  npm install
fi

echo "Universal PDF → http://localhost:$PORT"
exec npm run dev -- --port "$PORT" --strictPort
