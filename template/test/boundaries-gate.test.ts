import { dirname, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REMEDY } from './helpers/boundary-config';
import { deadcode, inCopy, SLOW } from './helpers/deadcode';

// G12e: the process boundaries. The matrix of plants runs dependency-cruiser ONCE over a scratch copy that holds one
// planted file per case (each case then asserts its own line of the one output, and the total pins that nothing else
// was reported). The wiring is shown through the real `npm run deadcode`, one run per rule, asserting the exact
// remedy it prints. Nothing is planted in the real template: other tests read it in parallel.
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

const RENDERER_RULE = 'renderer-imports-main-or-preload';
const RENDERER_NODE = 'renderer-imports-node-or-electron';
const RENDERER_ELECTRON = 'renderer-imports-electron';
const PRELOAD_RULE = 'preload-imports-outside-shared';
const MAIN_RULE = 'main-imports-renderer-or-preload';
const SHARED_RULE = 'shared-imports-outside-shared';

const relativeSpecifier = (from: Folder, to: Folder): string => {
  const path = relative(dirname(FILE[from]), TARGET[to]);

  return path.startsWith('.') ? path : `./${path}`;
};

type Case = [name: string, from: Folder, text: string, rule: string];

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
const FORMS: [string, (specifier: string) => string][] = [
  ['import type', (s) => `import type * as t from '${s}';`],
  ['dynamic import()', (s) => `void import('${s}');`],
  ['require()', (s) => `void require('${s}');`],
  ['export * from', (s) => `export * from '${s}';`],
];
const FORM_SAMPLE: [Folder, Folder, string][] = [
  ['renderer', 'main', RENDERER_RULE],
  ['preload', 'main', PRELOAD_RULE],
  ['main', 'preload', MAIN_RULE],
  ['shared', 'main', SHARED_RULE],
];

const CASES: Case[] = [
  ...DIRECTIONS.flatMap(([from, to, rule]): Case[] => [
    [`${from} -> ${to}, relative`, from, `import '${relativeSpecifier(from, to)}';`, rule],
    [`${from} -> ${to}, alias`, from, `import '${ALIAS[to]}';`, rule],
  ]),
  ...FORMS.flatMap(([form, write]): Case[] =>
    FORM_SAMPLE.map(([from, to, rule]): Case => [
      `${form}: ${from} -> ${to}`,
      from,
      write(ALIAS[to]),
      rule,
    ])
  ),
  ['electron in the renderer', 'renderer', "import 'electron';", RENDERER_ELECTRON],
  [
    'a type from electron in the renderer',
    'renderer',
    "import type * as e from 'electron';",
    RENDERER_ELECTRON,
  ],
  ['node:fs in the renderer', 'renderer', "import 'node:fs';", RENDERER_NODE],
  ['fs, no node: prefix, in the renderer', 'renderer', "import 'fs';", RENDERER_NODE],
  [
    'node:path through import() in the renderer',
    'renderer',
    "void import('node:path');",
    RENDERER_NODE,
  ],
  ['node:fs in the preload', 'preload', "import 'node:fs';", PRELOAD_RULE],
  ['fs, no node: prefix, in the preload', 'preload', "import 'fs';", PRELOAD_RULE],
  ['a package in the preload', 'preload', "import 'zustand';", PRELOAD_RULE],
  ['electron in shared', 'shared', "import 'electron';", SHARED_RULE],
  ['node:fs in shared', 'shared', "import 'node:fs';", SHARED_RULE],
  ['fs, no node: prefix, in shared', 'shared', "import 'fs';", SHARED_RULE],
  ['a package in shared', 'shared', "import 'zustand';", SHARED_RULE],
  ['react in shared', 'shared', "import 'react';", SHARED_RULE],
  ['an electron-only package in shared', 'shared', "import 'electron-updater';", SHARED_RULE],
  ['a subpath of a package not on the list', 'shared', "import 'zustand/middleware';", SHARED_RULE],
];

// Case i is the file `plant-i.ts` beside FILE[from]: its only import is the case's line.
const plantPath = (index: number, from: Folder): string =>
  `${dirname(FILE[from])}/plant-${index}.ts`;
const plantFiles = (): Record<string, string> =>
  Object.fromEntries(CASES.map(([, from, line], i) => [plantPath(i, from), `${line}\n`]));

