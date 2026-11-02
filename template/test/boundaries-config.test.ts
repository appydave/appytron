import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Change, deadcode, inCopy, SLOW } from './helpers/deadcode';
import {
  type Config,
  config,
  ELECTRON,
  PINNED,
  SHARED_ALLOWED,
  type Rule,
} from './helpers/boundary-config';
import { manifest } from './helpers/manifest';
import { root } from './helpers/scratch';

// G12e: the boundary rules pinned whole, and each way of weakening them shown to let a violation through (a mutant
// that the pin must therefore catch). Mutants run the real script in a scratch copy with the edited config.
describe('G12e the reviewed boundary rules', () => {
  it('are exactly these, every one an error with a remedy written for the reader', () => {
    expect(config()).toEqual(PINNED);
  });

  it('let src/shared import exactly zod and @appydave/core: the list matches those two packages and nothing near them', () => {
    const allowed = new RegExp(SHARED_ALLOWED);

    for (const path of [
      'node_modules/zod/index.js',
      '../../node_modules/@appydave/core/dist/index.js',
      'node_modules/.pnpm/zod@4.6.7/node_modules/zod/index.js',
    ]) {
      expect(allowed.test(path), path).toBe(true);
    }

    for (const path of [
      'node_modules/zustand/index.js',
      'node_modules/zod-validation/index.js',
      'node_modules/@appydave/other/index.js',
      'node_modules/@appydave/core-extra/index.js',
    ]) {
      expect(allowed.test(path), path).toBe(false);
    }
  });

  it('are scanned over src, lint, tests and the root configs, with the tsconfig that lists every alias', () => {
    expect(manifest().scripts.deadcode).toContain(
      'depcruise -c .dependency-cruiser.cjs --ts-config tsconfig.boundaries.json -T err-long src lint test vitest.config.ts eslint.config.js electron.vite.config.ts'
    );
  });

  it('tsconfig.boundaries.json resolves the way the builds do: bundler resolution, ESNext, only the alias list', () => {
    const tsconfig = JSON.parse(readFileSync(join(root, 'tsconfig.boundaries.json'), 'utf8'));

    expect(tsconfig.include).toEqual(['src/shared/**/*']);
    expect(tsconfig.compilerOptions).toMatchObject({
      module: 'ESNext',
      moduleResolution: 'Bundler',
      baseUrl: '.',
    });
    expect(Object.keys(tsconfig.compilerOptions).sort()).toEqual([
      'baseUrl',
      'module',
      'moduleResolution',
      'paths',
    ]);
  });

  it('use the alias list of tsconfig.boundaries.json, which agrees with every other place that lists an alias', () => {
    const paths = (file: string): Record<string, string[]> =>
      JSON.parse(readFileSync(join(root, file), 'utf8')).compilerOptions.paths;
    const boundaries = paths('tsconfig.boundaries.json');

    expect(boundaries).toEqual({
      '@/*': ['src/renderer/src/*'],
      '@shared/*': ['src/shared/*'],
      '@main/*': ['src/main/*'],
      '@preload/*': ['src/preload/*'],
      '@lint/*': ['lint/*'],
      '@root/*': ['./*'],
    });

    for (const file of ['tsconfig.node.json', 'tsconfig.web.json', 'tsconfig.tests.json']) {
      for (const [alias, target] of Object.entries(paths(file))) {
        expect(boundaries[alias], `${alias} in ${file}`).toEqual(target);
      }
    }
  });
});

interface Mutant {
  name: string;
  edit: (c: Config) => void;
  // The one violation this edit lets through.
  file: string;
  line: string;
  tsconfig?: Record<string, string[]>;
}

const rule = (c: Config, name: string): Rule => {
  const found = c.forbidden.find((r) => r.name === name);

  if (!found) {
    throw new Error(`no rule ${name}`);
  }

  return found;
};

const drop = (name: string) => (c: Config) => {
  c.forbidden = c.forbidden.filter((r) => r.name !== name);
};

const RENDERER = 'src/renderer/src/main.tsx';
const PRELOAD = 'src/preload/index.ts';
const MAIN = 'src/main/index.ts';
const SHARED = 'src/shared/ipc.ts';

