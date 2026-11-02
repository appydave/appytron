/**
 * The ONE list of package.json entries an upgrade adds to an existing app (names only; the
 * command or version range is read from the template's package.json, so no value lives twice).
 * Every gate PR that adds a script or devDependency registers it here; test/gate-guard.test.ts fails on a template script or devDependency that is neither listed here nor named app-own in the test.
 */
// `postinstall` (E1) is not a gate: it is listed so an upgrade also gives existing apps the Electron binary download.
export const GATE_SCRIPTS = ['lint', 'format:check', 'postinstall', 'dup', 'deadcode', 'typecheck:tests'] as const;

/** A row for UPGRADE_TODO.md when the upgrade ADDS the entry (key `section.name`): what the app owner must do by hand. */
export const ADDED_ENTRY_NOTES: Readonly<Record<string, string>> = {
  'scripts.postinstall':
    'added by this upgrade; it downloads the Electron binary on a plain `npm install`. Set ELECTRON_SKIP_BINARY_DOWNLOAD=1 in your CI install step so CI does not download ~100 MB per run.',
  'scripts.dup':
    'added by this upgrade; it fails on any block of more than 5 lines and 50 tokens repeated in your source, or in your tests (judged apart). If you use the ci.yml this upgrade wrote, it already runs `npm run dup` after `npm run lint`; if your CI is a file of your own, add `npm run dup` after `npm run lint`. Fix a clone by extracting the shared code into one function or helper; never mark it ignored (the guard refuses a jscpd ignore comment).',
  'scripts.deadcode':
    'added by this upgrade; it fails on a file nothing imports, an export nothing uses, a dependency nothing needs, and an import cycle. If you use the ci.yml this upgrade wrote, it already runs `npm run deadcode` after `npm run dup`; if your CI is a file of your own, add `npm run deadcode` after `npm run dup`. Delete what is dead (or drop the `export` keyword if only its own file uses it); break a cycle by moving the shared piece into a third file; never mark it ignored (the guard refuses the Knip tags). A file, export or dependency that only a test uses counts as dead (Knip runs once over everything and once over production code). The exemptions are src/main/updater.ts with electron-updater, and src/main/file-author.ts, all named in knip.json. The same script holds the Electron process boundaries (rules in .dependency-cruiser.cjs, aliases read from tsconfig.boundaries.json, both written by this upgrade): the renderer imports nothing from src/main or src/preload and no Node or electron; the preload imports only src/shared and electron; main imports nothing from src/renderer or src/preload; src/shared imports nothing outside src/shared except the packages zod and @appydave/core (no Node, electron or other package). Each finding prints its fix. If you added an alias of your own, add it to tsconfig.boundaries.json too, or the import is reported as unresolved.',
  'scripts.typecheck:tests':
    'added by this upgrade; it type-checks test/ and vitest.config.ts with the test aliases (@main, @preload, @lint, @root) through the new tsconfig.tests.json. Your `typecheck` script is yours and was not changed: add `npm run typecheck:tests` to it (the template runs it last), and to your CI if CI calls tsc directly. Fix what it reports in your tests by hand.',
};

export const GATE_DEV_DEPS = [
  '@eslint/js',
  '@stylistic/eslint-plugin',
  'dependency-cruiser',
  'eslint',
  'eslint-plugin-oxlint',
  'eslint-plugin-react',
  'eslint-plugin-react-hooks',
  'eslint-plugin-sonarjs',
  'globals',
  'jscpd',
  'knip',
  'oxlint',
  'prettier',
  'typescript-eslint',
] as const;

/**
 * Files written only when the app has none (never overwritten: 0.2.0 shipped none of them, so an existing one
 * is the app's own). `hint` set = a different existing copy also gets an UPGRADE_TODO.md row naming what the
 * template's adds; `onWrite` set = writing the file also adds that row (once). Classified `owned`, so the upgrade walk never touches them. Every gate PR that adds a file
 * the app may already have registers it here; test/gate-guard.test.ts fails on an unregistered file at the template root, under lint/ or under .github/.
 */
export const CREATE_IF_ABSENT: readonly { from: string; to: string; hint?: string; onWrite?: string; dropLine?: string }[] = [
  { from: 'gitignore', to: '.gitignore' },
  { from: '.prettierrc', to: '.prettierrc', hint: 'the shared Prettier style (single quotes, width 100, es5 commas)' },
  { from: '.prettierignore', to: '.prettierignore', hint: 'the ignore paths the format check relies on' },
  {
    from: '.github/workflows/ci.yml',
    to: '.github/workflows/ci.yml',
    hint: 'the lint, format check, typecheck, test and build steps',
    // Gate proofs (template/test/gates) are not carried to upgraded apps, so the step that runs them is not written either.
    dropLine: '      - run: npm run test:gates',
    // Order matters: `lint --fix` re-spaces code that `format` then re-wraps; format first leaves files prettier-dirty.
    onWrite:
      'the new CI runs lint and format:check, which fail until your code meets them. Oxlint runs first and stops the lint script, so clear its findings by hand before anything else (a type assertion `as X` becomes a real check or a type guard; no `any`; no `!`). Size limits are not autofixable either: a function over 60 lines, more than 4 parameters, a file over 300 counted lines, or a class, interface or object type with more than 30 members is split by hand (the demo `App` component was 72 lines in 0.2.0; extract the panels). Complexity limits are fixed the same way: a function over cyclomatic 6 (Oxlint `complexity`), cognitive 8 or an expression with more than 3 boolean operators (SonarJS) is split by hand, never suppressed. Duplicates are fixed the same way: `npm run dup` fails on a block of more than 5 lines and 50 tokens repeated in source, or in tests (judged apart); extract the shared code into one function or helper. Dead code and cycles are fixed the same way: `npm run deadcode` (Knip, dependency-cruiser) fails on an unused file, export or dependency and on an import cycle; delete the dead code, or break the cycle by moving the shared piece into a third file. It also fails on a process-boundary import (renderer reaching main, preload or Node; preload reaching anything but src/shared and electron; main reaching the renderer or preload; src/shared reaching anything outside itself): move the shared piece into src/shared. Re-exports are fixed at the use: a barrel (`export * from`, `export { x } from`, or an import exported again) fails lint, so import the name from the module that declares it and delete the barrel. Parent-relative imports are fixed by alias: a `../` specifier fails lint; write `@shared/x` (src/shared), `@main/x` (in src/main), `@preload/x` (in src/preload), `@lint/x` or `@root/x` in tests, `@/x` in the renderer. This upgrade replaced electron.vite.config.ts and vitest.config.ts, so re-add any alias of your own there. Then run `npm run lint -- --fix`, then `npm run format`, then `npm run lint` and `npm run format:check`; fix anything left by hand before you push. Note: gate proofs are not carried to upgraded apps, so CI has no test:gates step.',
  },
];
