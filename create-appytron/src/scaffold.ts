import { promises as fs } from 'node:fs';
import { join, relative } from 'node:path';

export interface ScaffoldOptions {
  /** Source template directory (the canonical AppyTron app). */
  templateDir: string;
  /** Where the new app is written. */
  targetDir: string;
  /** The new app's package name. */
  appName: string;
  /** Published @appydave/core version to pin (replaces the dev `file:` link). */
  coreVersion?: string;
  /** create-appytron version recorded as the upgrade baseline. */
  cliVersion?: string;
  /** ISO timestamp for the baseline (injectable for deterministic tests). */
  now?: string;
}

export interface ScaffoldResult {
  files: number;
  targetDir: string;
}

/** Directories never copied into a scaffolded app. */
const SKIP = new Set(['node_modules', 'out', 'dist', '.turbo', '.git']);
const TEMPLATE_APP_NAME = 'appytron-app';
const CORE_DEV_DEP = 'file:../../appydave-foundation/packages/core';

async function copyDir(
  src: string,
  dest: string,
  onFile: (rel: string) => void,
  base = src,
): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to, onFile, base);
    } else {
      await fs.copyFile(from, to);
      onFile(relative(base, from));
    }
  }
}

async function replaceInFile(path: string, from: string, to: string): Promise<void> {
  try {
    const text = await fs.readFile(path, 'utf8');
    await fs.writeFile(path, text.split(from).join(to));
  } catch {
    // A given template version may not have this file — non-fatal.
  }
}

/**
 * Scaffold a new AppyTron app: copy the template, then rewrite the placeholders
 * (app name + the dev `file:` core dependency → a published semver range). Pure
 * string replacement — no template engine — so the template stays a real,
 * runnable project (same rationale as AppyStack).
 */
export async function scaffold(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const { templateDir, targetDir, appName } = options;
  const coreVersion = options.coreVersion ?? '^0.1.0';

  let files = 0;
  await copyDir(templateDir, targetDir, () => {
    files += 1;
  });

  // package.json: app name + core dependency.
  const pkgPath = join(targetDir, 'package.json');
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as {
    name: string;
    dependencies?: Record<string, string>;
  };
  pkg.name = appName;
  if (pkg.dependencies?.['@appydave/core'] === CORE_DEV_DEP) {
    pkg.dependencies['@appydave/core'] = coreVersion;
  }
  await fs.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  // Rewrite the app name where the template hardcodes it.
  await replaceInFile(join(targetDir, 'src/main/index.ts'), TEMPLATE_APP_NAME, appName);
  await replaceInFile(join(targetDir, 'src/renderer/index.html'), 'AppyTron App', appName);

  // Packaging identity (electron-builder.yml): appId, productName, publish repo.
  const builderYml = join(targetDir, 'electron-builder.yml');
  await replaceInFile(builderYml, 'com.appydave.appytron-app', `com.appydave.${appName}`);
  await replaceInFile(builderYml, 'productName: AppyTron App', `productName: ${appName}`);
  await replaceInFile(builderYml, 'repo: appytron', `repo: ${appName}`);

  // Write the upgrade baseline (read by `appytron-upgrade`).
  const baseline = {
    app: appName,
    core: coreVersion,
    createAppytron: options.cliVersion ?? '0.1.0',
    scaffolded: options.now ?? new Date().toISOString(),
  };
  await fs.writeFile(join(targetDir, 'appytron.json'), `${JSON.stringify(baseline, null, 2)}\n`);

  return { files, targetDir };
}
