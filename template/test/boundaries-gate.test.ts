import { dirname, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deadcode, SLOW } from './helpers/deadcode';

// G12e: the process boundaries as `npm run deadcode` runs them. Every probe plants one import in a scratch copy of
// the whole template and runs the real script, so the wiring fails, not the tool. Each planted line goes into a file
// Knip already knows and imports a file Knip already knows, so only dependency-cruiser can be the one that fails.
type Folder = 'renderer' | 'preload' | 'main' | 'shared';

const FILE: Record<Folder, string> = {
  renderer: 'src/renderer/src/main.tsx',
  preload: 'src/preload/index.ts',
  main: 'src/main/index.ts',
  shared: 'src/shared/ipc.ts',
};
const TARGET: Record<Folder, string> = {
  renderer: 'src/renderer/src/store',
  preload: 'src/preload/index',
  main: 'src/main/ipc-router',
  shared: 'src/shared/ipc',
};
const ALIAS: Record<Folder, string> = {
  renderer: '@/store',
  preload: '@preload/index',
  main: '@main/ipc-router',
  shared: '@shared/ipc',
};

const relativeSpecifier = (from: Folder, to: Folder): string => {
  const path = relative(dirname(FILE[from]), TARGET[to]);

  return path.startsWith('.') ? path : `./${path}`;
};

type Case = [name: string, from: Folder, text: string, rule: string];

// One planted line must fail the script, naming the rule and the file that holds the line.
const expectFinding = (...[_name, from, line, rule]: Case): void => {
  const { failed, output } = plant(from, line);

  expect(failed).toBe(true);
  expect(output).toContain(`error ${rule}: ${FILE[from]}`);
};

const plant = (from: Folder, line: string) => deadcode({ append: { [FILE[from]]: `\n${line}\n` } });

const RENDERER_RULE = 'renderer-imports-main-or-preload';
const PRELOAD_RULE = 'preload-imports-outside-shared';
const MAIN_RULE = 'main-imports-renderer-or-preload';
const SHARED_RULE = 'shared-imports-outside-shared';

// Every forbidden direction between the four folders (a folder importing itself or @shared is allowed).
const DIRECTIONS: [Folder, Folder, string][] = [
  ['renderer', 'main', RENDERER_RULE],
  ['renderer', 'preload', RENDERER_RULE],
  ['preload', 'main', PRELOAD_RULE],
  ['preload', 'renderer', PRELOAD_RULE],
  ['main', 'renderer', MAIN_RULE],
  ['main', 'preload', MAIN_RULE],
  ['shared', 'main', SHARED_RULE],
  ['shared', 'preload', SHARED_RULE],
  ['shared', 'renderer', SHARED_RULE],
];

describe('G12e a process importing across the split fails, by relative path and by alias', () => {
  const cases: Case[] = DIRECTIONS.flatMap(([from, to, rule]): Case[] => [
    [`${from} -> ${to}, relative`, from, `import '${relativeSpecifier(from, to)}';`, rule],
    [`${from} -> ${to}, alias`, from, `import '${ALIAS[to]}';`, rule],
  ]);

  it.each(cases)('%s', expectFinding, SLOW);
});

describe('G12e every way of writing the import is seen', () => {
  const FORMS: [string, (specifier: string) => string][] = [
    ['import type', (s) => `import type * as t from '${s}';`],
    ['dynamic import()', (s) => `void import('${s}');`],
    ['require()', (s) => `void require('${s}');`],
    ['export * from', (s) => `export * from '${s}';`],
  ];

  const SAMPLE: [Folder, Folder, string][] = [
    ['renderer', 'main', RENDERER_RULE],
    ['preload', 'main', PRELOAD_RULE],
    ['main', 'preload', MAIN_RULE],
    ['shared', 'main', SHARED_RULE],
  ];
  const cases: Case[] = FORMS.flatMap(([form, write]): Case[] =>
    SAMPLE.map(([from, to, rule]): Case => [
      `${form}: ${from} -> ${to}`,
      from,
      write(ALIAS[to]),
      rule,
    ])
  );

  it.each(cases)('%s', expectFinding, SLOW);
});