const MUTANTS: Mutant[] = [
  {
    name: 'renderer-main-preload rule dropped',
    edit: drop('renderer-imports-main-or-preload'),
    file: RENDERER,
    line: "import '@main/ipc-router';",
  },
  {
    name: 'renderer node rule dropped',
    edit: drop('renderer-imports-node-or-electron'),
    file: RENDERER,
    line: "import 'node:fs';",
  },
  {
    name: 'renderer electron rule dropped',
    edit: drop('renderer-imports-electron'),
    file: RENDERER,
    line: "import 'electron';",
  },
  {
    name: 'preload rule dropped',
    edit: drop('preload-imports-outside-shared'),
    file: PRELOAD,
    line: "import '@main/ipc-router';",
  },
  {
    name: 'main rule dropped',
    edit: drop('main-imports-renderer-or-preload'),
    file: MAIN,
    line: "import '@preload/index';",
  },
  {
    name: 'shared allow-list grown by one package',
    edit: (c) => {
      rule(c, 'shared-imports-outside-shared').to.pathNot = [
        '^src/shared/',
        'node_modules/(zod|@appydave/core|zustand)/',
      ];
    },
    file: SHARED,
    line: "import 'zustand';",
  },
  {
    name: 'shared allow-list is any package',
    edit: (c) => {
      rule(c, 'shared-imports-outside-shared').to.pathNot = ['^src/shared/', 'node_modules/'];
    },
    file: SHARED,
    line: "import 'zustand';",
  },
  {
    name: 'shared allow-list lets electron through',
    edit: (c) => {
      rule(c, 'shared-imports-outside-shared').to.pathNot = ['^src/shared/', ELECTRON];
    },
    file: SHARED,
    line: "import 'electron';",
  },
  {
    name: 'shared rule dropped',
    edit: drop('shared-imports-outside-shared'),
    file: SHARED,
    line: "import 'node:fs';",
  },
  {
    name: 'renderer rule from narrowed to one folder',
    edit: (c) => {
      rule(c, 'renderer-imports-main-or-preload').from.path = '^src/renderer/src/components/';
    },
    file: RENDERER,
    line: "import '@main/ipc-router';",
  },
  {
    name: 'main rule to narrowed to renderer only',
    edit: (c) => {
      rule(c, 'main-imports-renderer-or-preload').to.path = '^src/renderer/';
    },
    file: MAIN,
    line: "import '@preload/index';",
  },
  {
    name: 'preload rule to widened to main',
    edit: (c) => {
      rule(c, 'preload-imports-outside-shared').to.pathNot = [
        '^src/(preload|shared|main)/',
        ELECTRON,
      ];
    },
    file: PRELOAD,
    line: "import '@main/ipc-router';",
  },
  {
    name: 'preload electron exemption widened to every package',
    edit: (c) => {
      rule(c, 'preload-imports-outside-shared').to.pathNot = [
        '^src/(preload|shared)/',
        'node_modules/',
      ];
    },
    file: PRELOAD,
    line: "import 'zustand';",
  },
  {
    name: 'preload rule severity warn',
    edit: (c) => {
      rule(c, 'preload-imports-outside-shared').severity = 'warn';
    },
    file: PRELOAD,
    line: "import '@main/ipc-router';",
  },
  {
    name: 'type-only imports not followed (tsPreCompilationDeps off)',
    edit: (c) => {
      c.options.tsPreCompilationDeps = false;
    },
    file: RENDERER,
    line: "import type * as t from '@main/ipc-router';",
  },
  {
    name: 'no-unresolved rule dropped, @main not listed',
    edit: drop('no-unresolved-import'),
    file: RENDERER,
    line: "import '@main/ipc-router';",
    tsconfig: { '@/*': ['src/renderer/src/*'], '@shared/*': ['src/shared/*'] },
  },
];

const asScratch = (m: Mutant): Change => {
  const edited = config();

  m.edit(edited);

  const tsconfig = {
    compilerOptions: { moduleResolution: 'Bundler', baseUrl: '.', paths: m.tsconfig },
  };

  return {
    write: {
      '.dependency-cruiser.cjs': `module.exports = ${JSON.stringify(edited)};\n`,
      ...(m.tsconfig ? { 'tsconfig.boundaries.json': JSON.stringify(tsconfig) } : {}),
    },
    append: { [m.file]: `\n${m.line}\n` },
  };
};

describe('G12e each weakening of the rules lets a violation through, so the pin is what stops it', () => {
  it.each(MUTANTS)(
    '$name',
    (mutant) => {
      const edited = config();

      mutant.edit(edited);

      expect(edited).not.toEqual(PINNED);
      expect(deadcode(asScratch(mutant)).failed).toBe(false);
    },
    SLOW
  );

  it(
    'the same planted lines fail under the real rules, so a pass above is the edit',
    () => {
      for (const { file, line } of MUTANTS.filter((m) => !m.tsconfig)) {
        const { failed } = deadcode({ append: { [file]: `\n${line}\n` } });

        expect(failed, `${file}: ${line}`).toBe(true);
      }
    },
    SLOW * 4
  );

  it(
    'a scan without src/preload does not see a preload import of main',
    () => {
      const { failed } = inCopy({ append: { [PRELOAD]: "\nimport '@main/ipc-router';\n" } }, [
        'npx',
        'depcruise',
        '-c',
        '.dependency-cruiser.cjs',
        '--ts-config',
        'tsconfig.boundaries.json',
        'src/main',
        'src/renderer',
        'src/shared',
      ]);

      expect(failed).toBe(false);
    },
    SLOW
  );

  it(
    'the web tsconfig does not list @main, which is why the scan reads tsconfig.boundaries.json',
    () => {
      const edited = config();

      drop('no-unresolved-import')(edited);

      const { failed } = inCopy(
        {
          write: { '.dependency-cruiser.cjs': `module.exports = ${JSON.stringify(edited)};\n` },
          append: { [RENDERER]: "\nimport '@main/ipc-router';\n" },
        },
        [
          'npx',
          'depcruise',
          '-c',
          '.dependency-cruiser.cjs',
          '--ts-config',
          'tsconfig.web.json',
          'src',
        ]
      );

      expect(failed).toBe(false);
    },
    SLOW
  );
});
