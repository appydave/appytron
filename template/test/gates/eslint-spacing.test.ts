import { describe, expect, it } from 'vitest';
import { errorRuleIds } from './helpers/eslint-probe';

// Runs the real eslint.config.js over probe text, so the test proves the gate is wired, not the rules.
// Existing paths, because type-aware parsing needs a file a tsconfig includes; the text is the probe.
const MAIN = 'src/main/index.ts';
const RENDERER = 'src/renderer/src/App.tsx';
const TEST = 'test/gates/eslint-spacing.test.ts';

const errors = (source: string, file = MAIN) => errorRuleIds(source, file);

// Spelled in two pieces so the no-disable-directives guard does not flag this file.
const DISABLE = 'eslint' + '-disable';
const PADDING = '@stylistic/padding-line-between-statements';

describe('G03 readable spacing gate, run through the real eslint.config.js', () => {
  describe.each([
    ['curly', 'if (flag) go();\n', 'if (flag) {\n  go();\n}\n'],
    ['@stylistic/max-statements-per-line', 'go(); stop();\n', 'go();\nstop();\n'],
    ['one-var', 'let a = 1, b = 2;\n', 'let a = 1;\nlet b = 2;\n'],
    ['no-sequences', 'go(), stop();\n', 'go();\n'],
    [PADDING, 'const a = 1;\ngo();\n', 'const a = 1;\n\ngo();\n'],
    ['@stylistic/brace-style', 'if (flag)\n{\n  go();\n}\n', 'if (flag) {\n  go();\n}\n'],
  ])('%s', (rule, bad, good) => {
    it('rejects the bad example', async () => {
      expect(
        await errors(
          `declare const flag: boolean;\ndeclare function go(): void;\ndeclare function stop(): void;\n\n${bad}`
        )
      ).toContain(rule);
    });

    it('accepts the good example', async () => {
      expect(
        await errors(
          `declare const flag: boolean;\ndeclare function go(): void;\ndeclare function stop(): void;\n\n${good}`
        )
      ).not.toContain(rule);
    });
  });

  // A2/F4: one row per padding sub-rule and the brace-style single-line option.
  describe.each([
    [
      'brace-style rejects a single-line block',
      '@stylistic/brace-style',
      'if (flag) { go(); }\n',
      'if (flag) {\n  go();\n}\n',
    ],
    [
      'import padding',
      PADDING,
      "import { a } from 'a';\nexport const c = a;\n",
      "import { a } from 'a';\n\nexport const c = a;\n",
    ],
    [
      'padding around a function',
      PADDING,
      'go();\nfunction h(): void {\n  stop();\n}\n',
      'go();\n\nfunction h(): void {\n  stop();\n}\n',
    ],
    ['padding around a class', PADDING, 'go();\nclass K {}\n', 'go();\n\nclass K {}\n'],
    ['padding after a class', PADDING, 'class K {}\ngo();\n', 'class K {}\n\ngo();\n'],
    [
      'padding before a return after a call',
      PADDING,
      'export function f(): number {\n  go();\n  return 1;\n}\n',
      'export function f(): number {\n  go();\n\n  return 1;\n}\n',
    ],
    ['padding before a declaration', PADDING, 'go();\nconst a = 1;\n', 'go();\n\nconst a = 1;\n'],
  ])('%s', (_name, rule, bad, good) => {
    const head =
      'declare const flag: boolean;\ndeclare function go(): void;\ndeclare function stop(): void;\n\n';

    it('fails the bad snippet', async () => {
      expect(await errors(head + bad)).toContain(rule);
    });

    it('passes the fixed snippet', async () => {
      expect(await errors(head + good)).not.toContain(rule);
    });
  });

  it('wants a blank line before return and after a block', async () => {
    expect(
      await errors('export function f(a: number) {\n  const b = a;\n  return b;\n}\n')
    ).toContain(PADDING);
    expect(
      await errors('export function f(a: number) {\n  const b = a;\n\n  return b;\n}\n')
    ).not.toContain(PADDING);
    expect(
      await errors(
        'export function f(a: boolean) {\n  if (a) {\n    return 1;\n  }\n  return 2;\n}\n'
      )
    ).toContain(PADDING);
  });

  it('wants a blank line after a block before a non-return statement', async () => {
    const head =
      'declare const x: boolean;\ndeclare function a(): void;\ndeclare function go(): void;\n\n';

    expect(await errors(`${head}if (x) {\n  a();\n}\ngo();\n`)).toContain(PADDING);
    expect(await errors(`${head}if (x) {\n  a();\n}\n\ngo();\n`)).not.toContain(PADDING);
  });

  it('wants a blank line between class members', async () => {
    const bad = 'export class A {\n  a() {\n    return 1;\n  }\n  b() {\n    return 2;\n  }\n}\n';
    const good = bad.replace('  }\n  b()', '  }\n\n  b()');

    expect(await errors(bad)).toContain('@stylistic/lines-between-class-members');
    expect(await errors(good)).not.toContain('@stylistic/lines-between-class-members');
  });

  it('allows consecutive declarations and consecutive imports without blank lines', async () => {
    expect(
      await errors(
        "import { a } from 'a';\nimport { b } from 'b';\n\nexport const c = [a, b];\nexport const d = 1;\n"
      )
    ).not.toContain(PADDING);
  });

  it('checks .tsx files and test files too', async () => {
    expect(
      await errors('const a = 1;\nfunction B() {\n  return a;\n}\n\nexport default B;\n', RENDERER)
    ).toContain(PADDING);
    expect(await errors('const a = 1;\ngo();\ndeclare function go(): void;\n', TEST)).toContain(
      PADDING
    );
  });

  it('does not let a disable comment switch the gate off', async () => {
    expect(
      await errors(
        `/* ${DISABLE} curly */\ndeclare const f: boolean;\ndeclare function go(): void;\n\nif (f) go();\n`
      )
    ).toContain('curly');
  });
});
