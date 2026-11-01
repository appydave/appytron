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
