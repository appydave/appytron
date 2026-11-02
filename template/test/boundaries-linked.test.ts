import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SLOW } from './helpers/deadcode';
import { root } from './helpers/scratch';

// AF5 fix 1: a package linked from outside the project (`"@appydave/core": "file:../core"`, how some apps declare it)
// resolves outside node_modules unless preserveSymlinks is on. The scratch project has real packages in vendor/ and
// symlinks to them from node_modules/, the way npm links a file: dependency.
const PACKAGES = ['zod', '@appydave/core', 'lodash'];
const PLANTS: [string, string, boolean][] = [
  ['an allowed package, linked from outside node_modules (zod)', "import 'zod';\n", false],
  [
    'an allowed package, linked from outside node_modules (@appydave/core)',
    "import '@appydave/core';\n",
    false,
  ],
  ['a package not on the list, linked the same way (lodash)', "import 'lodash';\n", true],
];

function cruise(preserveSymlinks: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'af5-link-'));

  try {
    cpSync(join(root, 'src/shared'), join(dir, 'src/shared'), { recursive: true });
    cpSync(join(root, 'tsconfig.boundaries.json'), join(dir, 'tsconfig.boundaries.json'));

    const config = join(root, '.dependency-cruiser.cjs');

    writeFileSync(
      join(dir, '.dependency-cruiser.cjs'),
      `const c = require(${JSON.stringify(config)});\nc.options.preserveSymlinks = ${preserveSymlinks};\nmodule.exports = c;\n`
    );

    for (const name of PACKAGES) {
      mkdirSync(join(dir, 'vendor', name), { recursive: true });
      writeFileSync(
        join(dir, 'vendor', name, 'package.json'),
        JSON.stringify({ name, main: 'index.js' })
      );
      writeFileSync(join(dir, 'vendor', name, 'index.js'), 'module.exports = {};\n');
      mkdirSync(join(dir, 'node_modules', name, '..'), { recursive: true });
      symlinkSync(join(dir, 'vendor', name), join(dir, 'node_modules', name));
    }

    PLANTS.forEach(([, text], i) => writeFileSync(join(dir, `src/shared/plant-${i}.ts`), text));

    const cruiser = join(root, 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs');
    const run = spawnSync(
      process.execPath,
      [
        cruiser,
        '-c',
        '.dependency-cruiser.cjs',
        '--ts-config',
        'tsconfig.boundaries.json',
        '-T',
        'err-long',
        'src/shared',
      ],
      { cwd: dir, encoding: 'utf8' }
    );

    return run.stdout + run.stderr;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('AF5 src/shared with packages linked from outside node_modules', () => {
  const output = cruise(true);

  it.each(PLANTS.map(([name, , flagged], i): [string, number, boolean] => [name, i, flagged]))(
    '%s',
    (_name, i, flagged) => {
      const line = `error shared-imports-outside-shared: src/shared/plant-${i}.ts `;

      expect(output.includes(line)).toBe(flagged);
    },
    SLOW
  );

  it(
    'the plant is honest: without preserveSymlinks the linked @appydave/core is flagged',
    () => {
      expect(cruise(false)).toContain(
        'error shared-imports-outside-shared: src/shared/plant-1.ts '
      );
    },
    SLOW
  );
});