let matrixRun: { failed: boolean; output: string } | undefined;
const matrix = () => {
  matrixRun ??= inCopy({ write: plantFiles() }, [
    'npx',
    'depcruise',
    '-c',
    '.dependency-cruiser.cjs',
    '--ts-config',
    'tsconfig.boundaries.json',
    '-T',
    'err-long',
    'src',
  ]);

  return matrixRun;
};

describe('G12e every planted import across the split is a finding, naming its rule and its file', () => {
  it(
    'the run fails, and reports exactly one finding per planted file',
    () => {
      const { failed, output } = matrix();

      expect(failed).toBe(true);
      expect(output).toContain(
        `x ${CASES.length} dependency violations (${CASES.length} errors, 0 warnings)`
      );
    },
    SLOW
  );

  it.each(
    CASES.map(([name, from, , rule], i): [string, string, string] => [
      name,
      rule,
      plantPath(i, from),
    ])
  )(
    '%s',
    (_name, rule, path) => {
      expect(matrix().output).toContain(`error ${rule}: ${path} `);
    },
    SLOW
  );
});

// The wiring: the real script, one run per rule. The printed remedy is that rule's own, word for word.
const normal = (text: string): string => text.replace(/\s+/g, ' ');
const E2E: [string, Folder, string, string][] = [
  [RENDERER_RULE, 'renderer', "import '@main/ipc-router';", REMEDY.renderer],
  [RENDERER_NODE, 'renderer', "import 'node:fs';", REMEDY.renderer],
  [RENDERER_ELECTRON, 'renderer', "import 'electron';", REMEDY.renderer],
  [PRELOAD_RULE, 'preload', "import '@main/ipc-router';", REMEDY.preload],
  [MAIN_RULE, 'main', "import '@preload/index';", REMEDY.main],
  [SHARED_RULE, 'shared', "import 'node:fs';", REMEDY.shared],
];

describe("G12e npm run deadcode fails on each rule and prints that rule's remedy", () => {
  it.each(E2E)(
    '%s',
    (rule, from, line, remedy) => {
      const { failed, output } = deadcode({ append: { [FILE[from]]: `\n${line}\n` } });
      const printed = normal(output);

      expect(failed).toBe(true);
      expect(output).toContain(`error ${rule}: ${FILE[from]} `);
      expect(printed).toContain(`error ${rule}: ${FILE[from]} `);
      expect(printed).toContain(remedy);
      expect(printed).toContain('Dead code, a cycle or a process-boundary import');
      expect(printed.split(remedy)).toHaveLength(2);
    },
    SLOW
  );

  // An alias Knip knows but tsconfig.boundaries.json does not: Knip passes, so only this rule can stop it.
  it(
    'no-unresolved-import: an alias the boundaries tsconfig does not list is reported with its remedy',
    () => {
      const paths = { '@/*': ['src/renderer/src/*'], '@shared/*': ['src/shared/*'] };
      const tsconfig = { compilerOptions: { moduleResolution: 'Bundler', baseUrl: '.', paths } };
      const { failed, output } = deadcode({
        write: { 'tsconfig.boundaries.json': JSON.stringify(tsconfig) },
        append: { [FILE.renderer]: "\nimport '@main/ipc-router';\n" },
      });

      expect(failed).toBe(true);
      expect(output).toContain(`error no-unresolved-import: ${FILE.renderer} `);
      expect(normal(output)).toContain(REMEDY.unresolved);
    },
    SLOW
  );
});

describe('AF6 an electron subpath is not an alias', () => {
  it(
    'electron/renderer in the renderer is reported unresolved, and the remedy says what to do instead',
    () => {
      const { failed, output } = deadcode({
        append: { [FILE.renderer]: "\nimport 'electron/renderer';\n" },
      });

      expect(failed).toBe(true);
      expect(output).toContain(`error no-unresolved-import: ${FILE.renderer} `);
      expect(normal(output)).toContain(REMEDY.unresolved);
      expect(REMEDY.unresolved).toContain('ask the main process over IPC through the preload API');
    },
    SLOW
  );
});

describe('G12e what each process may import still passes', () => {
  it(
    'electron and Node in main, electron in the preload, @shared everywhere, a package in the renderer, shared importing shared, zod and @appydave/core',
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
          'src/shared/ipc.ts':
            "\nimport { more } from '@shared/more';\nimport { z } from 'zod';\nimport { createStore } from '@appydave/core';\n\nvoid [more, z, createStore];\n",
        },
      });

      expect(output).not.toContain('error ');
      expect(failed).toBe(false);
    },
    SLOW
  );
});
