#!/usr/bin/env bash
# E1: a plain `npm install` of a freshly scaffolded app must leave an Electron binary that `npm run dev`
# and `npm start` can find. electron 44 has no install script and electron-vite reads node_modules/electron/path.txt
# without calling require('electron'), so without the template's postinstall every new app dies with "Electron uninstall".
# No ELECTRON_SKIP_BINARY_DOWNLOAD here on purpose: CI elsewhere skips the binary, this job is the one place that needs it.
# Usage: .github/scripts/electron-binary-check.sh [work-dir] [--break]   (--break plants a template without the postinstall; must fail)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${1:-$(mktemp -d)}"
APP="${WORK:?}/electron-app"
unset ELECTRON_SKIP_BINARY_DOWNLOAD

cd "${ROOT}/create-appytron"
npm install --no-audit --no-fund
npm run build
node "${ROOT}/create-appytron/dist/index.js" electron-app --into "${APP}"

if [ "${2:-}" = "--break" ]; then
  node -e "const f=process.argv[1],p=JSON.parse(require('fs').readFileSync(f,'utf8'));delete p.scripts.postinstall;require('fs').writeFileSync(f,JSON.stringify(p,null,2))" "${APP}/package.json"
fi

cd "${APP}"
npm install --no-audit --no-fund

# Resolve the executable the way electron-vite's getElectronPath does: path.txt beside the electron package, then dist/<path>.
node -e "
const fs = require('fs'), path = require('path');
const dir = path.dirname(require.resolve('electron'));
const pathFile = path.join(dir, 'path.txt');
if (!fs.existsSync(pathFile)) { console.error('Electron uninstall: no ' + pathFile); process.exit(1); }
const exe = path.join(dir, 'dist', fs.readFileSync(pathFile, 'utf8'));
fs.accessSync(exe, fs.constants.X_OK);
console.log('electron binary ok: ' + exe);
"
