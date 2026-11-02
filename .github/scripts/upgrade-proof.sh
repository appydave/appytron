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
test -f .jscpd.json && test -f .jscpd.tests.json || { echo "upgrade did not bring the .jscpd configs"; exit 1; }
test -f knip.json && test -f .dependency-cruiser.cjs || { echo "upgrade did not bring the knip and dependency-cruiser configs"; exit 1; }
test -f tsconfig.boundaries.json || { echo "upgrade did not bring tsconfig.boundaries.json"; exit 1; }
grep -q "'@main'" electron.vite.config.ts && grep -q "'@preload'" electron.vite.config.ts || { echo "upgrade did not bring the @main and @preload build aliases"; exit 1; }
grep -q 'npm run lint -- --fix' UPGRADE_TODO.md || { echo "upgrade wrote ci.yml but left no fix row in UPGRADE_TODO.md"; exit 1; }

echo "== install, then lint / typecheck / build"
npm install --no-audit --no-fund
LOAD_ERRORS="Cannot find module|ERR_MODULE_NOT_FOUND|Missing script|Oops! Something went wrong|ConfigError|Failed to parse oxlint config"
# Oxlint runs first in `lint`, and every 0.2.0 app carries a cast in main.tsx, so `npm run lint` stops
# there and never reaches ESLint. Run both halves on their own: each must LOAD (exit 0 or 1 = findings
# in the old app's code, reported; anything else, or a load error in the output, fails the proof).
check_loads() {
  local name="$1" out="${WORK}/${1}.out" code
  shift
  set +e
  "$@" > "${out}" 2>&1
  code=$?
  set -e
  tail -n 8 "${out}"
  if grep -Eq "${LOAD_ERRORS}" "${out}" || [ "${code}" -gt 1 ]; then
    echo "${name} did not load and run (exit ${code})"; exit 1
  fi
  echo "${name} ran (exit ${code})"
}
check_loads lint npm run lint
check_loads eslint npx eslint . --max-warnings 0
# G08: the dup script and jscpd reached the upgraded app and run (clones in the old code are reported, not failed on).
check_loads dup npm run dup
# G11: the deadcode script, Knip and dependency-cruiser reached the upgraded app and run (findings in the old code are reported, not failed on).
check_loads deadcode npm run deadcode
# G12e: the boundary rules reached the upgraded app: clean as shipped, and a renderer import of main fails, naming the rule.
BOUNDARIES="npx depcruise -c .dependency-cruiser.cjs --ts-config tsconfig.boundaries.json -T err-long src"
${BOUNDARIES} || { echo "the upgraded 0.2.0 app has a process-boundary finding"; exit 1; }
printf "\nimport '@main/ipc-router';\n" >> src/renderer/src/main.tsx
if ${BOUNDARIES} > "${WORK}/boundaries.out" 2>&1; then echo "a renderer import of main did not fail the boundary rules"; exit 1; fi
grep -q "error renderer-imports-main-or-preload: src/renderer/src/main.tsx" "${WORK}/boundaries.out" || { echo "boundary failure did not name the rule"; exit 1; }
sed -i.bak '$d' src/renderer/src/main.tsx && rm src/renderer/src/main.tsx.bak
# Oxlint ends with `Found N warnings and M errors.`; ESLint prints `  line:col  error  ...` per finding.
echo "findings: oxlint $(grep -Eo 'Found [0-9]+ warnings? and [0-9]+ errors?' "${WORK}/lint.out" | tail -n 1 || true), eslint $(grep -Ec '^\s+[0-9]+:[0-9]+\s+(error|warning)' "${WORK}/eslint.out" || true)"
npm run typecheck
npm run build
echo "upgrade proof passed"
