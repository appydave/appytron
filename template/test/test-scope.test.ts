import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEST_FILES } from '../lint/test-scope.js';
import { errorRuleIds, lint, root } from './helpers/eslint-probe';
import { oxlintAt } from './helpers/oxlint-probe';

// One definition of test code for every gate that treats tests differently: Oxlint (G05 magic numbers,
// G06 cyclomatic), ESLint (G06 cognitive and expression) and the G04 describe exemption.
const TEST_CODE = [
  'test/probe.test.js',
  'test/helper.js',
  'src/x.test.js',
  'src/a/test/y.js',
  'src/main/probe.test.mjs',
];
const SOURCE_CODE = [
  'src/x.js',
  'src/main/contest.js',
  'src/latest/probe.js',
  'src/x.spec.js',
  'src/tests/y.js',
  'test-utils/z.js',
];

const BRANCHES = 9;
// Plain JavaScript, so every path parses without a tsconfig: nine ifs (cyclomatic 10, cognitive 9) and
// a magic number.
const BRANCHY = `export function f(a) {\n${'  if (a) {\n    a += 1;\n  }\n\n'.repeat(BRANCHES)}  return a * 1200;\n}\n`;
const LONG_DESCRIBE = `describe('x', () => {\n${Array.from({ length: 59 }, (_, i) => `  const v${i} = ${i};\n`).join('')}});\n`;

// A probe that does not parse reports no rule at all, so every 'gets no finding' assertion would pass
// vacuously: fail loudly instead.
async function ids(source: string, file: string): Promise<string[]> {
  const fatal = (await lint(source, file)).find((message) => message.fatal);

  if (fatal) {
    throw new Error(`probe did not parse at ${file}: ${fatal.message}`);
  }

  return errorRuleIds(source, file);
}

describe('one definition of test code', () => {
  it('is imported by eslint.config.js, not copied into it', () => {
    const config = readFileSync(resolve(root, 'eslint.config.js'), 'utf8');
    expect(config).toMatch(/import\s*\{\s*TEST_FILES\s*\}\s*from\s*'\.\/lint\/test-scope\.js'/);
    expect(config).not.toContain("'**/*.test.*'");
  });

  it('is exactly *.test.* and any test/ folder, in the list and in .oxlintrc.json', () => {
    // The config is JSON with // comments: drop whole-line comments, then parse.
    const config: { overrides: { files: string[]; rules: unknown }[] } = JSON.parse(
      readFileSync(resolve(root, '.oxlintrc.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '')
    );
    const [testOverride, ...rest] = config.overrides;

    expect(TEST_FILES).toEqual(['**/*.test.*', '**/test/**']);
    expect(testOverride.files).toEqual(TEST_FILES);
    expect(testOverride.rules).toEqual({ 'no-magic-numbers': 'off', complexity: 'off' });
    expect(rest.map((override) => override.files)).toEqual([['src/main/ipc-router.ts']]);
  });

  describe.each(TEST_CODE)('test code %s', (file) => {
    it('gets no magic-number or complexity finding from Oxlint', () => {
      expect(oxlintAt(file, BRANCHY)).toEqual({ failed: false, output: expect.any(String) });
    });

    it('gets no cognitive-complexity finding from ESLint, and may have a long describe', async () => {
      expect(await ids(BRANCHY, file)).not.toContain('sonarjs/cognitive-complexity');
      expect(await ids(LONG_DESCRIBE, file)).not.toContain('size/max-lines-per-function');
    });
  });

  describe.each(SOURCE_CODE)('non-test code %s', (file) => {
    it('gets both findings from Oxlint', () => {
      const { failed, output } = oxlintAt(file, BRANCHY);

      expect(failed).toBe(true);
      expect(output).toContain('no-magic-numbers');
      expect(output).toContain('complexity of 10');
    });

    it('gets the cognitive finding and the long describe from ESLint', async () => {
      expect(await ids(BRANCHY, file)).toContain('sonarjs/cognitive-complexity');
      expect(await ids(LONG_DESCRIBE, file)).toContain('size/max-lines-per-function');
    });
  });
});
