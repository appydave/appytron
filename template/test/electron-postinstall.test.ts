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

// A scratch app whose `electron` package drops a marker when it is required, and throws like a failed download when asked to.
function runPostinstall(
  env: Record<string, string>,
  electronThrows = false
): { required: boolean; status: number | null; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), 'e1-'));

  scratch.push(dir);
  mkdirSync(join(dir, 'node_modules', 'electron'), { recursive: true });
  writeFileSync(
    join(dir, 'node_modules', 'electron', 'index.js'),
    `require('fs').writeFileSync(${JSON.stringify(join(dir, 'required'))}, '');\n` +
      (electronThrows
        ? `throw new Error('Electron failed to install correctly');\n`
        : `module.exports = '';\n`)
  );

  const run = spawnSync(pkg.scripts.postinstall ?? 'exit 1', {
    cwd: dir,
    shell: true,
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8',
  });

  return { required: existsSync(join(dir, 'required')), status: run.status, stderr: run.stderr };
}

describe('E1 postinstall fetches the Electron binary', () => {
  it('requires electron on a plain install, so the binary is downloaded', () => {
    const run = runPostinstall({});

    expect(run.required).toBe(true);
    expect(run.status).toBe(0);
  });

  it('leaves electron alone when ELECTRON_SKIP_BINARY_DOWNLOAD is set, so CI stays fast', () => {
    const run = runPostinstall({ ELECTRON_SKIP_BINARY_DOWNLOAD: '1' });

    expect(run.required).toBe(false);
    expect(run.status).toBe(0);
  });

  it('a failed download still fails the install, and the message names the skip variable', () => {
    const run = runPostinstall({}, true);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('ELECTRON_SKIP_BINARY_DOWNLOAD=1');
    expect(run.stderr).toContain('Electron failed to install correctly');
  });

  it('prints no hint when the download is skipped', () => {
    const run = runPostinstall({ ELECTRON_SKIP_BINARY_DOWNLOAD: '1' }, true);

    expect(run.status).toBe(0);
    expect(run.stderr).toBe('');
  });

  it('is the exact reviewed command', () => {
    expect(pkg.scripts.postinstall).toBe(
      `node -e "if (!process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) { try { require('electron') } catch (e) { console.error('appytron: the Electron binary download failed. On CI, or offline, set ELECTRON_SKIP_BINARY_DOWNLOAD=1 to skip it.'); throw e } }"`
    );
  });
});
