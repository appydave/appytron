import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// The one place the gate tests run a real npm script in a scratch copy of the template: the scratch is
// built by `setup`, the real node_modules is linked in, and the folder is removed afterwards. Nothing is
// planted in the real template, because other tests read it in parallel.
export const root = resolve(import.meta.dirname, '..', '..');

/** Write each `files` entry (path relative to `dir`) into `dir`, creating folders. */
export function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
}

export function runInScratch(
  prefix: string,
  setup: (dir: string) => void,
  command: string[]
): { failed: boolean; output: string } {
  const dir = mkdtempSync(join(tmpdir(), prefix));

  try {
    setup(dir);
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));

    const [program = 'npm', ...args] = command;
    const run = spawnSync(program, args, { cwd: dir, encoding: 'utf8' });

    return { failed: run.status !== 0, output: run.stdout + run.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
