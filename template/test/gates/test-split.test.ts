import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inCopy, SLOW } from './helpers/deadcode';
import { manifest } from './helpers/manifest';
import { root } from './helpers/scratch';

// TS: `npm test` runs the app's own tests; the gate proofs live in test/gates and run under `npm run test:gates`.
// A new app test dropped in test/ runs by default because test/gates is EXCLUDED, not because the app tests are listed.
const GATES = join('test', 'gates');
const GATE_TESTS = readdirSync(join(root, GATES)).filter((file) => file.endsWith('.test.ts'));
const FAILS = "it('fails', () => {\n  expect(1).toBe(2);\n});\n";
const PASSES = "it('passes', () => {\n  expect(1).toBe(1);\n});\n";
// Only the planted files are left in the copy, so the run is seconds and cannot start this suite again.
const ONLY = GATE_TESTS.map((file) => join(GATES, file));
// The app's own tests, whatever they are: an app adds, renames and deletes these, so nothing below may list them.
const APP_TESTS = readdirSync(join(root, 'test'), { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.test.ts') && !file.startsWith('gates'))
  .map((file) => join('test', file));
// The copy keeps only the planted files: the gate proofs and the app's own tests are both removed.
const NONE = [...ONLY, ...APP_TESTS];
const scripts = manifest().scripts;

describe('TS the test scripts', () => {
  it('are exactly: test excludes test/gates, test:gates runs only it, test:all runs both in one run', () => {
    expect([scripts.test, scripts['test:gates'], scripts['test:all']]).toEqual([
      'vitest run --exclude "test/gates/**"',
      'vitest run test/gates',
      'vitest run',
    ]);
  });

  it('keep the gate proofs out of test/ itself: no app test is named like one or uses their helpers', () => {
    expect(APP_TESTS.filter((file) => GATE_TESTS.includes(basename(file)))).toEqual([]);
    expect(
      APP_TESTS.filter((file) => readFileSync(join(root, file), 'utf8').includes('gates/helpers'))
    ).toEqual([]);
  });

  it('are run by the shipped CI as two steps, both after typecheck', () => {
    const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
    const steps = ci.split('\n').filter((line) => line.includes('- run: npm'));

    expect(steps.slice(-4)).toEqual([
      '      - run: npm run typecheck',
      '      - run: npm test',
      '      - run: npm run test:gates',
      '      - run: npm run build',
    ]);
  });
});

describe('TS what each script runs', () => {
  it(
    'a failing gate proof turns test:gates red and leaves npm test green',
    () => {
      const change = {
        remove: NONE,
        write: { [join(GATES, 'planted.test.ts')]: FAILS, 'test/planted-app.test.ts': PASSES },
      };

      expect(inCopy(change, ['npm', 'run', 'test:gates']).failed).toBe(true);
      expect(inCopy(change, ['npm', 'test']).failed).toBe(false);
    },
    SLOW
  );

  it(
    'a failing NEW app test in test/ turns npm test red, and the gate proofs stay green',
    () => {
      const change = { remove: NONE, write: { 'test/planted-app.test.ts': FAILS } };

      expect(inCopy(change, ['npm', 'test']).failed).toBe(true);
      expect(inCopy(change, ['npm', 'run', 'test:gates']).output).toContain('No test files found');
    },
    SLOW
  );

  it(
    'a new passing app test runs under npm test without being listed anywhere, and not under test:gates',
    () => {
      const change = { remove: NONE, write: { 'test/planted-app.test.ts': PASSES } };
      const { failed, output } = inCopy(change, ['npm', 'test']);

      expect(failed).toBe(false);
      expect(output).toContain('Test Files  1 passed (1)');
      expect(inCopy(change, ['npm', 'run', 'test:gates']).output).not.toContain('planted-app');
    },
    SLOW
  );
});
