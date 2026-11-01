import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// A2: pins what ESLint and Oxlint actually apply per environment, so dropping a block, a preset or the
// oxlint spread fails here. The .oxlintrc.json body and the lint script string are pinned in
// oxlint-gate.test.ts; this file does not repeat them.
const root = resolve(import.meta.dirname, '..');
const ERROR = 2;
const OFF = 0;
// CI makes typescript-eslint read files from disk and ignore lintText text; turn that inference off.
const eslint = new ESLint({
  cwd: root,
  overrideConfig: {
    languageOptions: { parserOptions: { disallowAutomaticSingleRunInference: true } },
  },
});

const MAIN = 'src/main/index.ts';
const PRELOAD = 'src/preload/index.ts';
const RENDERER = 'src/renderer/src/App.tsx';
const TEST = 'test/oxlint-gate.test.ts';
const SCRIPT = 'lint/spacing.js';
const TYPED_ENVS = [MAIN, PRELOAD, RENDERER];
const ALL_ENVS = [...TYPED_ENVS, TEST, SCRIPT];

async function severity(file: string, rule: string): Promise<unknown> {
  const config = await eslint.calculateConfigForFile(resolve(root, file));
  const entry: unknown = config.rules?.[rule];

  return Array.isArray(entry) ? entry[0] : entry;
}

async function errors(source: string, file: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath: resolve(root, file) });

  return (result?.messages ?? [])
    .filter((message) => message.severity === ERROR)
    .map((message) => message.ruleId ?? 'parse-error');
}

const oxlintRules = JSON.parse(
  spawnSync(resolve(root, 'node_modules/.bin/oxlint'), ['-c', '.oxlintrc.json', '--print-config'], {
    cwd: root,
    encoding: 'utf8',
  }).stdout
).rules;

function oxlintSeverity(rule: string): unknown {
  const entry: unknown = oxlintRules[rule];

  return Array.isArray(entry) ? entry[0] : entry;
}

describe('A2 effective ESLint config, per environment', () => {
  const owned = [
    ...TYPED_ENVS.flatMap((file) =>
      [
        '@typescript-eslint/no-floating-promises',
        '@typescript-eslint/no-misused-promises',
        '@typescript-eslint/await-thenable',
        '@typescript-eslint/no-unsafe-assignment',
      ].map((rule) => [file, rule])
    ),
    [RENDERER, 'react-hooks/rules-of-hooks'],
    ...ALL_ENVS.flatMap((file) =>
      ['no-empty', 'no-fallthrough', 'no-case-declarations', 'no-prototype-builtins'].map(
        (rule) => [file, rule]
      )
    ),
    [SCRIPT, 'no-undef'],
    ...ALL_ENVS.flatMap((file) =>
      [
        'curly',
        'no-sequences',
        'one-var',
        '@stylistic/max-statements-per-line',
        '@stylistic/brace-style',
        '@stylistic/lines-between-class-members',
        '@stylistic/padding-line-between-statements',
      ].map((rule) => [file, rule])
    ),
  ];

  it.each(owned)('%s: %s is an error', async (file, rule) => {
    expect(await severity(file, rule ?? '')).toBe(ERROR);
  });

  it.each(ALL_ENVS)('%s ignores inline config comments', async (file) => {
    const config = await eslint.calculateConfigForFile(resolve(root, file));

    expect(config.linterOptions?.noInlineConfig).toBe(true);
  });
});

// A4: G04's size limits as ESLint applies them. Severity and numbers are pinned, so a dropped rule, a
// warning or a looser limit fails here; behaviour is proved in eslint-size.test.ts.
const COUNTING = { skipBlankLines: true, skipComments: true };
const SIZE_RULES: [string, unknown[]][] = [
  ['size/max-lines-per-function', [{ max: 60, ...COUNTING, IIFEs: true }]],
  ['max-params', [{ max: 4 }]],
  ['max-lines', [{ max: 300, ...COUNTING }]],
];

async function ruleEntry(file: string, rule: string): Promise<unknown[]> {
  const config = await eslint.calculateConfigForFile(resolve(root, file));

  return [config.rules?.[rule]].flat();
}

describe('A4 size rules are errors with the ruled limits, in every environment', () => {
  const cases = ALL_ENVS.flatMap((file) =>
    SIZE_RULES.map(([rule, options]) => [file, rule, options])
  );

  it.each(cases)('%s: %s', async (file, rule, options) => {
    expect(await ruleEntry(String(file), String(rule))).toEqual([ERROR, ...[options].flat()]);
  });

  it.each(ALL_ENVS)(
    '%s: no-restricted-syntax caps class, interface and object type at 30 members',
    async (file) => {
      const [level, ...restrictions] = await ruleEntry(file, 'no-restricted-syntax');

      expect(level).toBe(ERROR);
      expect(restrictions).toEqual([
        expect.objectContaining({ selector: 'ClassBody[body.length>30]' }),
        expect.objectContaining({ selector: 'TSInterfaceBody[body.length>30]' }),
        expect.objectContaining({ selector: 'TSTypeLiteral[members.length>30]' }),
      ]);
    }
  );
});

describe('A2 one owner per rule: Oxlint owns it, ESLint has it off', () => {
  it.each([
    ['@typescript-eslint/no-explicit-any', 'typescript/no-explicit-any'],
    ['@typescript-eslint/no-non-null-assertion', 'typescript/no-non-null-assertion'],
    ['@typescript-eslint/consistent-type-assertions', 'typescript/consistent-type-assertions'],
    ['no-magic-numbers', 'no-magic-numbers'],
    ['@typescript-eslint/no-magic-numbers', 'no-magic-numbers'],
  ])('%s is off in every environment and %s is an error in Oxlint', async (eslintRule, oxRule) => {
    for (const file of ALL_ENVS) {
      expect(await severity(file, eslintRule)).toBe(OFF);
    }

    expect(['error', 'deny']).toContain(oxlintSeverity(oxRule));
  });

  // Oxlint reports these as warnings; `--deny-warnings` in the lint script makes them fail.
  it.each([
    ['react-hooks/exhaustive-deps', 'react/exhaustive-deps', RENDERER],
    ['@typescript-eslint/no-unused-vars', 'no-unused-vars', MAIN],
  ])('%s is off in ESLint and %s is on in Oxlint', async (eslintRule, oxRule, file) => {
    expect(await severity(file, eslintRule)).toBe(OFF);
    expect(['warn', 'error', 'deny']).toContain(oxlintSeverity(oxRule));
  });
});

describe('A2 behaviour probes through the real eslint.config.js', () => {
  const FLOATING = 'export function f(): Promise<void> {\n  return Promise.resolve();\n}\n\nf();\n';

  it.each([
    ['main', MAIN],
    ['preload', PRELOAD],
    ['renderer', RENDERER],
  ])('a floating promise in %s fails', async (_name, file) => {
    expect(await errors(FLOATING, file)).toContain('@typescript-eslint/no-floating-promises');
  });

  it('a conditional hook call in the renderer fails', async () => {
    const bad =
      "import { useState } from 'react';\n\nexport function A(flag: boolean) {\n  if (flag) {\n    useState(0);\n  }\n\n  return null;\n}\n";

    expect(await errors(bad, RENDERER)).toContain('react-hooks/rules-of-hooks');
  });

  it('an undefined name in a .js file fails', async () => {
    expect(await errors('export const a = missing;\n', SCRIPT)).toContain('no-undef');
  });
});
