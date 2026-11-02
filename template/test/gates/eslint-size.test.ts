import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { ERROR, errorRuleIds, lint, root } from './helpers/eslint-probe';

// Runs the real eslint.config.js over probe text, so the test proves the gate is wired, not the rules.

// Existing paths where type-aware parsing needs a file a tsconfig includes; the text is the probe.
const MAIN = 'src/main/index.ts';
const PRELOAD = 'src/preload/index.ts';
const RENDERER = 'src/renderer/src/App.tsx';
const TEST = 'test/gates/eslint-size.test.ts';
// Paths no tsconfig includes: plain JavaScript probes only.
const PLAIN = 'lint/probe.ts';
const FUNCTION_RULE = 'size/max-lines-per-function';

async function ruleIds(source: string, file = PLAIN): Promise<string[]> {
  // A probe that does not parse proves nothing (every count would be zero): fail loudly.
  const fatal = (await lint(source, file)).find((message) => message.fatal);

  if (fatal) {
    throw new Error(`probe did not parse: ${fatal.message}`);
  }

  return errorRuleIds(source, file);
}

const count = async (source: string, rule: string, file?: string) =>
  (await ruleIds(source, file)).filter((id) => id === rule).length;
const statements = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => `const v${from + i} = ${i};`).join('\n');
// A call or function whose text spans exactly `total` lines, opener and closer included.
const wrapped = (opener: string, closer: string, total: number) =>
  `${opener}\n${statements(total - 2)}\n${closer}\n`;
const members = (n: number, line: (i: number) => string) =>
  Array.from({ length: n }, (_, i) => line(i)).join('\n');

// A4: G04 proved the limits on .ts only. The size block must also cover plain JavaScript: lint/ scripts and
// the root configs are .js and .mjs. Mutant C06 scopes the block to *.ts; these probes then fail.
describe('A4 size limits apply to JavaScript files too', () => {
  const tooLong = wrapped('function f() {', '}', 61);
  const tooManyParams = 'function f(a, b, c, d, e) {\n  return [a, b, c, d, e];\n}\n';

  it.each(['lint/probe.js', 'eslint.probe.config.js', 'lint/probe.mjs', 'lint/probe.cjs'])(
    '%s fails a 61-line function and 5 parameters, and names the rule',
    async (file) => {
      expect(await count(tooLong, FUNCTION_RULE, file)).toBe(1);
      expect(await count(tooManyParams, 'max-params', file)).toBe(1);
    }
  );

  it('fails a file over 300 counted lines in a .js file', async () => {
    expect(await count(statements(301), 'max-lines', 'lint/probe.js')).toBe(1);
    expect(await count(statements(300), 'max-lines', 'lint/probe.js')).toBe(0);
  });
});

