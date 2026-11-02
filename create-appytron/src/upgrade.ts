import { promises as fs } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { classify, type Tier } from './lib/classify.js';
import { CREATE_IF_ABSENT } from './lib/gate-manifest.js';
import { mergeGatePackage, type Pkg } from './lib/merge-package.js';

const SKIP_DIRS = new Set([
  'node_modules', 'out', 'dist', '.git', '.turbo',
  // Lockfiles: never propagate the template's dev `file:`-pinned lockfile into an app.
  'package-lock.json', 'bun.lock', 'yarn.lock', 'pnpm-lock.yaml',
]);

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
  /** Rows written to UPGRADE_TODO.md this run (entries the app customised, left unchanged). */
  todo: string[];
}

const TODO_FILE = 'UPGRADE_TODO.md';
const TODO_HEADER = '# Upgrade to-do\n\nThe last `appytron-upgrade` left these as you have them:\n\n';

/** The text without the lines that are exactly `line` (and nothing else). */
function withoutLine(text: string, line: string): string {
  return text
    .split('\n')
    .filter((each) => each !== line)
    .join('\n');
}

/**
 * Create-if-absent: write the template's copy only when the app has none. A different copy is the
 * app's own and stays; entries with a `hint` also return a to-do row naming what the template's adds.
 */
async function createIfAbsent(
  templateDir: string,
  targetDir: string,
): Promise<{ written: string[]; rows: string[] }> {
  const written: string[] = [];
  const rows: string[] = [];
  for (const { from, to, hint, onWrite, dropLine } of CREATE_IF_ABSENT) {
    const template = await read(join(templateDir, from));
    if (template === null) continue;
    const body = dropLine === undefined ? template : withoutLine(template, dropLine);
    const current = await read(join(targetDir, to));
    if (current === null) {
      await fs.mkdir(dirname(join(targetDir, to)), { recursive: true });
      await fs.writeFile(join(targetDir, to), body);
      written.push(to);
      if (onWrite !== undefined) rows.push(`- ${to}: written by this upgrade; ${onWrite}`);
    } else if (hint !== undefined && current !== body) {
      rows.push(`- ${to}: yours differs from the framework's, so it was left as it is. The framework's version adds ${hint}; compare it with \`appytron-upgrade\`'s template copy and merge what you want.`);
    }
  }
  return { written, rows };
}

/** Add the gate scripts/devDependencies the app lacks (never replacing a value); returns rows for customised ones. */
async function mergeGateEntries(templateDir: string, targetDir: string): Promise<string[]> {
  const pkgPath = join(targetDir, 'package.json');
  const appRaw = await read(pkgPath);
  if (appRaw === null) return [];
  const template = JSON.parse((await read(join(templateDir, 'package.json'))) ?? '{}') as Pkg;
  const { pkg, added, todo } = mergeGatePackage(template, JSON.parse(appRaw) as Pkg);
  if (added.length > 0) await fs.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return todo;
}

/** Append the rows not already in UPGRADE_TODO.md (created only when there is one); returns the new rows. */
async function writeTodo(targetDir: string, rows: string[]): Promise<string[]> {
  const todoPath = join(targetDir, TODO_FILE);
  const existing = await read(todoPath);
  const fresh = rows.filter((row) => !(existing ?? '').includes(row));
  if (fresh.length > 0) {
    await fs.writeFile(todoPath, `${existing ?? TODO_HEADER}${fresh.join('\n')}\n`);
  }
  return fresh;
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
  const created = await createIfAbsent(templateDir, targetDir);
  result.applied.push(...created.written);
  const todo = await writeTodo(targetDir, [...(await mergeGateEntries(templateDir, targetDir)), ...created.rows]);

  const baseline = JSON.parse(baselineRaw) as Record<string, unknown>;
  baseline['lastUpgrade'] = options.now ?? new Date().toISOString();
  await fs.writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);

  return { ...result, targetDir, todo };
}