describe('G12e Node, Electron and packages stay where they belong', () => {
  it.each([
    ['electron in the renderer', 'renderer', "import 'electron';", 'renderer-imports-electron'],
    [
      'a type from electron in the renderer',
      'renderer',
      "import type * as e from 'electron';",
      'renderer-imports-electron',
    ],
    [
      'node:fs in the renderer',
      'renderer',
      "import 'node:fs';",
      'renderer-imports-node-or-electron',
    ],
    [
      'fs, no node: prefix, in the renderer',
      'renderer',
      "import 'fs';",
      'renderer-imports-node-or-electron',
    ],
    [
      'node:path through import() in the renderer',
      'renderer',
      "void import('node:path');",
      'renderer-imports-node-or-electron',
    ],
    ['node:fs in the preload', 'preload', "import 'node:fs';", PRELOAD_RULE],
    ['fs, no node: prefix, in the preload', 'preload', "import 'fs';", PRELOAD_RULE],
    ['a package in the preload', 'preload', "import 'zustand';", PRELOAD_RULE],
    ['electron in shared', 'shared', "import 'electron';", SHARED_RULE],
    ['node:fs in shared', 'shared', "import 'node:fs';", SHARED_RULE],
    ['fs, no node: prefix, in shared', 'shared', "import 'fs';", SHARED_RULE],
    ['a package in shared', 'shared', "import 'zustand';", SHARED_RULE],
  ] satisfies Case[])('%s', expectFinding, SLOW);

  // An alias Knip knows but tsconfig.boundaries.json does not: Knip passes, so only this rule can stop it.
  it(
    'an alias the boundaries tsconfig does not list is reported, not skipped',
    () => {
      const paths = { '@/*': ['src/renderer/src/*'], '@shared/*': ['src/shared/*'] };
      const tsconfig = { compilerOptions: { moduleResolution: 'Bundler', baseUrl: '.', paths } };
      const { failed, output } = deadcode({
        write: { 'tsconfig.boundaries.json': JSON.stringify(tsconfig) },
        append: { [FILE.renderer]: "\nimport '@main/ipc-router';\n" },
      });

      expect(failed).toBe(true);
      expect(output).toContain(`error no-unresolved-import: ${FILE.renderer}`);
    },
    SLOW
  );

  it(
    'each finding prints its remedy under it',
    () => {
      const { output } = plant('renderer', "import '@main/ipc-router';");

      expect(output).toContain('The renderer runs in a web page: it has no Node and no Electron.');
      expect(output).toContain('Dead code, a cycle or a process-boundary import');
    },
    SLOW
  );
});

describe('G12e what each process may import still passes', () => {
  it(
    'electron and Node in main, electron in the preload, @shared everywhere, a package in the renderer, shared importing shared',
    () => {
      const { failed, output } = deadcode({
        write: { 'src/shared/more.ts': 'export const more = 1;\n' },
        append: {
          'src/main/index.ts':
            "\nimport fs from 'node:fs';\nimport { BrowserWindow } from 'electron';\nimport '@main/ipc-router';\nimport * as ipc from '@shared/ipc';\n\nvoid [fs, BrowserWindow, ipc];\n",
          'src/preload/index.ts':
            "\nimport type * as e from 'electron';\nimport '@preload/index.d';\nimport type * as s from '@shared/ipc';\n\nexport type Both = [typeof e, typeof s];\n",
          'src/renderer/src/main.tsx':
            "\nimport * as ipc from '@shared/ipc';\nimport '@/store';\n\nvoid ipc;\n",
          'src/shared/ipc.ts': "\nimport { more } from '@shared/more';\n\nvoid more;\n",
        },
      });

      expect(output).not.toContain('error ');
      expect(failed).toBe(false);
    },
    SLOW
  );
});
