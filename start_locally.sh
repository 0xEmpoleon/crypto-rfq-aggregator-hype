#!/usr/bin/env bash
# Run the Option Strategist locally (Next.js dev server on :3000).
set -euo pipefail
cd "$(dirname "$0")/frontend"

if [ ! -d node_modules ]; then
  echo "Installing dependencies…"
  npm ci
fi

echo "Dashboard: http://localhost:3000"
exec npm run dev
