import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..', '..');
const oxlint = resolve(root, 'node_modules/.bin/oxlint');

/**
 * Runs the real Oxlint binary over `source` placed at `file` in a scratch folder holding a copy of the
 * real .oxlintrc.json. Overrides match paths relative to the config, so a probe at a given path needs
 * the config beside it; nothing is planted in the real template, where other tests read in parallel.
 */
export function oxlintAt(file: string, source: string): { failed: boolean; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'oxlint-at-'));

  try {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, '.oxlintrc.json'), readFileSync(join(root, '.oxlintrc.json')));
    writeFileSync(join(dir, file), source);

    const run = spawnSync(
      oxlint,
      ['--deny-warnings', '--format=default', '-c', '.oxlintrc.json', '.'],
      { cwd: dir, encoding: 'utf8' }
    );

    return { failed: run.status !== 0, output: run.stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
