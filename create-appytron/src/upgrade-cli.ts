#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUpgrade } from './upgrade.js';

function resolveTemplateDir(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // dist/
  const candidates = [
    resolve(here, '..', 'template'), // bundled (published)
    resolve(here, '..', '..', 'template'), // repo-local dev
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error('appytron-upgrade: template not found');
  return found;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const yes = args.includes('--yes') || args.includes('-y');
  const targetDir = process.cwd();
  const templateDir = resolveTemplateDir();

  const { applied, needsReview } = await runUpgrade(templateDir, targetDir, { yes });

  console.log(`\nAppyTron upgrade — ${applied.length} applied, ${needsReview.length} to review\n`);
  for (const p of applied) console.log(`  ✓ ${p}`);
  for (const p of needsReview) console.log(`  ~ ${p}  (recipe — re-run with --yes to apply)`);
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
