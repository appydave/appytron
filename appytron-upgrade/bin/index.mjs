#!/usr/bin/env node
// Thin wrapper: delegate `npx appytron-upgrade` to create-appytron's upgrade engine.
// The upgrade logic + template live in create-appytron; this package exists purely
// for the clean command name (mirrors AppyStack's create-appystack / appystack-upgrade).
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let runUpgrade;
let template;
try {
  ({ runUpgrade } = await import('create-appytron/upgrade'));
  const pkg = require.resolve('create-appytron/package.json');
  template = resolve(dirname(pkg), 'template');
} catch {
  console.error(
    'appytron-upgrade: create-appytron not found. Install it alongside this wrapper:\n' +
      '  npm i -D create-appytron',
  );
  process.exit(1);
}

if (!existsSync(template)) {
  console.error('appytron-upgrade: bundled template not found in create-appytron.');
  process.exit(1);
}

const yes = process.argv.includes('--yes') || process.argv.includes('-y');
const { applied, needsReview } = await runUpgrade(template, process.cwd(), { yes });

console.log(`\nAppyTron upgrade — ${applied.length} applied, ${needsReview.length} to review\n`);
for (const p of applied) console.log(`  ✓ ${p}`);
for (const p of needsReview) console.log(`  ~ ${p}  (recipe — re-run with --yes to apply)`);
console.log('');
