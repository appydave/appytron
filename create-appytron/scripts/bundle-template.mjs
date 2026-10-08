#!/usr/bin/env node
// CT-0075: put the template INSIDE the package for `npm pack` / `npm publish`.
//
// The template lives at appytron/template, one level above this package, and npm's `files` globs are relative to
// the package root — so `files: ["template/"]` matched nothing and create-appytron@0.1.0 shipped without it
// (docs/BUILD-LOG.md, 2026-08-29). `prepack` copies it in; `postpack` removes the copy again, because
// resolveTemplateDir() prefers a bundled ./template over the repo one and a stale copy would shadow it in dev.
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Same skip list as src/scaffold.ts: build output, deps, VCS, and lockfiles (they pin a dev file: link). */
export const SKIP = new Set([
  'node_modules', 'out', 'dist', '.turbo', '.git', '.DS_Store',
  'package-lock.json', 'bun.lock', 'yarn.lock', 'pnpm-lock.yaml',
]);

export async function bundleTemplate(from, to) {
  await fs.rm(to, { recursive: true, force: true });
  await fs.cp(from, to, { recursive: true, filter: (src) => !SKIP.has(src.split(/[\\/]/).pop()) });
}

export async function cleanTemplate(to) {
  await fs.rm(to, { recursive: true, force: true });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const to = join(pkg, 'template');
  if (process.argv.includes('--clean')) {
    await cleanTemplate(to);
  } else {
    await bundleTemplate(resolve(pkg, '..', 'template'), to);
    // stderr, not stdout: npm passes lifecycle stdout through, and `npm pack --json` must stay parseable JSON.
    console.error(`create-appytron: bundled ../template into ${to}`);
  }
}
