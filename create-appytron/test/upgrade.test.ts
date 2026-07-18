import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../src/scaffold';
import { planUpgrade, applyUpgrade, runUpgrade } from '../src/upgrade';

const TEMPLATE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'template');

describe('upgrade', () => {
  let tmp: string;
  let target: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(join(tmpdir(), 'appytron-upgrade-'));
    target = join(tmp, 'app');
    await scaffold({
      templateDir: TEMPLATE,
      targetDir: target,
      appName: 'app',
      now: '2026-01-01T00:00:00Z',
    });
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('a fresh scaffold has nothing to update', async () => {
    const plan = await planUpgrade(TEMPLATE, target);
    expect(plan.entries.filter((e) => e.action === 'update')).toHaveLength(0);
  });

  it('detects + applies an update to an auto (framework) file', async () => {
    const auto = join(target, 'src/main/window-manager.ts');
    await fs.writeFile(auto, '// locally modified\n');

    const plan = await planUpgrade(TEMPLATE, target);
    const entry = plan.entries.find((e) => e.path === 'src/main/window-manager.ts');
    expect(entry?.tier).toBe('auto');
    expect(entry?.action).toBe('update');

    const res = await applyUpgrade(plan, TEMPLATE, target);
    expect(res.applied).toContain('src/main/window-manager.ts');

    const restored = await fs.readFile(auto, 'utf8');
    const tmpl = await fs.readFile(join(TEMPLATE, 'src/main/window-manager.ts'), 'utf8');
    expect(restored).toBe(tmpl); // framework fix pulled in
  });

  it('never touches owned/never files even when they differ', async () => {
    const plan = await planUpgrade(TEMPLATE, target);
    for (const p of ['package.json', 'src/main/index.ts']) {
      expect(plan.entries.find((e) => e.path === p)?.action).toBe('skip');
    }
  });

  it('recipe files go to review, and apply only with --yes', async () => {
    const recipe = join(target, '.claude/skills/recipe/references/wrap-cli.md');
    await fs.writeFile(recipe, '# modified\n');

    const plan = await planUpgrade(TEMPLATE, target);
    const review = await applyUpgrade(plan, TEMPLATE, target);
    expect(review.needsReview).toContain('.claude/skills/recipe/references/wrap-cli.md');
    expect(review.applied).not.toContain('.claude/skills/recipe/references/wrap-cli.md');

    await fs.writeFile(recipe, '# modified again\n');
    const plan2 = await planUpgrade(TEMPLATE, target);
    const applied = await applyUpgrade(plan2, TEMPLATE, target, { yes: true });
    expect(applied.applied).toContain('.claude/skills/recipe/references/wrap-cli.md');
  });

  it('runUpgrade stamps lastUpgrade and requires an appytron.json baseline', async () => {
    const res = await runUpgrade(TEMPLATE, target, { now: '2026-02-02T00:00:00Z' });
    expect(res.targetDir).toBe(target);
    const baseline = JSON.parse(await fs.readFile(join(target, 'appytron.json'), 'utf8'));
    expect(baseline.lastUpgrade).toBe('2026-02-02T00:00:00Z');

    const bare = join(tmp, 'bare');
    await fs.mkdir(bare);
    await expect(runUpgrade(TEMPLATE, bare)).rejects.toThrow(/not an AppyTron app/);
  });
});
