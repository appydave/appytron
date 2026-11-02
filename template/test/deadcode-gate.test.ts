import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { installedVersion, manifest } from './helpers/manifest';
import { type Change, deadcode, SLOW } from './helpers/deadcode';
import { root } from './helpers/scratch';

// G11: the dead-code and cycle gate as `npm run deadcode` runs it. Every probe runs the real script in a scratch
// copy of the whole template (node_modules linked in), so the wiring is what fails, not the tool. Nothing is
// planted in the real template: other tests read it in parallel.
describe('G11 the deadcode script fails on dead code, naming it', () => {
  it(
    'passes the untouched template, so the failures below are the planted code',
    () => {
      expect(deadcode().failed).toBe(false);
    },
    SLOW
  );

  it.each([
    ['main', 'src/main/orphan.ts'],
    ['preload', 'src/preload/orphan.ts'],
    ['shared', 'src/shared/orphan.ts'],
    ['renderer', 'src/renderer/src/orphan.ts'],
    ['lint', 'lint/orphan.js'],
    ['a test helper', 'test/helpers/orphan.ts'],
    ['the project root', 'orphan.config.js'],
  ])(
    'an unused file in %s',
    (_where, file) => {
      const { failed, output } = deadcode({ write: { [file]: 'export const orphan = 1;\n' } });

      expect(failed).toBe(true);
      expect(output).toContain('Unused files');
      expect(output).toContain(file);
    },
    SLOW
  );

  it.each([
    ['main', 'src/main/ipc-router.ts'],
    ['shared', 'src/shared/ipc.ts'],
    ['lint', 'lint/spacing.js'],
  ])(
    'an unused export in %s',
    (_where, file) => {
      const { failed, output } = deadcode({
        append: { [file]: '\nexport const unusedThing = 1;\n' },
      });

      expect(failed).toBe(true);
      expect(output).toContain('Unused exports');
      expect(output).toContain('unusedThing');
    },
    SLOW
  );

  it(
    'an unused exported type',
    () => {
      const { failed, output } = deadcode({
        append: { 'src/shared/ipc.ts': '\nexport type UnusedShape = string;\n' },
      });

      expect(failed).toBe(true);
      expect(output).toContain('UnusedShape');
    },
    SLOW
  );

  it(
    'an unused dependency',
    () => {
      const { failed, output } = deadcode({ dependencies: { 'left-pad': '1.3.0' } });

      expect(failed).toBe(true);
      expect(output).toContain('Unused dependencies');
      expect(output).toContain('left-pad');
    },
    SLOW
  );
});

describe('G11 the deadcode script fails on an import cycle, naming the rule', () => {
  // Each file's export is used by the next, so Knip passes and only the cycle is left. Entered from src/main/index.ts.
  const cycles: [string, string, Record<string, string>][] = [
    [
      '2 files, relative',
      './ca',
      {
        'src/main/ca.ts': "import { b } from './cb';\nexport const a = () => b;\n",
        'src/main/cb.ts': "import { a } from './ca';\nexport const b = () => a;\n",
      },
    ],
    [
      '2 files, through the @shared alias',
      '@shared/ca',
      {
        'src/shared/ca.ts': "import { b } from '@shared/cb';\nexport const a = () => b;\n",
        'src/shared/cb.ts': "import { a } from '@shared/ca';\nexport const b = () => a;\n",
      },
    ],
    [
      '3 files across preload, shared and renderer, through @shared and @',
      '../preload/ca',
      {
        'src/preload/ca.ts': "import { b } from '@shared/cb';\nexport const a = () => b;\n",
        'src/shared/cb.ts': "import { c } from '@/cc';\nexport const b = () => c;\n",
        'src/renderer/src/cc.ts':
          "import { a } from '../../preload/ca';\nexport const c = () => a;\n",
      },
    ],
  ];

  it.each(cycles)(
    '%s',
    (_name, specifier, files) => {
      const entry = Object.keys(files)[0] ?? '';
      const { failed, output } = deadcode({
        write: files,
        append: {
          'src/main/index.ts': `\nimport * as cycle from '${specifier}';\n\nvoid cycle;\n`,
        },
      });

      expect(failed).toBe(true);
      expect(output).toContain('no-circular');
      expect(output).toContain(entry);
    },
    SLOW
  );

  // G12e: the scan reads tsconfig.boundaries.json, which lists the test aliases too, so a cycle through one is seen.
  it.each([
    [
      'two test helpers, relative',
      'test/helpers/ca.ts',
      {
        write: {
          'test/helpers/ca.ts': "import { b } from './cb';\nexport const a = () => b;\n",
          'test/helpers/cb.ts': "import { a } from './ca';\nexport const b = () => a;\n",
        },
        append: { 'test/ipc-router.test.ts': "\nimport { a } from './helpers/ca';\n\nvoid a;\n" },
      },
    ],
    [
      'a root config and the helper it imports',
      'vitest.helper.ts',
      {
        write: {
          'vitest.helper.ts':
            "import config from './vitest.config';\n\nexport const helper = () => config;\n",
        },
        append: {
          'vitest.config.ts': "\nimport { helper } from './vitest.helper';\n\nvoid helper;\n",
        },
      },
    ],
  ])(
    'a cycle in %s',
    (_name, entry, change: Change) => {
      const { failed, output } = deadcode(change);

      expect(failed).toBe(true);
      expect(output).toContain('no-circular');
      expect(output).toContain(entry);
    },
    SLOW
  );

  it(
    'the same files without the back edge pass, so the failure is the cycle',
    () => {
      const { failed } = deadcode({
        write: {
          'src/main/ca.ts': "import { b } from './cb';\nexport const a = () => b;\n",
          'src/main/cb.ts': 'export const b = () => 1;\n',
        },
        append: { 'src/main/index.ts': "\nimport { a } from './ca';\n\nvoid a;\n" },
      });

      expect(failed).toBe(false);
    },
    SLOW
  );
});