describe('G04 size gate, run through the real eslint.config.js', () => {
  it('allows a 60-line function and rejects a 61-line one', async () => {
    expect(await count(wrapped('export function f() {', '}', 60), FUNCTION_RULE)).toBe(0);
    expect(await count(wrapped('export function f() {', '}', 61), FUNCTION_RULE)).toBe(1);
  });

  it('checks an IIFE, and does not count blank lines or comments', async () => {
    expect(await count(wrapped('(() => {', '})();', 61), FUNCTION_RULE)).toBe(1);
    expect(
      await count(
        `export function f() {\n${statements(29)}\n\n// c\n\n/* b */\n${statements(29, 29)}\n}\n`,
        FUNCTION_RULE
      )
    ).toBe(0);
  });

  it('allows four parameters and rejects five', async () => {
    const make = (list: string) => `export const f = (${list}) => 0;\n`;

    expect(await count(make('a, b, c, d'), 'max-params')).toBe(0);
    expect(await count(make('a, b, c, d, e'), 'max-params')).toBe(1);
  });

  it('allows 300 counted lines and rejects 301; blanks and comments are not counted', async () => {
    expect(await count(`${statements(300)}\n`, 'max-lines')).toBe(0);
    expect(await count(`${statements(301)}\n`, 'max-lines')).toBe(1);
    expect(await count(`${statements(300)}\n${'\n// note\n'.repeat(50)}`, 'max-lines')).toBe(0);
  });

  describe.each([
    [
      'an interface',
      (n: number) => `export interface I {\n${members(n, (i) => `  m${i}: number;`)}\n}\n`,
    ],
    ['a class', (n: number) => `export class C {\n${members(n, (i) => `  p${i} = ${i};`)}\n}\n`],
    [
      'an object type',
      (n: number) => `export type T = {\n${members(n, (i) => `  t${i}: number;`)}\n};\n`,
    ],
  ])('members of %s', (_name, make) => {
    it('allows 30 and rejects 31, with a message that says what to do', async () => {
      const hit = (await lint(make(31), MAIN)).find((m) => m.ruleId === 'no-restricted-syntax');

      expect(await count(make(30), 'no-restricted-syntax', MAIN)).toBe(0);
      expect(hit?.severity).toBe(ERROR);
      expect(hit?.message).toContain('Split it into smaller types');
    });
  });

  // Each environment has its own config blocks; a rule switched off for one of them must fail here.
  describe.each([MAIN, PRELOAD, RENDERER, TEST])('in %s', (file) => {
    it('rejects a 61-line function, five parameters and a 301-line file', async () => {
      expect(await count(wrapped('export function f() {', '}', 61), FUNCTION_RULE, file)).toBe(1);
      expect(await count('export const g = (a, b, c, d, e) => 0;\n', 'max-params', file)).toBe(1);
      expect(await count(`${statements(301)}\n`, 'max-lines', file)).toBe(1);
    });

    it('rejects an interface with 31 members', async () => {
      const source = `export interface I {\n${members(31, (i) => `  m${i}: number;`)}\n}\n`;

      expect(await count(source, 'no-restricted-syntax', file)).toBe(1);
    });
  });

  describe('describe callbacks: exempt in test files only; each it() stays checked', () => {
    const long = wrapped("describe('x', () => {", '});', 61);

    it.each([
      ["describe.skip('x', () => {"],
      ["describe.only('x', () => {"],
      ["describe.each([1, 2])('x', () => {"],
      ["describe.each`a`('x', () => {"],
      ["describe('x', function () {"],
    ])('allows a 61-line %s callback in a test file', async (opener) => {
      expect(await count(wrapped(opener, '});', 61), FUNCTION_RULE, 'test/probe.test.ts')).toBe(0);
    });

    it('exempts *.test.ts and files under test/, nothing in src', async () => {
      expect(await count(long, FUNCTION_RULE, 'test/probe.ts')).toBe(0);
      expect(await count(long, FUNCTION_RULE, 'lint/probe.test.ts')).toBe(0);
      // A declaration-file name still matches TEST_FILES (`**/*.test.*`), as the other gates see it.
      expect(await count(long, FUNCTION_RULE, 'lint/probe.test.d.ts')).toBe(0);
      expect(await count(long, FUNCTION_RULE, MAIN)).toBe(1);
      expect(await count(long, FUNCTION_RULE, RENDERER)).toBe(1);
    });

    it('does not exempt spec files, tests/ folders or look-alike names', async () => {
      for (const file of [
        'lint/probe.spec.ts',
        'lint/tests/a.ts',
        'lint/probe.tests.ts',
        'lint/test.ts',
      ]) {
        expect(await count(long, FUNCTION_RULE, file)).toBe(1);
      }
    });

    it('keeps an it() callback checked, and other callbacks and a function named describe', async () => {
      const inDescribe = `describe('x', () => {\n${wrapped("it('y', () => {", '});', 61)}});\n`;

      expect(await count(inDescribe, FUNCTION_RULE, 'test/probe.test.ts')).toBe(1);
      expect(
        await count(wrapped("suite('x', () => {", '});', 61), FUNCTION_RULE, 'test/p.test.ts')
      ).toBe(1);
      expect(
        await count(
          wrapped('export function describe(n: string) {', '}', 61),
          FUNCTION_RULE,
          'test/p.test.ts'
        )
      ).toBe(1);
    });

    // A checkout that happens to live under a folder named `test` must not exempt every file.
    it('judges the path from the lint root, not from the filesystem root', async () => {
      const base = mkdtempSync(join(tmpdir(), 'size-root-'));

      try {
        const checkout = join(base, 'test', 'app');

        mkdirSync(join(checkout, 'lint'), { recursive: true });

        const nested = new ESLint({
          cwd: checkout,
          overrideConfigFile: resolve(root, 'eslint.config.js'),
        });
        const [result] = await nested.lintText(long, {
          filePath: join(checkout, 'lint', 'probe.ts'),
        });

        expect(result?.messages.map((m) => m.ruleId)).toContain(FUNCTION_RULE);
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    });
  });
});
