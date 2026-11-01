import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { findDisableDirectives } from '../lint/no-disable-directives.js';

const root = resolve(import.meta.dirname, '..');
const oxlint = resolve(root, 'node_modules/.bin/oxlint');
const scratch: string[] = [];

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'g02-'));

  scratch.push(dir);

  return dir;
}

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Runs the real Oxlint binary with the real .oxlintrc.json over probe text in a scratch folder.
function oxlintRun(source: string): { failed: boolean; output: string } {
  const dir = scratchDir();

  writeFileSync(join(dir, 'probe.ts'), source);

  const run = spawnSync(
    oxlint,
    ['--deny-warnings', '--format=default', '-c', join(root, '.oxlintrc.json'), dir],
    {
      encoding: 'utf8',
    }
  );

  return { failed: run.status !== 0, output: run.stdout };
}

describe('G02 Oxlint type-lie gate, run through the real .oxlintrc.json', () => {
  describe.each([
    ['consistent-type-assertions', 'declare const v: unknown;\nexport const s = v as string;\n'],
    ['consistent-type-assertions', 'declare const v: unknown;\nexport const s = <string>v;\n'],
    ['no-explicit-any', 'export const a: any = 1;\n'],
    ['no-non-null-assertion', 'declare const v: string | null;\nexport const s = v!;\n'],
  ])('%s', (rule, bad) => {
    it('fails a violation and names the rule', () => {
      const { failed, output } = oxlintRun(bad);

      expect(failed).toBe(true);
      expect(output).toContain(rule);
    });
  });

  it('lets the allowed forms through: satisfies, unknown, a real check', () => {
    const good =
      'declare const v: string | null;\nexport const a = { n: 1 } satisfies { n: number };\n' +
      'export const b: unknown = a;\nexport const c = v ?? "";\n';

    expect(oxlintRun(good).failed).toBe(false);
  });

  it('tells the agent what to write instead of the cast', () => {
    expect(
      oxlintRun('declare const v: unknown;\nexport const s = v as string;\n').output
    ).toContain('satisfies');
  });
});

// The config is JSON with // comments: drop whole-line comments, then parse.
const config: unknown = JSON.parse(
  readFileSync(join(root, '.oxlintrc.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '')
);
const EXEMPT = 'src/main/ipc-router.ts';
const CAST = 'declare const v: unknown;\nexport const s = v as string;\n';

// Overrides match paths relative to the config, so the probe gets a scratch copy of the real config
// with the file at the path under test (never planted in the real template: other tests read it).
function oxlintAt(file: string, source: string): { failed: boolean; output: string } {
  const dir = scratchDir();

  mkdirSync(join(dir, file, '..'), { recursive: true });
  writeFileSync(join(dir, '.oxlintrc.json'), readFileSync(join(root, '.oxlintrc.json')));
  writeFileSync(join(dir, file), source);

  const run = spawnSync(
    oxlint,
    ['--deny-warnings', '--format=default', '-c', '.oxlintrc.json', '.'],
    {
      cwd: dir,
      encoding: 'utf8',
    }
  );

  return { failed: run.status !== 0, output: run.stdout };
}

function configFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return ['node_modules', 'out', '.git'].includes(entry.name)
        ? []
        : configFiles(join(dir, entry.name)).map((f) => `${entry.name}/${f}`);
    }

    return entry.name === '.oxlintrc.json' ? [entry.name] : [];
  });
}

