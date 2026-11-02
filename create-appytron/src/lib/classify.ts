export type Tier = 'auto' | 'recipe' | 'never' | 'owned';

/**
 * Framework-owned files that update **silently** on upgrade — this is how a bug fix
 * (e.g. the preload `.mjs` path fix) reaches every scaffolded app. Includes the Tier-2
 * primitives (they are AppyTron's, carried as template source) and build config.
 */
const AUTO = new Set([
  'electron.vite.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'tsconfig.web.json',
  // AF4: type-checks test/ with the test aliases; tsconfig.json references it.
  'tsconfig.tests.json',
  'vitest.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'src/main/window-manager.ts',
  'src/main/ipc-router.ts',
  'src/main/create-console.ts',
  'src/main/file-author.ts',
  'src/main/process-supervisor.ts',
  'src/main/updater.ts',
  'src/preload/index.ts',
  'src/preload/index.d.ts',
  // Gate-owned files (ladder). Each later gate adds its own here in the same PR (or to CREATE_IF_ABSENT when an app may already have one). test/gate-guard.test.ts fails when a file at the template root, under lint/ or under .github/ is none of: auto, create-if-absent, or named in its APP_OWN_FILES. Files elsewhere (src/, test/) are not checked.
  'eslint.config.js',
  // eslint.config.js reads it to switch off the rules Oxlint owns, so the two travel together.
  '.oxlintrc.json',
  // G08 duplicate gate: one config per scope (source, tests), both read by `npm run dup`.
  '.jscpd.json',
  '.jscpd.tests.json',
  // G11 dead-code and cycle gate: Knip's config (the one ruled exemption lives here) and the dependency-cruiser rules.
  'knip.json',
  '.dependency-cruiser.cjs',
  // G12e: the alias list the dependency-cruiser scan reads, so an import through any alias is followed to its file.
  'tsconfig.boundaries.json',
]);

/**
 * Directories whose .js files are all framework-owned (the lint rules eslint.config.js imports).
 * A file of the app's own dropped in one of these is overwritten if the template ships the same name.
 */
const AUTO_DIR_PREFIXES = ['lint/'];

/** Project identity — never overwritten by an upgrade. */
const OWNED = new Set([
  'package.json',
  'electron-builder.yml',
  'appytron.json',
  // The ignore file is the app's once scaffolded: a customised one must survive an upgrade. Template name and generated name.
  'gitignore',
  '.gitignore',
  // Create-if-absent files (CREATE_IF_ABSENT in gate-manifest.ts): written once when the app has none, never overwritten.
  '.prettierrc',
  '.prettierignore',
  '.github/workflows/ci.yml',
]);

/**
 * Classify a template-relative path into an upgrade tier:
 * - `auto`   — framework file, overwrite silently
 * - `recipe` — skill file (.claude/skills/**), show a diff / confirm
 * - `owned`  — project identity, never touch
 * - `never`  — the developer's app code (renderer, the app's own main entry + IPC
 *              contract, tests, README), never touch
 */
export function classify(relPath: string): Tier {
  const p = relPath.split('\\').join('/');
  if (p.startsWith('.claude/')) return 'recipe';
  if (OWNED.has(p)) return 'owned';
  if (AUTO.has(p) || AUTO_DIR_PREFIXES.some((d) => p.startsWith(d) && p.endsWith('.js'))) return 'auto';
  return 'never';
}
