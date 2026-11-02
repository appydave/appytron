import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from '../src/lib/classify';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** TS test split: the gate proofs (template/test/gates) must run in the repo CI and the scaffold check, or they silently stop running. */
describe('the template test split reaches the repo CI', () => {
  it('the template job runs npm test and npm run test:gates, in that order, after typecheck', async () => {
    const ci = await fs.readFile(resolve(REPO, '.github/workflows/ci.yml'), 'utf8');
    const job = ci.slice(ci.indexOf('\n  template:'), ci.indexOf('\n  scaffold:'));
    const steps = job.split('\n').filter((line) => line.includes('- run: npm'));
    expect(steps.slice(-4)).toEqual([
      '      - run: npm run typecheck',
      '      - run: npm test',
      '      - run: npm run test:gates',
      '      - run: npm run build',
    ]);
  });

  it('the scaffold check runs both on a freshly scaffolded app', async () => {
    const script = await fs.readFile(resolve(REPO, '.github/scripts/scaffold-check.sh'), 'utf8');
    expect(script).toContain('\nnpm test\nnpm run test:gates\n');
  });

  it('an upgrade never carries or removes test files: gate proofs cannot appear twice in an upgraded app', () => {
    for (const file of ['test/ipc-router.test.ts', 'test/gates/oxlint-gate.test.ts', 'test/gates/helpers/scratch.ts']) {
      expect(classify(file), file).toBe('never');
    }
  });
});
