import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
