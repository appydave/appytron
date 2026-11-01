import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TEST_FILES } from '@lint/test-scope.js';
import { ERROR, errorMessages, eslint, root } from './helpers/eslint-probe';
import { installedVersion, manifest } from './helpers/manifest';

// G06: cognitive and expression complexity (SonarJS) as ESLint applies them through the real
// eslint.config.js. Cyclomatic is Oxlint's; its probes are in oxlint-gate.test.ts.
const COGNITIVE = 'sonarjs/cognitive-complexity';
const EXPRESSION = 'sonarjs/expression-complexity';
const COGNITIVE_MAX = 8;
const EXPRESSION_OPERATORS_MAX = 3;
// The probe paths are real files, so each one sits in the tsconfig its environment names.
const MAIN = 'src/main/index.ts';
const PRELOAD = 'src/preload/index.ts';
const RENDERER = 'src/renderer/src/App.tsx';
const SCRIPT = 'lint/spacing.js';
const ROOT_CONFIG = 'eslint.config.js';
const TEST = 'test/oxlint-gate.test.ts';
const VITEST_CONFIG = 'vitest.config.ts';

async function count(rule: string, source: string, file = MAIN): Promise<number> {
  return (await errorMessages(source, file)).filter((message) => message.ruleId === rule).length;
}

// n sequential ifs: cognitive n.
function ifs(n: number): string {
  return `export function f(a: number) {\n${'  if (a) {\n    a += 1;\n  }\n\n'.repeat(n)}  return a;\n}\n`;
}

// Three nested ifs (1 + 2 + 3 = 6) then n sequential ones: cognitive 6 + n.
function nested(n: number): string {
  return ifs(n).replace(
    'export function f(a: number) {\n',
    'export function f(a: number) {\n  if (a) {\n    if (a > 1) {\n      if (a > 2) {\n        a += 1;\n      }\n    }\n  }\n\n'
  );
}

// n operands joined by &&: n - 1 operators.
function chain(operands: number): string {
  const names = Array.from({ length: operands }, (_, i) => `v${i}`);
  const params = names.map((v) => `${v}: boolean`).join(', ');

  return `export const f = (options: { ${params} }) => ${names.map((v) => `options.${v}`).join(' && ')};\n`;
}

describe('G06 cognitive and expression gates, run through the real eslint.config.js', () => {
  it('rejects cognitive 9 and allows 8, flat and nested', async () => {
    expect(await count(COGNITIVE, ifs(COGNITIVE_MAX + 1))).toBe(1);
    expect(await count(COGNITIVE, ifs(COGNITIVE_MAX))).toBe(0);
    expect(await count(COGNITIVE, nested(3))).toBe(1);
    expect(await count(COGNITIVE, nested(2))).toBe(0);
  });

  it('rejects 4 expression operators and allows 3', async () => {
    expect(await count(EXPRESSION, chain(EXPRESSION_OPERATORS_MAX + 2))).toBe(1);
    expect(await count(EXPRESSION, chain(EXPRESSION_OPERATORS_MAX + 1))).toBe(0);
  });

  it.each([MAIN, PRELOAD, RENDERER, SCRIPT, ROOT_CONFIG, VITEST_CONFIG])(
    'checks %s',
    async (file) => {
      // Plain JavaScript text, so the .js files parse too.
      expect(await count(COGNITIVE, ifs(COGNITIVE_MAX + 1).replace(': number', ''), file)).toBe(1);
    }
  );

  it('is out of scope in test files', async () => {
    expect(await count(COGNITIVE, ifs(COGNITIVE_MAX + 1), TEST)).toBe(0);
    expect(await count(EXPRESSION, chain(EXPRESSION_OPERATORS_MAX + 2), TEST)).toBe(0);
  });

  it('tells the agent to refactor, with both numbers', async () => {
    const [cognitive] = await errorMessages(ifs(COGNITIVE_MAX + 1), MAIN);
    const [expression] = await errorMessages(chain(EXPRESSION_OPERATORS_MAX + 2), MAIN);

    expect(cognitive?.message).toBe(
      'Refactor this function to reduce its Cognitive Complexity from 9 to the 8 allowed.'
    );
    expect(expression?.message).toContain('Reduce the number of conditional operators');
  });
});

describe('G06 the reviewed ESLint complexity block', () => {
  // The whole block is pinned, so a widened ignore on a folder no probe names cannot slip through.
  it('is exactly quality/complexity: two SonarJS rules by name, tests out', async () => {
    const { default: config } = await import(pathToFileURL(resolve(root, ROOT_CONFIG)).href);
    const block = config.find((entry: { name?: string }) => entry.name === 'quality/complexity');
    const { plugins, ...rest } = block ?? {};

    expect(rest).toEqual({
      name: 'quality/complexity',
      files: ['**/*.{ts,tsx,js,mjs,cjs}'],
      ignores: TEST_FILES,
      rules: {
        [COGNITIVE]: ['error', COGNITIVE_MAX],
        [EXPRESSION]: ['error', { max: EXPRESSION_OPERATORS_MAX }],
      },
    });
    expect(Object.keys(plugins ?? {})).toEqual(['sonarjs']);
  });

  // Only *.test.* and test/ are out of scope: these look like tests and are not. Config lookup needs
  // no real file, so the paths need not sit in a tsconfig.
  it.each(['src/main/contest.ts', 'src/main/latest/probe.ts', 'src/main/probe.spec.ts'])(
    'does not exempt %s',
    async (file) => {
      const config = await eslint.calculateConfigForFile(resolve(root, file));

      expect(config.rules?.[COGNITIVE]).toEqual([ERROR, COGNITIVE_MAX]);
    }
  );

  it('turns on exactly the two reviewed SonarJS rules and leaves cyclomatic to Oxlint', async () => {
    const config = await eslint.calculateConfigForFile(resolve(root, MAIN));
    const on = Object.entries(config.rules ?? {})
      .filter(([, value]) => ![0, 'off'].includes([value].flat()[0]))
      .map(([name]) => name);

    expect(on.filter((name) => name.startsWith('sonarjs/'))).toEqual([COGNITIVE, EXPRESSION]);
    // One owner per metric: ESLint's own copy is off (eslint-plugin-oxlint), SonarJS's is never on.
    expect(on).not.toContain('complexity');
  });

  // SonarJS's rule behaviour changes between versions, so the version is part of the gate: exact, never a
  // range, and the installed copy is the one pinned (a stale node_modules would otherwise lint with another).
  it('pins eslint-plugin-sonarjs to exactly 4.2.2, and that is the installed version', () => {
    expect(manifest().devDependencies['eslint-plugin-sonarjs']).toBe('4.2.2');
    expect(installedVersion('eslint-plugin-sonarjs')).toBe('4.2.2');
  });
});
