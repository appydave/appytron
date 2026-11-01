import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { installedVersion, manifest } from './helpers/manifest';

// G08: the duplicate gate as `npm run dup` runs it. Every probe runs the real script in a scratch copy of
// the gate files (configs, guard, package.json) with the real node_modules linked in, so the wiring is
// what fails, not the tool. Nothing is planted in the real template: other tests read it in parallel.
const root = resolve(import.meta.dirname, '..');
const GATE_FILES = [
  'package.json',
  '.jscpd.json',
  '.jscpd.tests.json',
  'lint/no-disable-directives.js',
];
const ALL_FORMATS = ['typescript', 'tsx', 'javascript', 'jsx'];
const NEVER_COUNTED = [
  '**/node_modules/**',
  '**/out/**',
  '**/dist/**',
  '**/coverage/**',
  '**/.claude/**',
];

// n statements of k arguments each: 2k + 5 tokens a line, `v<i> = f(a0, ..., a<k-1>);`.
const block = (lines: number, args: number): string =>
  Array.from(
    { length: lines },
    (_, i) => `v${i} = f(${Array.from({ length: args }, (__, j) => `a${j}`).join(', ')});\n`
  ).join('');
// jscpd 5.4.2 reports a clone of more than minLines (5) lines and at least minTokens (50) tokens.
const CLONE = block(6, 2); // 6 lines, 54 tokens: reported
const FIVE_LINES = block(5, 4); // 5 lines, 65 tokens: under the line floor
const FEW_TOKENS = block(6, 1); // 6 lines, 42 tokens: under the token floor

function dup(
  files: Record<string, string>,
  command = ['npm', 'run', 'dup']
): { failed: boolean; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'g08-'));

  try {
    for (const file of GATE_FILES) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      copyFileSync(join(root, file), join(dir, file));
    }

    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));

    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), text);
    }

    const [program = 'npm', ...args] = command;
    const run = spawnSync(program, args, { cwd: dir, encoding: 'utf8' });

    return { failed: run.status !== 0, output: run.stdout + run.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const pair = (a: string, b: string, text = CLONE) => ({ [a]: text, [b]: text });

describe('G08 the dup script fails on a duplicate, naming both files', () => {
  it.each([
    ['src/main', 'src/main/a.ts', 'src/main/b.ts'],
    ['src/renderer', 'src/renderer/src/a.tsx', 'src/renderer/src/b.tsx'],
    ['src/preload and src/shared', 'src/preload/a.ts', 'src/shared/b.ts'],
    ['lint/', 'lint/a.js', 'lint/b.js'],
    ['a root script', 'one.config.js', 'two.config.mjs'],
  ])('in %s', (_where, a, b) => {
    const { failed, output } = dup(pair(a, b));

    expect(failed).toBe(true);
    expect(output).toContain(a);
    expect(output).toContain(b);
  });

  it('is judged by the tests profile in test code, and the production profile alone passes it', () => {
    const files = pair('test/a.test.ts', 'src/x.test.ts');
    const { failed, output } = dup(files);

    expect(failed).toBe(true);
    expect(output).toContain('test/a.test.ts');
    expect(output).toContain('src/x.test.ts');
    expect(dup(files, ['npx', 'jscpd', '--config', '.jscpd.json']).failed).toBe(false);
  });

  it('lets a clone just under either floor through', () => {
    expect(dup(pair('src/main/a.ts', 'src/main/b.ts', FIVE_LINES)).failed).toBe(false);
    expect(dup(pair('src/main/a.ts', 'src/main/b.ts', FEW_TOKENS)).failed).toBe(false);
    expect(dup(pair('test/a.test.ts', 'test/b.test.ts', FIVE_LINES)).failed).toBe(false);
    expect(dup(pair('test/a.test.ts', 'test/b.test.ts', FEW_TOKENS)).failed).toBe(false);
  });

  it('passes a tree with no duplicate, so the failures above are the planted clones', () => {
    expect(dup({ 'src/main/a.ts': block(6, 2), 'src/main/b.ts': block(6, 3) }).failed).toBe(false);
  });
});

describe('G08 the dup script refuses a jscpd marker, which would hide a clone from the tool', () => {
  // Pieces, so this file does not trip the guard it tests.
  const MARKERS = ['jscpd' + ':ignore-start', 'jscpd' + ':ignore-next-line', 'jscpd' + ':ignore'];

  it.each(MARKERS)('%s', (marker) => {
    const files = pair('src/main/a.ts', 'src/main/b.ts', `// ${marker}\n${CLONE}`);
    const { failed, output } = dup(files);

    expect(failed).toBe(true);
    expect(output).toContain(`src/main/a.ts:1: ${'jscpd' + ':ignore'}`);
  });
});

describe('G08 the reviewed jscpd configuration', () => {
  const read = (file: string): unknown => JSON.parse(readFileSync(join(root, file), 'utf8'));

  it('is exactly the production profile: 5 lines, 50 tokens, threshold 0, tests ignored', () => {
    expect(read('.jscpd.json')).toEqual({
      path: ['.'],
      format: ALL_FORMATS,
      minLines: 5,
      minTokens: 50,
      threshold: 0,
      reporters: ['console'],
      ignore: [...NEVER_COUNTED, '**/*.test.*', '**/test/**'],
    });
  });

  it('is exactly the tests profile: the same floors, only test code, same exclusions', () => {
    expect(read('.jscpd.tests.json')).toEqual({
      path: ['.'],
      format: ALL_FORMATS,
      minLines: 5,
      minTokens: 50,
      threshold: 0,
      reporters: ['console'],
      pattern: '**/{*.test.*,test/**/*}',
      ignore: NEVER_COUNTED,
    });
  });

  it('is run by exactly: the marker guard, then the production profile, then the tests profile', () => {
    expect(manifest().scripts.dup).toBe(
      'node lint/no-disable-directives.js && jscpd --config .jscpd.json && jscpd --config .jscpd.tests.json'
    );
  });

  it('pins jscpd to the exact version that is installed', () => {
    expect(manifest().devDependencies.jscpd).toMatch(/^\d+\.\d+\.\d+$/);
    expect(installedVersion('jscpd')).toBe(manifest().devDependencies.jscpd);
  });

  it('runs in the shipped CI, right after lint', () => {
    const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');

    expect(ci).toContain('      - run: npm run lint\n      - run: npm run dup\n');
  });
});
