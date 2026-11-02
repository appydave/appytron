import { appendFileSync, cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, runInScratch, writeFiles } from './scratch';

// An npm script in a scratch copy of the whole template: the shared setup of the G11 and AF4 gate tests.
const SKIP = new Set(['node_modules', 'out', 'dist', 'coverage', '.git', '.claude']);

export const SLOW = 60_000;

// The one line a failing `npm run deadcode` ends with, true for all three causes: dead code, a cycle and a process-boundary import.
export const DEADCODE_REMEDY =
  'Dead code, a cycle or a process-boundary import: delete the unused file, export or dependency, or use it from production code (a test does not count); break a cycle by moving the shared piece into a third file; a boundary finding prints its own remedy above. Do not add suppression.';

export interface Change {
  write?: Record<string, string>;
  append?: Record<string, string>;
  remove?: string[];
  dependencies?: Record<string, string>;
}

export function inCopy(change: Change, command: string[]): { failed: boolean; output: string } {
  return runInScratch(
    'g11-',
    (dir) => {
      cpSync(root, dir, {
        recursive: true,
        filter: (from) => !SKIP.has(from.split('/').pop() ?? ''),
      });
      writeFiles(dir, change.write ?? {});

      for (const [file, text] of Object.entries(change.append ?? {})) {
        appendFileSync(join(dir, file), text);
      }

      for (const file of change.remove ?? []) {
        rmSync(join(dir, file));
      }

      if (change.dependencies) {
        const path = join(dir, 'package.json');
        const pkg = JSON.parse(readFileSync(path, 'utf8'));

        writeFileSync(
          path,
          JSON.stringify({ ...pkg, dependencies: { ...pkg.dependencies, ...change.dependencies } })
        );
      }
    },
    command
  );
}

export const deadcode = (change: Change = {}) => inCopy(change, ['npm', 'run', 'deadcode']);
