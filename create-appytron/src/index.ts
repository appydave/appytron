#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from './scaffold.js';

function resolveTemplateDir(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // dist/
  const candidates = [
    resolve(here, '..', 'template'), // bundled (published package)
    resolve(here, '..', '..', 'template'), // repo-local dev (appytron/template)
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error(`create-appytron: template not found (looked in ${candidates.join(', ')})`);
  return found;
}

const VALUE_FLAGS = new Set(['--core', '--into']);

function parseArgs(argv: string[]): {
  positional?: string;
  linkCore: boolean;
  here: boolean;
  force: boolean;
  into?: string;
  core?: string;
} {
  const positionals: string[] = [];
  let linkCore = false;
  let here = false;
  let force = false;
  let into: string | undefined;
  let core: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('-')) {
      if (a === '--link-core') linkCore = true;
      else if (a === '--here') here = true;
      else if (a === '--force') force = true;
      else if (a === '--into') into = argv[++i];
      else if (a === '--core') core = argv[++i];
      continue;
    }
    positionals.push(a);
  }
  return { positional: positionals[0], linkCore, here, force, into, core };
}

async function main(): Promise<void> {
  const { positional, linkCore, here, force, into, core } = parseArgs(process.argv.slice(2));

  // Resolve target + whether we're merging into an existing dir.
  let targetDir: string;
  let appName: string;
  let merge = false;

  if (into) {
    targetDir = resolve(process.cwd(), into);
    appName = positional ?? basename(targetDir);
    merge = true;
  } else if (here) {
    targetDir = process.cwd();
    appName = positional ?? basename(targetDir);
    merge = true;
  } else {
    if (!positional) {
      console.error(
        'usage: create-appytron <app-name> [--link-core] [--core <version|file:path>]\n' +
          '       create-appytron [<app-name>] --into <dir> [--force]\n' +
          '       create-appytron [<app-name>] --here [--force]',
      );
      process.exit(1);
    }
    appName = positional;
    targetDir = resolve(process.cwd(), appName);
    if (existsSync(targetDir)) {
      console.error(
        `create-appytron: target already exists: ${targetDir}\n` +
          '  use --here (from inside it) or --into <dir> to merge into an existing folder.',
      );
      process.exit(1);
    }
  }

  const templateDir = resolveTemplateDir();
  const result = await scaffold({
    templateDir,
    targetDir,
    appName,
    linkCore,
    coreVersion: core,
    merge,
    force,
  });

  console.log(`\n✓ Scaffolded ${appName} (${result.files} files)\n  ${targetDir}`);
  if (result.skipped.length > 0) {
    console.log(`\n  skipped ${result.skipped.length} existing file(s) (use --force to overwrite):`);
    for (const p of result.skipped) console.log(`    · ${p}`);
  }
  console.log('\nNext:');
  console.log(`  cd ${targetDir}`);
  console.log('  npm install');
  console.log('  npm run dev\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
