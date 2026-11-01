#!/usr/bin/env bash
# Upgrade proof: scaffold an app from the PUBLISHED create-appytron@0.2.0 (npm registry), upgrade it
# with the tool built from this checkout, install, then run lint, typecheck and build.
# Pass = lint loads and runs (no missing module, no config error). Findings in the old app's own code are
# the gates working: the count is reported, not failed on.
# With --break the built classify drops the lint/ rule first, and the run must FAIL (proves the test sees it).
# Usage: .github/scripts/upgrade-proof.sh [--break] [work-dir]
set -euo pipefail

BREAK=0
if [ "${1:-}" = "--break" ]; then BREAK=1; shift; fi
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${1:-$(mktemp -d)}"
mkdir -p "${WORK:?}"
APP="${WORK}/old-app"
export ELECTRON_SKIP_BINARY_DOWNLOAD=1

echo "== build create-appytron from this checkout"
cd "${ROOT}/create-appytron"
npm install --no-audit --no-fund
npm run build
if [ "${BREAK}" = 1 ]; then
  sed -i.bak "s#'lint/'#'lint-disabled/'#" dist/lib/classify.js
  grep -q "lint-disabled/" dist/lib/classify.js || { echo "planted break did not apply"; exit 2; }
fi

echo "== scaffold from the published create-appytron@0.2.0 into ${APP}"
cd "${WORK}"
npx --yes create-appytron@0.2.0 old-app --into "${APP}"
test ! -e "${APP}/eslint.config.js" || { echo "0.2.0 app already has eslint.config.js; the proof proves nothing"; exit 2; }

echo "== upgrade with the tool from this checkout"
cd "${APP}"
node "${ROOT}/create-appytron/dist/upgrade-cli.js"
test -f lint/spacing.js || { echo "upgrade did not bring lint/spacing.js"; exit 1; }
test -f .gitignore || { echo "upgrade did not create .gitignore"; exit 1; }

echo "== install, then lint / typecheck / build"
npm install --no-audit --no-fund
set +e
npm run lint > "${WORK}/lint.out" 2>&1
LINT=$?
set -e
tail -n 15 "${WORK}/lint.out"
# exit 1 = findings in the old app's code (reported); a load failure is exit 2 or a missing module
if grep -Eq "Cannot find module|ERR_MODULE_NOT_FOUND|Missing script|Oops! Something went wrong|ConfigError" "${WORK}/lint.out" || [ "${LINT}" -gt 1 ]; then
  echo "lint did not load and run (exit ${LINT})"; exit 1
fi
echo "lint ran (exit ${LINT}); findings: $(grep -Ec '^\s+[0-9]+:[0-9]+\s' "${WORK}/lint.out" || true)"
npm run typecheck
npm run build
echo "upgrade proof passed"
