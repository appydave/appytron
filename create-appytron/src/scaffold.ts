import { promises as fs, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

export interface ScaffoldOptions {
  /** Source template directory (the canonical AppyTron app). */
  templateDir: string;
  /** Where the new app is written. */
  targetDir: string;
  /** The new app's package name. */
  appName: string;
  /** Published @appydave/core version to pin, OR a raw `file:` link (written verbatim). */
  coreVersion?: string;
  /**
   * Write a `file:` link to @appydave/core **recomputed relative to targetDir** (local dev,
   * before the package is published). Overrides `coreVersion`.
   */
  linkCore?: boolean;
  /** create-appytron version recorded as the upgrade baseline. */
  cliVersion?: string;
  /** ISO timestamp for the baseline (injectable for deterministic tests). */
  now?: string;
  /** Merge into an existing targetDir: copy files that don't exist, skip collisions. */
  merge?: boolean;
  /** In merge mode, overwrite colliding files instead of skipping them. */
  force?: boolean;
}

export interface ScaffoldResult {
  files: number;
  targetDir: string;
  /** Files skipped because they already existed (merge mode, no --force). */
  skipped: string[];
}

/** Directories never copied into a scaffolded app. */
const SKIP = new Set(['node_modules', 'out', 'dist', '.turbo', '.git']);
const TEMPLATE_APP_NAME = 'appytron-app';
const CORE_DEV_DEP = 'file:../../appydave-foundation/packages/core';

interface CopyResult {
  written: string[];
  skipped: string[];
}

async function copyTree(
  src: string,
  dest: string,
  opts: { merge: boolean; force: boolean },
  base = src,
  acc: CopyResult = { written: [], skipped: [] },
): Promise<CopyResult> {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    const rel = relative(base, from);
    if (entry.isDirectory()) {
      await copyTree(from, to, opts, base, acc);
    } else if (opts.merge && existsSync(to) && !opts.force) {
      acc.skipped.push(rel); // real collision — never clobber (docs, .git already skipped above)
    } else {
      await fs.mkdir(dirname(to), { recursive: true });
      await fs.copyFile(from, to);
      acc.written.push(rel);
    }
  }
  return acc;
}

async function replaceInFile(path: string, from: string, to: string): Promise<void> {
  try {
    const text = await fs.readFile(path, 'utf8');
    await fs.writeFile(path, text.split(from).join(to));
  } catch {
    // A given template version may not have this file — non-fatal.
  }
}

/** `file:` link to @appydave/core, recomputed relative to the target location. */
function coreLink(templateDir: string, targetDir: string): string {
  const coreDir = resolve(templateDir, '..', '..', 'appydave-foundation', 'packages', 'core');
  const rel = relative(targetDir, coreDir).split('\\').join('/');
  return `file:${rel}`;
}

/**
 * Scaffold a new AppyTron app: copy the template (merging into an existing dir when asked),
 * then rewrite placeholders — but only in files this scaffold actually wrote, so a merge never
 * clobbers an app's own package.json / docs. Pure string replacement, no template engine.
 */
export async function scaffold(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const { templateDir, targetDir, appName } = options;
  const coreVersion = options.coreVersion ?? '^0.1.0';
  const coreDep = options.linkCore ? coreLink(templateDir, targetDir) : coreVersion;

  const { written, skipped } = await copyTree(templateDir, targetDir, {
    merge: !!options.merge,
    force: !!options.force,
  });
  const wrote = new Set(written);

  if (wrote.has('package.json')) {
    const pkgPath = join(targetDir, 'package.json');
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as {
      name: string;
      dependencies?: Record<string, string>;
    };
    pkg.name = appName;
    if (pkg.dependencies?.['@appydave/core'] === CORE_DEV_DEP) {
      pkg.dependencies['@appydave/core'] = coreDep;
    }
    await fs.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  if (wrote.has('src/main/index.ts')) {
    await replaceInFile(join(targetDir, 'src/main/index.ts'), TEMPLATE_APP_NAME, appName);
  }
  if (wrote.has('src/renderer/index.html')) {
    await replaceInFile(join(targetDir, 'src/renderer/index.html'), 'AppyTron App', appName);
  }
  if (wrote.has('electron-builder.yml')) {
    const yml = join(targetDir, 'electron-builder.yml');
    await replaceInFile(yml, 'com.appydave.appytron-app', `com.appydave.${appName}`);
    await replaceInFile(yml, 'productName: AppyTron App', `productName: ${appName}`);
    await replaceInFile(yml, 'repo: appytron', `repo: ${appName}`);
  }

  // Upgrade baseline — write only if absent (never overwrite an existing app's).
  const baselinePath = join(targetDir, 'appytron.json');
  if (!existsSync(baselinePath)) {
    const baseline = {
      app: appName,
      core: coreDep,
      createAppytron: options.cliVersion ?? '0.1.0',
      scaffolded: options.now ?? new Date().toISOString(),
    };
    await fs.writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  }

  return { files: written.length, targetDir, skipped };
}