describe('G02 Oxlint allowlist: one file may cast, nothing else', () => {
  // The whole file is pinned, not just overrides: widening ignorePatterns, adding a rule off or
  // dropping a plugin would switch the gate off silently. Any change must edit this test too.
  it('is exactly the reviewed config, with one exempt file named exactly', () => {
    expect(config).toEqual({
      $schema: './node_modules/oxlint/configuration_schema.json',
      plugins: ['typescript', 'react'],
      ignorePatterns: ['**/out/**', '**/dist/**', '**/coverage/**', '**/node_modules/**'],
      rules: {
        'typescript/no-explicit-any': 'error',
        'typescript/no-non-null-assertion': 'error',
        'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
        'no-magic-numbers': [
          'error',
          {
            ignore: [-1, 0, 1, 2],
            detectObjects: false,
            ignoreDefaultValues: true,
            ignoreNumericLiteralTypes: true,
          },
        ],
      },
      overrides: [
        { files: ['test/**'], rules: { 'no-magic-numbers': 'off' } },
        { files: [EXEMPT], rules: { 'typescript/consistent-type-assertions': 'off' } },
      ],
    });
  });

  // Oxlint finds a nested .oxlintrc.json on its own and applies it below its folder, which would
  // switch these rules off there without touching the file pinned above.
  it('is the only .oxlintrc.json in the tree', () => {
    expect(configFiles(root)).toEqual(['.oxlintrc.json']);
  });

  it('lets the exempt file cast', () => {
    expect(oxlintAt(EXEMPT, CAST).failed).toBe(false);
  });

  it('still fails a cast in any other file, including a sibling and a same-named file elsewhere', () => {
    for (const file of ['src/main/other.ts', 'src/renderer/src/ipc-router.ts', 'ipc-router.ts']) {
      expect(oxlintAt(file, CAST).failed).toBe(true);
    }
  });

  it('still fails every other rule inside the exempt file', () => {
    expect(oxlintAt(EXEMPT, 'export const a: any = 1;\n').output).toContain('no-explicit-any');
    expect(
      oxlintAt(EXEMPT, 'declare const v: string | null;\nexport const s = v!;\n').output
    ).toContain('no-non-null-assertion');
  });
});

describe('G05 no-magic-numbers, run through the real .oxlintrc.json', () => {
  const SRC = 'src/main/probe.ts';

  it.each([
    ['a bare number as an argument', 'declare function f(n: number): void;\nf(1200);\n'],
    ['a decimal', 'declare function f(n: number): void;\nf(3.14);\n'],
    ['arithmetic', 'export const t = (x: number): number => x * 60;\n'],
    ['a class property', 'export class K {\n  size = 42;\n}\n'],
    ['an array element', 'export const a = [9];\n'],
    ['a nullish fallback', 'export const w = (o: { w?: number }): number => o.w ?? 1200;\n'],
    ['a number just past the ignore list', 'declare function f(n: number): void;\nf(3);\n'],
    [
      'a number used in code beside a literal type',
      'export type T = 42;\ndeclare function f(n: number): void;\nf(42);\n',
    ],
    [
      'a number in an expression (the type allowance does not leak)',
      'declare const y: number;\nexport const x = 42 * y;\n',
    ],
  ])('fails %s and tells the agent to use a named constant', (_name, source) => {
    const { failed, output } = oxlintAt(SRC, source);

    expect(failed).toBe(true);
    expect(output).toContain('no-magic-numbers');
    expect(output).toContain('named constant');
  });

  it.each([
    ['a named constant', 'export const WIDTH = 1200;\n'],
    ['a default parameter (ignoreDefaultValues)', 'export const f = (x = 500): number => x;\n'],
    ['a numeric literal type (ignoreNumericLiteralTypes)', 'export type T = 42;\n'],
    ['a union of numeric literal types', 'export type Status = 200 | 404;\n'],
    ['an object literal value (detectObjects off)', 'export const o = { port: 7 };\n'],
    [
      'the ignore list -1, 0, 1, 2',
      'declare function f(n: number): void;\nf(-1);\nf(0);\nf(1);\nf(2);\n',
    ],
  ])('allows %s', (_name, source) => {
    expect(oxlintAt(SRC, source).failed).toBe(false);
  });

  it('is out of scope in test/ and in scope in src/ and the other environments', () => {
    const bad = 'declare function f(n: number): void;\nf(1200);\n';

    expect(oxlintAt('test/probe.test.ts', bad).failed).toBe(false);

    for (const file of ['src/renderer/src/probe.tsx', 'src/preload/probe.ts', 'test-utils/p.ts']) {
      expect(oxlintAt(file, bad).failed).toBe(true);
    }
  });

  it('fails in the exempt cast file too: the exemption is for assertions only', () => {
    expect(oxlintAt(EXEMPT, 'declare function f(n: number): void;\nf(1200);\n').failed).toBe(true);
  });
});