describe('G11 the one ruled exemption hides only itself', () => {
  it(
    'the updater and its dependency are not reported',
    () => {
      expect(deadcode().failed).toBe(false);
    },
    SLOW
  );

  it(
    'without knip.json both are reported, so the config is what exempts them',
    () => {
      const { failed, output } = deadcode({ remove: ['knip.json'] });

      expect(failed).toBe(true);
      expect(output).toContain('src/main/updater.ts');
      expect(output).toContain('electron-updater');
    },
    SLOW
  );

  it(
    'another unused file and another unused dependency are still reported beside it',
    () => {
      const { failed, output } = deadcode({
        write: { 'src/main/updater-two.ts': 'export const two = 1;\n' },
        dependencies: { 'left-pad': '1.3.0' },
      });

      expect(failed).toBe(true);
      expect(output).toContain('src/main/updater-two.ts');
      expect(output).toContain('left-pad');
      expect(output).not.toContain('src/main/updater.ts');
    },
    SLOW
  );
});

describe('G11 the deadcode script refuses a Knip tag, which would hide an export from the tool', () => {
  // Pieces, so this file does not trip the guard it tests.
  it.each(['public', 'internal', 'beta', 'alias'].map((tag) => `@${tag}`))(
    '%s',
    (tag) => {
      const { failed, output } = deadcode({
        append: { 'src/shared/ipc.ts': `\n/** ${tag} */\nexport const hidden = 1;\n` },
      });

      expect(failed).toBe(true);
      expect(output).toContain(`src/shared/ipc.ts:`);
      expect(output).toContain(tag);
    },
    SLOW
  );
});

describe('G11 the reviewed configuration', () => {
  const read = (file: string): unknown => JSON.parse(readFileSync(join(root, file), 'utf8'));

  // `ignore` hides the findings of the named file (its own unused exports too) and of nothing it imports.
  it('exempts exactly src/main/updater.ts, electron-updater and src/main/file-author.ts, by name', () => {
    expect(read('knip.json')).toEqual({
      $schema: 'https://unpkg.com/knip@6/schema.json',
      project: ['src/**!', 'src/**/*.css!', 'test/**', 'lint/**', '*.{js,ts,cjs}'],
      ignore: ['src/main/updater.ts', 'src/main/file-author.ts'],
      ignoreDependencies: ['electron-updater'],
    });
  });

  it('forbids a circular import, following no node_modules (the boundary rules beside it: test/boundaries-config.test.ts)', () => {
    const config = createRequire(import.meta.url)(join(root, '.dependency-cruiser.cjs'));

    expect(config.forbidden[0]).toEqual({
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    });
    expect(config.options).toEqual({
      doNotFollow: { path: 'node_modules' },
      tsPreCompilationDeps: true,
      preserveSymlinks: true,
    });
  });

  it(
    'prints no Knip configuration hint on a clean tree (the file-author.ts hint is intended, so it is switched off)',
    () => {
      const { failed, output } = deadcode();

      expect(failed).toBe(false);
      expect(output).not.toContain('Remove from ignore');
    },
    SLOW
  );

  it('states in the limits list that .mts and .cts get no TypeScript parser, so TypeScript syntax in them fails to parse', () => {
    const header = readFileSync(join(root, 'lint/deadcode-remedy.js'), 'utf8').replace(
      /\s*\n \*\s*/g,
      ' '
    );

    expect(header).toContain(
      '.mts and .cts get only the generic ESLint block (no TypeScript parser), so TypeScript syntax in them is `Parsing error: Unexpected token :` and the strict rules never run: write .ts for TypeScript'
    );
  });

  it('runs the guard, Knip, Knip on production code, then depcruise over src and lint, and the remedy on failure', () => {
    expect(manifest().scripts.deadcode).toBe(
      'node lint/no-disable-directives.js && knip --no-config-hints && knip --production --exclude binaries && depcruise -c .dependency-cruiser.cjs --ts-config tsconfig.boundaries.json -T err-long src lint test vitest.config.ts eslint.config.js electron.vite.config.ts || node lint/deadcode-remedy.js'
    );
  });

  it.each(['knip', 'dependency-cruiser'])(
    'pins %s to the exact version that is installed',
    (name) => {
      expect(manifest().devDependencies[name]).toMatch(/^\d+\.\d+\.\d+$/);
      expect(installedVersion(name)).toBe(manifest().devDependencies[name]);
    }
  );

  it('runs in the template CI after the dup gate', () => {
    const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

    expect(ci).toMatch(/npm run dup\n\s+- run: npm run deadcode/);
  });
});
