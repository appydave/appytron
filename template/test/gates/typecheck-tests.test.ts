import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inCopy, SLOW } from './helpers/deadcode';
import { root } from './helpers/scratch';

// AF4: `npm run typecheck` must cover the tests. Pinned whole, so dropping `test/`, `strict` or a type
// package fails here; the probes then show a type error in a test file and in a nested helper fails the script.
const typecheckTests = (write: Record<string, string> = {}) =>
  inCopy({ write }, ['npm', 'run', 'typecheck:tests']);
const BAD = "export const planted: number = 'not a number';\n";

describe('tsconfig.tests.json', () => {
  it('includes the tests and vitest.config.ts, strictly, with Node types and JavaScript allowed', () => {
    const { compilerOptions, include } = JSON.parse(
      readFileSync(join(root, 'tsconfig.tests.json'), 'utf8')
    );
    const { paths: _paths, ...options } = compilerOptions;

    expect(include).toEqual(['test/**/*', 'vitest.config.ts']);
    expect(options).toEqual({
      composite: true,
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      esModuleInterop: true,
      strict: true,
      noUnusedLocals: true,
      skipLibCheck: true,
      resolveJsonModule: true,
      allowJs: true,
      types: ['node'],
      baseUrl: '.',
    });
  });
});

describe('npm run typecheck:tests', () => {
  it(
    'passes the untouched template, so the failures below are the planted error',
    () => {
      expect(typecheckTests().failed).toBe(false);
    },
    SLOW
  );

  it.each([
    ['a test file', 'test/planted.test.ts'],
    ['a nested helper', 'test/helpers/planted.ts'],
    ['a deeper folder', 'test/nested/deeper/planted.ts'],
    ['a gate proof', 'test/gates/planted.test.ts'],
    ['a gate helper', 'test/gates/helpers/planted.ts'],
  ])(
    'fails on a type error in %s',
    (_where, file) => {
      const { failed, output } = typecheckTests({ [file]: BAD });

      expect(failed).toBe(true);
      expect(output).toContain(`${file}(1,14): error TS2322`);
    },
    SLOW
  );
});
