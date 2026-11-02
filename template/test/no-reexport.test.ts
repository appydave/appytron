import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inCopy, SLOW } from './helpers/deadcode';
import { ERROR, eslint, errorMessages, root } from './helpers/eslint-probe';

// G16: a module exports only what it declares. Runs the real eslint.config.js over probe text, so the
// test proves the gate is wired in every folder, not just that the rule works.
const RULE = 'exports/no-reexport';
const ALL_FILES = [
  'src/main/index.ts',
  'src/preload/index.ts',
  'src/renderer/src/App.tsx',
  'src/shared/ipc.ts',
  'test/eslint-size.test.ts',
  'lint/probe.js',
  'vitest.config.ts',
];
const TYPESCRIPT_ONLY = ALL_FILES.filter((file) => !file.endsWith('.js'));

const WHY = 'A re-export hides the real dependency from import-graph checks.';
const say = (what: string): string =>
  `No re-exports (${what}). Import it from its real module where it is used. ${WHY}`;

// Each form of re-export the rule must catch, with the message it prints.
const FORBIDDEN: [string, string, string][] = [
  ['export *', "export * from './a';\n", say("export * from './a'")],
  ['export * as ns', "export * as ns from './a';\n", say("export * from './a'")],
  ['export { x } from', "export { x } from './a';\n", say("export { .. } from './a'")],
  [
    'import x; export { x }',
    "import { x } from './a';\nexport { x };\n",
    say("imported 'x' exported again"),
  ],
  [
    'import default; export { d }',
    "import d from './a';\nexport { d };\n",
    say("imported 'd' exported again"),
  ],
  [
    'import * as ns; export { ns }',
    "import * as ns from './a';\nexport { ns };\n",
    say("imported 'ns' exported again"),
  ],
  [
    'import x; export default x',
    "import x from './a';\nexport default x;\n",
    say("imported 'x' exported as default"),
  ],
];
// TypeScript-only syntax.
const FORBIDDEN_TS: [string, string, string][] = [
  [
    'export import C = X',
    "import { X } from './a';\nexport import C = X;\n",
    say('export import C = ..'),
  ],
  ['export import C = require', "export import C = require('./a');\n", say('export import C = ..')],
  [
    'import x; export default x as T',
    "import x from './a';\nexport default x as unknown;\n",
    say("imported 'x' exported as default"),
  ],
  [
    'import x; export default x satisfies T',
    "import x from './a';\nexport default x satisfies unknown;\n",
    say("imported 'x' exported as default"),
  ],
  [
    'import x; export default x!',
    "import x from './a';\nexport default x!;\n",
    say("imported 'x' exported as default"),
  ],
  [
    'import x = require; export = x as T',
    "import x = require('./a');\nexport = x as unknown;\n",
    say("imported 'x' exported with export ="),
  ],
  [
    'export type T = Imported',
    "import type { U } from './a';\nexport type T = U;\n",
    say("type 'T' is an alias of imported 'U'"),
  ],
  [
    'export type T = Namespace.Imported',
    "import type * as n from './a';\nexport type T = n;\n",
    say("type 'T' is an alias of imported 'n'"),
  ],
  ['export type { x } from', "export type { X } from './a';\n", say("export { .. } from './a'")],
  [
    'import type; export type { T }',
    "import type { T } from './a';\nexport type { T };\n",
    say("imported 'T' exported again"),
  ],
  [
    'import x = require; export = x',
    "import x = require('./a');\nexport = x;\n",
    say("imported 'x' exported with export ="),
  ],
];

// Exports that declare what they export: they must stay allowed.
const ALLOWED: [string, string][] = [
  ['export const', 'export const a = 1;\n'],
  ['export function', 'export function f() {\n  return 1;\n}\n'],
  ['export class', 'export class C {}\n'],
  ['export { localName }', 'const a = 1;\nexport { a };\n'],
  ['export { local as alias }', 'const a = 1;\nexport { a as b };\n'],
  ['export default of a local', 'const a = 1;\nexport default a;\n'],
  ['export default of an expression', 'export default 1;\n'],
  ['an import that is only used', "import { x } from './a';\nexport const y = x;\n"],
  [
    'an import beside an unrelated export',
    "import { x } from './a';\nconst y = x;\nexport { y };\n",
  ],
];
const ALLOWED_TS: [string, string][] = [
  ['export default of a local, cast', 'const a = 1;\nexport default a as number;\n'],
  ['export type T = a local type', 'type L = number;\nexport type T = L;\n'],
  [
    'export type T = a union with an import',
    "import type { U } from './a';\nexport type T = U | null;\n",
  ],
  ['export namespace member alias', 'namespace N {\n  export const a = 1;\n}\nexport { N };\n'],
  ['export type { T } of a local type', 'type T = number;\nexport type { T };\n'],
  ['export interface', 'export interface I {\n  a: number;\n}\n'],
  ['export type', 'export type T = number;\n'],
];

