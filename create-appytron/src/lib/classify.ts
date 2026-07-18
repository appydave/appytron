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
  'vitest.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  '.gitignore',
  'src/main/window-manager.ts',
  'src/main/ipc-router.ts',
  'src/main/create-console.ts',
  'src/main/file-author.ts',
  'src/main/process-supervisor.ts',
  'src/main/updater.ts',
  'src/preload/index.ts',
  'src/preload/index.d.ts',
]);

/** Project identity — never overwritten by an upgrade. */
const OWNED = new Set(['package.json', 'electron-builder.yml', 'appytron.json']);

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
  if (AUTO.has(p)) return 'auto';
  return 'never';
}
