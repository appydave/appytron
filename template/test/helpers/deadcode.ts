import { appendFileSync, cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, runInScratch, writeFiles } from './scratch';

// `npm run deadcode` in a scratch copy of the whole template: the shared setup of the G11 gate tests.
const SKIP = new Set(['node_modules', 'out', 'dist', 'coverage', '.git', '.claude']);

export const SLOW = 60_000;

export interface Change {
  write?: Record<string, string>;
  append?: Record<string, string>;
  remove?: string[];
  dependencies?: Record<string, string>;
}

export function deadcode(change: Change = {}): { failed: boolean; output: string } {
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
    ['npm', 'run', 'deadcode']
  );
}
