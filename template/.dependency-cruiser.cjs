// G11: no import cycles. G12e: the Electron process boundaries. `--ts-config tsconfig.boundaries.json` is how
// the aliases resolve: it lists every alias (@/, @shared, @main, @preload and the test aliases), so an import
// through any of them is followed to the file it names. An alias that file does not list is reported by
// `no-unresolved-import` instead of being missed. Scope: src, lint, test, root configs.
const REMEDY = {
  renderer:
    'The renderer runs in a web page: it has no Node and no Electron. Move the shared piece into src/shared (import it as @shared/x), or ask the main process over IPC through the preload API.',
  preload:
    'The preload may import only src/shared (as @shared/x), electron and its own folder. Move the shared piece into src/shared; keep anything that needs Node in src/main and reach it over IPC.',
  main: 'The main process must not import the renderer or the preload. Move the shared piece into src/shared (as @shared/x); the preload is built and loaded as its own entry.',
  shared:
    'src/shared is imported by main, preload and renderer, so it may import only itself and the packages zod and @appydave/core: no Node, no Electron, no other package. Keep it to types and plain values.',
};

const NOT_ELECTRON = 'node_modules/electron/';
// The only packages src/shared may import, by name (the single list). Unanchored like NOT_ELECTRON: a symlinked or
// pnpm node_modules resolves outside the project.
const SHARED_PACKAGES = ['zod', '@appydave/core'];
const SHARED_ALLOWED = `node_modules/(${SHARED_PACKAGES.join('|')})/`;

module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'no-unresolved-import',
      severity: 'error',
      comment:
        'An import no file answers to is invisible to the boundary rules. Add the alias to tsconfig.boundaries.json (and to the build that uses it), or fix the specifier.',
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
      to: { path: NOT_ELECTRON },
    },
    {
      name: 'preload-imports-outside-shared',
      severity: 'error',
      comment: REMEDY.preload,
      from: { path: '^src/preload/' },
      to: { pathNot: ['^src/(preload|shared)/', NOT_ELECTRON] },
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
      to: { pathNot: ['^src/shared/', SHARED_ALLOWED] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
  },
};