const hits = async (source: string, file: string) =>
  (await errorMessages(source, file)).filter((message) => message.ruleId === RULE);

describe('G16 no re-exports: every form is a finding, in every folder', () => {
  describe.each(ALL_FILES)('in %s', (file) => {
    it.each(FORBIDDEN)('rejects %s, with its message', async (_name, source, message) => {
      const found = await hits(source, file);

      expect(found.map((hit) => hit.message)).toEqual([message]);
    });

    it.each(ALLOWED)('allows %s', async (_name, source) => {
      expect(await hits(source, file)).toEqual([]);
    });
  });

  describe.each(TYPESCRIPT_ONLY)('in %s (TypeScript syntax)', (file) => {
    it.each(FORBIDDEN_TS)('rejects %s, with its message', async (_name, source, message) => {
      expect((await hits(source, file)).map((hit) => hit.message)).toEqual([message]);
    });

    it.each(ALLOWED_TS)('allows %s', async (_name, source) => {
      expect(await hits(source, file)).toEqual([]);
    });
  });

  it('does not see a binding copied through a variable (the documented gap)', async () => {
    const source = "import { x } from './a';\nconst y = x;\nexport { y };\n";

    expect(await hits(source, 'src/main/index.ts')).toEqual([]);
  });

  it.each([
    ['a derived type', "import type { U } from './a';\nexport type T = U<number>;\n"],
    [
      'an interface extending an import',
      "import type { U } from './a';\nexport interface I extends U {}\n",
    ],
    ['a member of an import as default', "import x from './a';\nexport default x.y;\n"],
  ])('does not see %s (documented gaps)', async (_name, source) => {
    expect(await hits(source, 'src/main/index.ts')).toEqual([]);
  });

  it('reports each re-exported name once, so two names are two findings', async () => {
    const source = "import { a, b } from './a';\nexport { a, b };\n";

    expect(await hits(source, 'src/main/index.ts')).toHaveLength(2);
  });
});

describe('G16 the rule is an error, set once for every file', () => {
  it.each(ALL_FILES)('is severity error in %s', async (file) => {
    const config = await eslint.calculateConfigForFile(resolve(root, file));

    expect(config.rules?.[RULE]).toEqual([ERROR]);
  });
});

// The wiring, end to end: the real eslint.config.js over a scratch copy, one planted barrel per folder. (The
// lint script itself is pinned in oxlint-gate.test.ts; oxlint cannot run in a copy whose node_modules is linked.)
describe('G16 eslint fails on a barrel in each folder, naming the rule and the file', () => {
  const PLANTS: Record<string, string> = {
    'src/main/plant-barrel.ts': "export * from './ipc-router';\n",
    'src/preload/plant-barrel.ts': "export * from './index';\n",
    'src/renderer/src/plant-barrel.ts': "export * from './store';\n",
    'src/shared/plant-barrel.ts': "export * from './ipc';\n",
    'test/plant-barrel.ts': "export * from './helpers/scratch';\n",
    'lint/plant-barrel.js': "export * from './size.js';\n",
  };
  let planted: ReturnType<typeof inCopy> | undefined;
  const run = () =>
    (planted ??= inCopy({ write: PLANTS }, ['npx', 'eslint', '.', '--max-warnings', '0']));

  it(
    'the run fails',
    () => {
      expect(run().failed).toBe(true);
    },
    SLOW
  );

  it.each(Object.keys(PLANTS))(
    'reports %s',
    (file) => {
      const { output } = run();
      const block = output.slice(output.indexOf(file));

      expect(block.slice(0, block.indexOf('\n\n'))).toContain(RULE);
    },
    SLOW
  );
});