describe('G02 one owner per rule', () => {
  it('ESLint has the Oxlint-owned rules switched off', async () => {
    const config: { rules: Record<string, unknown> } = await new ESLint({
      cwd: root,
    }).calculateConfigForFile(resolve(root, 'src/main/index.ts'));
    const off = (rule: string) => [0, 'off'].includes([config.rules[rule]].flat()[0]);

    expect(off('@typescript-eslint/no-explicit-any')).toBe(true);
    expect(off('@typescript-eslint/no-non-null-assertion')).toBe(true);
    expect(off('@typescript-eslint/consistent-type-assertions')).toBe(true);
  });

  it('ESLint does not turn the assertion rule back on for the exempt file', async () => {
    const config: { rules: Record<string, unknown> } = await new ESLint({
      cwd: root,
    }).calculateConfigForFile(resolve(root, EXEMPT));

    expect([[config.rules['@typescript-eslint/consistent-type-assertions']].flat()[0]]).toEqual([
      0,
    ]);
  });
});

describe('G02 the lint script CI and agents run', () => {
  // Nothing else reads package.json: drop a command or a flag and every other test stays green.
  it('is exactly: guard, then Oxlint (deny warnings, readable output), then ESLint (no warnings)', () => {
    const pkg: { scripts: Record<string, string> } = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8')
    );

    expect(pkg.scripts.lint).toBe(
      'node lint/no-disable-directives.js && oxlint --deny-warnings --format=default && eslint . --max-warnings 0'
    );
  });
});

describe('G02 disable-directive guard', () => {
  // Pieces, so this file does not trip the guard it tests.
  const directives = [
    'eslint' + '-disable-next-line curly',
    'oxlint' + '-disable no-explicit-any',
    '@ts' + '-ignore',
    '@ts' + '-expect-error',
    '@ts' + '-nocheck',
  ];

  it.each(directives)('finds %s in source, with its file and line', (directive) => {
    const dir = scratchDir();

    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'a.ts'), `const a = 1;\n// ${directive}\n`);

    expect(findDisableDirectives(dir)).toEqual([expect.stringMatching(/^src\/a\.ts:2: /)]);
  });

  it.each(['lint/x.js', 'test/x.ts', 'src/main/x.ts', 'electron.vite.config.ts'])(
    'finds one planted at %s in a scratch copy of the real layout',
    (file) => {
      const dir = scratchDir();

      mkdirSync(join(dir, file, '..'), { recursive: true });
      writeFileSync(join(dir, file), `// ${'@ts' + '-nocheck'}\n`);

      expect(findDisableDirectives(dir)).toEqual([`${file}:1: ${'@ts' + '-nocheck'}`]);
    }
  );

  it('finds one in a .tsx and a root .js, and ignores node_modules and out', () => {
    const dir = scratchDir();
    const directive = '@ts' + '-ignore';

    for (const sub of ['src', 'node_modules/x', 'out']) {
      mkdirSync(join(dir, sub), { recursive: true });
      writeFileSync(join(dir, sub, 'f.tsx'), `// ${directive}\n`);
    }

    writeFileSync(join(dir, 'root.js'), `// ${directive}\n`);

    expect(findDisableDirectives(dir).sort()).toEqual([
      `root.js:1: ${directive}`,
      `src/f.tsx:1: ${directive}`,
    ]);
  });

  it('is clean on a file with none, and on the real template', () => {
    const dir = scratchDir();

    writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\n');

    expect(findDisableDirectives(dir)).toEqual([]);
    expect(findDisableDirectives(root)).toEqual([]);
  });
});
