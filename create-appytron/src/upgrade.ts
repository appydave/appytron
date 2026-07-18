import { promises as fs } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { classify, type Tier } from './lib/classify.js';

const SKIP_DIRS = new Set(['node_modules', 'out', 'dist', '.git', '.turbo']);

export type UpgradeAction = 'new' | 'update' | 'unchanged' | 'skip';

export interface UpgradeEntry {
  path: string;
  tier: Tier;
  action: UpgradeAction;
}

export interface UpgradePlan {
  entries: UpgradeEntry[];
}

async function walk(dir: string, base = dir, acc: string[] = []): Promise<string[]> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, base, acc);
    else acc.push(relative(base, full));
  }
  return acc;
}

async function read(path: string): Promise<string | null> {
  return fs.readFile(path, 'utf8').catch(() => null);
}

/**
 * Compute what an upgrade WOULD do (no writes). Walks the template, classifies each
 * file, and diffs it against the target app.
 */
export async function planUpgrade(templateDir: string, targetDir: string): Promise<UpgradePlan> {
  const files = await walk(templateDir);
  const entries: UpgradeEntry[] = [];
  for (const path of files) {
    const tier = classify(path);
    const tmpl = await read(join(templateDir, path));
    const target = await read(join(targetDir, path));

    let action: UpgradeAction;
    if (tier === 'never' || tier === 'owned') action = 'skip';
    else if (target === null) action = 'new';
    else if (tmpl === target) action = 'unchanged';
    else action = 'update';

    entries.push({ path, tier, action });
  }
  return { entries };
}

export interface ApplyOptions {
  /** Also apply `recipe`-tier files (skill diffs). Default false → they go to `needsReview`. */
  yes?: boolean;
}

export interface ApplyResult {
  applied: string[];
  needsReview: string[];
}

/**
 * Apply a plan: `auto` files land silently; `recipe` files land only with `yes`
 * (otherwise they are reported for review). `never`/`owned` are never touched.
 */
export async function applyUpgrade(
  plan: UpgradePlan,
  templateDir: string,
  targetDir: string,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const applied: string[] = [];
  const needsReview: string[] = [];

  for (const entry of plan.entries) {
    if (entry.action === 'unchanged' || entry.action === 'skip') continue;
    const copy = async (): Promise<void> => {
      const to = join(targetDir, entry.path);
      await fs.mkdir(dirname(to), { recursive: true });
      await fs.copyFile(join(templateDir, entry.path), to);
    };
    if (entry.tier === 'auto') {
      await copy();
      applied.push(entry.path);
    } else if (entry.tier === 'recipe') {
      if (options.yes) {
        await copy();
        applied.push(entry.path);
      } else {
        needsReview.push(entry.path);
      }
    }
  }
  return { applied, needsReview };
}

export interface RunUpgradeResult extends ApplyResult {
  targetDir: string;
}

/**
 * Full upgrade: verify the app has an `appytron.json` baseline, plan, apply, and
 * stamp `lastUpgrade`. Throws if the target isn't an AppyTron app.
 */
export async function runUpgrade(
  templateDir: string,
  targetDir: string,
  options: ApplyOptions & { now?: string } = {},
): Promise<RunUpgradeResult> {
  const baselinePath = join(targetDir, 'appytron.json');
  const baselineRaw = await read(baselinePath);
  if (baselineRaw === null) {
    throw new Error(`not an AppyTron app (no appytron.json): ${targetDir}`);
  }

  const plan = await planUpgrade(templateDir, targetDir);
  const result = await applyUpgrade(plan, templateDir, targetDir, options);

  const baseline = JSON.parse(baselineRaw) as Record<string, unknown>;
  baseline['lastUpgrade'] = options.now ?? new Date().toISOString();
  await fs.writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);

  return { ...result, targetDir };
}
