import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from '../src/lib/classify';
import { runUpgrade } from '../src/upgrade';

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

/** The upgrade writes the template's ci.yml without the one step that runs the gate proofs, because it does not carry them. */
describe('the ci.yml an upgrade writes has no test:gates step', () => {
  const TEMPLATE = resolve(REPO, 'template');
  const STEP = '      - run: npm run test:gates';
  let app: string;
  beforeEach(async () => {
    app = await fs.mkdtemp(join(tmpdir(), 'appytron-ci-'));
    await fs.writeFile(join(app, 'appytron.json'), '{}\n');
    await fs.writeFile(join(app, 'package.json'), JSON.stringify({ name: 'old' }));
  });
  afterEach(async () => {
    await fs.rm(app, { recursive: true, force: true });
  });

  it('equals the template ci.yml minus that one line, compared not hard-coded', async () => {
    const template = await fs.readFile(join(TEMPLATE, '.github/workflows/ci.yml'), 'utf8');
    expect(template.split('\n').filter((line) => line === STEP)).toHaveLength(1);

    await runUpgrade(TEMPLATE, app);
    const written = await fs.readFile(join(app, '.github/workflows/ci.yml'), 'utf8');

    expect(written.split('\n')).toEqual(template.split('\n').filter((line) => line !== STEP));
    expect(written).not.toContain('test:gates');
  });

  it('says why in UPGRADE_TODO.md, and leaves an existing ci.yml alone', async () => {
    await runUpgrade(TEMPLATE, app);
    expect(await fs.readFile(join(app, 'UPGRADE_TODO.md'), 'utf8')).toContain(
      'gate proofs are not carried to upgraded apps, so CI has no test:gates step',
    );

    const own = await fs.mkdtemp(join(tmpdir(), 'appytron-ci-own-'));
    try {
      await fs.writeFile(join(own, 'appytron.json'), '{}\n');
      await fs.writeFile(join(own, 'package.json'), JSON.stringify({ name: 'old' }));
      await fs.mkdir(join(own, '.github/workflows'), { recursive: true });
      await fs.writeFile(join(own, '.github/workflows/ci.yml'), 'mine\n');
      await runUpgrade(TEMPLATE, own);
      expect(await fs.readFile(join(own, '.github/workflows/ci.yml'), 'utf8')).toBe('mine\n');
    } finally {
      await fs.rm(own, { recursive: true, force: true });
    }
  });
});
