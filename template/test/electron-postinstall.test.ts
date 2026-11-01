import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// E1: electron 44 has no install script and electron-vite reads node_modules/electron/path.txt without
// calling require('electron'), so a fresh app has no binary and `npm start` dies with "Electron uninstall".
// The template's postinstall requires electron (which downloads it) unless ELECTRON_SKIP_BINARY_DOWNLOAD is set.
// CI proves the real download in .github/scripts/electron-binary-check.sh; this runs the real script string offline.
const root = resolve(import.meta.dirname, '..');
const pkg: { scripts: Record<string, string> } = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8')
);
const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A scratch app whose `electron` package only drops a marker when it is required.
function runPostinstall(env: Record<string, string>): boolean {
  const dir = mkdtempSync(join(tmpdir(), 'e1-'));

  scratch.push(dir);
  mkdirSync(join(dir, 'node_modules', 'electron'), { recursive: true });
  writeFileSync(
    join(dir, 'node_modules', 'electron', 'index.js'),
    `require('fs').writeFileSync(${JSON.stringify(join(dir, 'required'))}, '');\nmodule.exports = '';\n`
  );

  const run = spawnSync(pkg.scripts.postinstall ?? 'exit 1', {
    cwd: dir,
    shell: true,
    env: { PATH: process.env.PATH ?? '', ...env },
  });

  expect(run.status).toBe(0);

  return existsSync(join(dir, 'required'));
}

describe('E1 postinstall fetches the Electron binary', () => {
  it('requires electron on a plain install, so the binary is downloaded', () => {
    expect(runPostinstall({})).toBe(true);
  });

  it('leaves electron alone when ELECTRON_SKIP_BINARY_DOWNLOAD is set, so CI stays fast', () => {
    expect(runPostinstall({ ELECTRON_SKIP_BINARY_DOWNLOAD: '1' })).toBe(false);
  });

  it('is the exact reviewed command', () => {
    expect(pkg.scripts.postinstall).toBe(
      `node -e "process.env.ELECTRON_SKIP_BINARY_DOWNLOAD || require('electron')"`
    );
  });
});
