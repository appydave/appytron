#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const appName = args.find((a) => !a.startsWith('-'));
  if (!appName) {
    console.error('usage: create-appytron <app-name> [--core <version>]');
    process.exit(1);
  }

  const coreFlag = args.indexOf('--core');
  const coreVersion = coreFlag >= 0 ? args[coreFlag + 1] : undefined;

  const templateDir = resolveTemplateDir();
  const targetDir = resolve(process.cwd(), appName);

  if (existsSync(targetDir)) {
    console.error(`create-appytron: target already exists: ${targetDir}`);
    process.exit(1);
  }

  const result = await scaffold({ templateDir, targetDir, appName, coreVersion });

  console.log(`\n✓ Scaffolded ${appName} (${result.files} files)\n  ${targetDir}\n`);
  console.log('Next:');
  console.log(`  cd ${appName}`);
  console.log('  npm install');
  console.log('  npm run dev\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
