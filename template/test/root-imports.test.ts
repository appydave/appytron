import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import electronViteConfig from '@root/electron.vite.config';
import vitestConfig from '@root/vitest.config';
import { errorMessages, lint, root } from './helpers/eslint-probe';

// Runs the real eslint.config.js over probe text, so the test proves the gate is wired, not the rule.
const RULE = 'no-restricted-syntax';
const FILES = [
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/renderer/src/App.tsx',
  'test/eslint-size.test.ts',
  'vitest.config.ts',
];

// Each form of a parent-relative specifier the rule must catch.
const FORBIDDEN: [string, string][] = [
  ['static import', "import { a } from '../a';\nexport const b = a;\n"],
  ['import type', "import type { A } from '../a';\nexport type B = A;\n"],
  ['export from', "export { a } from '../a';\n"],
  ['export *', "export * from '../a';\n"],
  ['dynamic import()', "export const b = await import('../a');\n"],
  ['template-literal import()', 'export const b = await import(`../a`);\n'],
  ['template-literal import', 'export const b = await import(`../${name}`);\n'],
  ['require()', "export const b = require('../a');\n"],
  ['import = require', "import a = require('../a');\nexport { a };\n"],
  ['typeof import type', "export type B = typeof import('../a');\n"],
  ['vi.mock', "vi.mock('../a');\n"],
  ['vi.importActual', "export const b = await vi.importActual('../a');\n"],
  ['vi.doMock', "vi.doMock('../a');\n"],
  ['vi.unmock', "vi.unmock('../a');\n"],
  ['vi.doUnmock', "vi.doUnmock('../a');\n"],
  ['vi.importMock', "export const b = await vi.importMock('../a');\n"],
  ['vi.requireActual', "export const b = vi.requireActual('../a');\n"],
  ['vi.requireMock', "export const b = vi.requireMock('../a');\n"],
  ['bare parent', "import { a } from '..';\nexport const b = a;\n"],
  ['dot-slash parent', "import { a } from './../a';\nexport const b = a;\n"],
  ['doubled slash parent', "import { a } from './/../a';\nexport const b = a;\n"],
];

// Strings and specifiers that are not a parent import: they must stay allowed.
const ALLOWED: [string, string][] = [
  ['same-folder import', "import { a } from './a';\nexport const b = a;\n"],
  ['root alias', "import { a } from '@shared/ipc';\nexport const b = a;\n"],
  ['path string for the filesystem', "export const p = join(__dirname, '../preload/index.mjs');\n"],
  ['plain string that starts with ..', "export const p = '../escape.txt';\n"],
  ['package path containing /../', "import { a } from 'pkg/../y';\nexport const b = a;\n"],
  ['dotted name, not a parent', "import { a } from '..hidden/a';\nexport const b = a;\n"],
];

async function ruleCount(source: string, file: string): Promise<number> {
  const fatal = (await lint(source, file)).find((message) => message.fatal);

  if (fatal) {
    throw new Error(`probe did not parse: ${fatal.message}`);
  }

  return (await errorMessages(source, file)).filter((message) => message.ruleId === RULE).length;
}

describe('no parent-relative imports', () => {
  describe.each(FILES)('in %s', (file) => {
    it.each(FORBIDDEN)('rejects %s', async (_name, source) => {
      expect(await ruleCount(source, file)).toBe(1);
    });

    it.each(ALLOWED)('allows %s', async (_name, source) => {
      expect(await ruleCount(source, file)).toBe(0);
    });
  });

  it('says what to write instead', async () => {
    const [hit] = await errorMessages(
      "import { a } from '../a';\nexport const b = a;\n",
      'src/main/index.ts'
    );

    expect(hit?.message).toContain('use a root alias');
    expect(hit?.message).toContain('@shared/*');
  });

  it('keeps the member caps beside it (one options array per file)', async () => {
    const members = Array.from({ length: 31 }, (_v, i) => `  m${i}: number;`).join('\n');
    const source = `export interface I {\n${members}\n}\n`;

    expect(await ruleCount(source, 'src/main/index.ts')).toBe(1);
  });
});

describe('plain JavaScript files are held to it too', () => {
  it.each([
    "import { a } from '../a.js';\nexport const b = a;\n",
    "export const b = await import('../a.js');\n",
    "export const b = require('../a.js');\n",
  ])('rejects %s', async (source) => {
    expect(await ruleCount(source, 'lint/probe.js')).toBe(1);
  });
});

describe('the root aliases exist in every place that resolves them', () => {
  const dir = (path: string) => resolve(root, path);
  const tsconfigPaths = (file: string): Record<string, string[]> =>
    JSON.parse(readFileSync(resolve(root, file), 'utf8').replace(/^\s*\/\/.*$/gm, ''))
      .compilerOptions.paths;

  it('@shared is in the main, preload and renderer builds', () => {
    const shared = { resolve: { alias: { '@shared': dir('src/shared') } } };

    expect(electronViteConfig).toMatchObject({ main: shared, preload: shared, renderer: shared });
    expect(electronViteConfig).toMatchObject({
      renderer: { resolve: { alias: { '@': dir('src/renderer/src') } } },
    });
  });

  it('the tests resolve @shared, @main, @preload, @lint and @root', () => {
    expect(vitestConfig.resolve?.alias).toEqual({
      '@shared': dir('src/shared'),
      '@main': dir('src/main'),
      '@preload': dir('src/preload'),
      '@lint': dir('lint'),
      '@root': dir('.'),
    });
  });

  it('the type checker resolves them too', () => {
    expect(tsconfigPaths('tsconfig.node.json')['@shared/*']).toEqual(['src/shared/*']);
    expect(tsconfigPaths('tsconfig.web.json')).toEqual({
      '@/*': ['src/renderer/src/*'],
      '@shared/*': ['src/shared/*'],
    });
  });
});
