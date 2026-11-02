import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
const scripts = manifest().scripts;

describe('TS the test scripts', () => {
  it('are exactly: test excludes test/gates, test:gates runs only it, test:all runs both in one run', () => {
    expect([scripts.test, scripts['test:gates'], scripts['test:all']]).toEqual([
      'vitest run --exclude "test/gates/**"',
      'vitest run test/gates',
      'vitest run',
    ]);
  });

  it('keep the gate proofs out of test/ itself: every test there is an app test', () => {
    const appTests = readdirSync(join(root, 'test')).filter((file) => file.endsWith('.test.ts'));

    expect(appTests.sort()).toEqual([
      'file-author.test.ts',
      'ipc-router.test.ts',
      'preload.test.ts',
      'process-supervisor.test.ts',
      'public-types.test.ts',
    ]);
  });

  it('are run by the shipped CI as two steps, both after typecheck', () => {
    const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
    const steps = ci.split('\n').filter((line) => line.includes('- run: npm'));

    expect(steps.slice(-4)).toEqual([
      '      - run: npm run typecheck',
      '      - run: npm test',
      '      - run: npm run test:gates --if-present',
      '      - run: npm run build',
    ]);
  });
});

describe('TS what each script runs', () => {
  it(
    'a failing gate proof turns test:gates red and leaves npm test green',
    () => {
      const change = { remove: ONLY, write: { [join(GATES, 'planted.test.ts')]: FAILS } };

      expect(inCopy(change, ['npm', 'run', 'test:gates']).failed).toBe(true);
      expect(inCopy(change, ['npm', 'test']).failed).toBe(false);
    },
    SLOW
  );

  it(
    'a failing NEW app test in test/ turns npm test red, and the gate proofs stay green',
    () => {
      const change = { remove: ONLY, write: { 'test/planted-app.test.ts': FAILS } };

      expect(inCopy(change, ['npm', 'test']).failed).toBe(true);
      expect(inCopy(change, ['npm', 'run', 'test:gates']).output).toContain('No test files found');
    },
    SLOW
  );

  it(
    'a new passing app test runs under npm test without being listed anywhere, and not under test:gates',
    () => {
      const change = { remove: ONLY, write: { 'test/planted-app.test.ts': PASSES } };
      const { failed, output } = inCopy(change, ['npm', 'test']);

      expect(failed).toBe(false);
      expect(output).toContain('Test Files  6 passed (6)');
      expect(inCopy(change, ['npm', 'run', 'test:gates']).output).not.toContain('planted-app');
    },
    SLOW
  );
});
