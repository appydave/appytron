#!/usr/bin/env bash
# Scaffold job: build create-appytron from this checkout, scaffold a fresh app from this checkout's
# template/ into a temp dir, and run that app's own install, typecheck, test, build and lint.
# The template's own checks run against template/ in place; this runs them against what a user
# actually receives, so a file the scaffold drops or renames cannot hide behind a green template job.
# Usage: .github/scripts/scaffold-check.sh [work-dir]   (default: a fresh mktemp -d)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${1:-$(mktemp -d)}"
APP="${WORK:?}/scaffolded-app"
export ELECTRON_SKIP_BINARY_DOWNLOAD=1

echo "== build create-appytron"
cd "${ROOT}/create-appytron"
npm install --no-audit --no-fund
npm run build

echo "== scaffold into ${APP}"
node "${ROOT}/create-appytron/dist/index.js" scaffolded-app --into "${APP}"
test -f "${APP}/.github/workflows/ci.yml" || { echo "scaffold dropped .github/workflows/ci.yml"; exit 1; }

echo "== the scaffolded app's own checks"
cd "${APP}"
npm install --no-audit --no-fund
npm run typecheck
npm test
npm run build
npm run lint
