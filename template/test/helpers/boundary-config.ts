import { createRequire } from 'node:module';
import { join } from 'node:path';
import { root } from './scratch';

// G12e: the reviewed dependency-cruiser config, pinned whole, and a copy of the real one a mutant can edit.
export interface Rule {
  name: string;
  severity: string;
  comment?: unknown;
  from: { path?: string };
  to: { path?: string; pathNot?: string | string[]; dependencyTypes?: string[] };
}
export interface Config {
  forbidden: Rule[];
  options: { doNotFollow: { path: string }; tsPreCompilationDeps: boolean };
}

export const config = (): Config =>
  structuredClone(createRequire(import.meta.url)(join(root, '.dependency-cruiser.cjs')));
export const ELECTRON = 'node_modules/electron/';

// The remedy each rule prints, word for word: a reversed or swapped sentence must fail.
export const REMEDY = {
  unresolved:
    'An import no file answers to is invisible to the boundary rules. Add the alias to tsconfig.boundaries.json (and to the build that uses it), or fix the specifier.',
  renderer:
    'The renderer runs in a web page: it has no Node and no Electron. Move the shared piece into src/shared (import it as @shared/x), or ask the main process over IPC through the preload API.',
  preload:
    'The preload may import only src/shared (as @shared/x), electron and its own folder. Move the shared piece into src/shared; keep anything that needs Node in src/main and reach it over IPC.',
  main: 'The main process must not import the renderer or the preload. Move the shared piece into src/shared (as @shared/x); the preload is built and loaded as its own entry.',
  shared:
    'src/shared is imported by main, preload and renderer, so it may import only itself: no Node, no Electron, no package. Keep it to types and plain values.',
};

export const PINNED = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'no-unresolved-import',
      severity: 'error',
      comment: REMEDY.unresolved,
      from: { path: '^src/' },
      to: { couldNotResolve: true },
    },
    {
      name: 'renderer-imports-main-or-preload',
      severity: 'error',
      comment: REMEDY.renderer,
      from: { path: '^src/renderer/' },
      to: { path: '^src/(main|preload)/' },
    },
    {
      name: 'renderer-imports-node-or-electron',
      severity: 'error',
      comment: REMEDY.renderer,
      from: { path: '^src/renderer/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'renderer-imports-electron',
      severity: 'error',
      comment: REMEDY.renderer,
      from: { path: '^src/renderer/' },
      to: { path: ELECTRON },
    },
    {
      name: 'preload-imports-outside-shared',
      severity: 'error',
      comment: REMEDY.preload,
      from: { path: '^src/preload/' },
      to: { pathNot: ['^src/(preload|shared)/', ELECTRON] },
    },
    {
      name: 'main-imports-renderer-or-preload',
      severity: 'error',
      comment: REMEDY.main,
      from: { path: '^src/main/' },
      to: { path: '^src/(renderer|preload)/' },
    },
    {
      name: 'shared-imports-outside-shared',
      severity: 'error',
      comment: REMEDY.shared,
      from: { path: '^src/shared/' },
      to: { pathNot: '^src/shared/' },
    },
  ],
  options: { doNotFollow: { path: 'node_modules' }, tsPreCompilationDeps: true },
};
