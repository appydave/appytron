/**
 * The ONE list of package.json entries an upgrade adds to an existing app (names only; the
 * command or version range is read from the template's package.json, so no value lives twice).
 * Every gate PR that adds a script or devDependency registers it here; test/gate-guard.test.ts fails on a template script or devDependency that is neither listed here nor named app-own in the test.
 */
// `postinstall` (E1) is not a gate: it is listed so an upgrade also gives existing apps the Electron binary download.
export const GATE_SCRIPTS = ['lint', 'format:check', 'postinstall', 'dup'] as const;

/** A row for UPGRADE_TODO.md when the upgrade ADDS the entry (key `section.name`): what the app owner must do by hand. */
export const ADDED_ENTRY_NOTES: Readonly<Record<string, string>> = {
  'scripts.postinstall':
    'added by this upgrade; it downloads the Electron binary on a plain `npm install`. Set ELECTRON_SKIP_BINARY_DOWNLOAD=1 in your CI install step so CI does not download ~100 MB per run.',
  'scripts.dup':
    'added by this upgrade; it fails on any block of more than 5 lines and 50 tokens repeated in your source, or in your tests (judged apart). Add `npm run dup` to your CI after `npm run lint`. Fix a clone by extracting the shared code into one function or helper; never mark it ignored (the guard refuses a jscpd ignore comment).',
};

export const GATE_DEV_DEPS = [
  '@eslint/js',
  '@stylistic/eslint-plugin',
  'eslint',
  'eslint-plugin-oxlint',
  'eslint-plugin-react',
  'eslint-plugin-react-hooks',
  'eslint-plugin-sonarjs',
  'globals',
  'jscpd',
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
export const CREATE_IF_ABSENT: readonly { from: string; to: string; hint?: string; onWrite?: string }[] = [
  { from: 'gitignore', to: '.gitignore' },
  { from: '.prettierrc', to: '.prettierrc', hint: 'the shared Prettier style (single quotes, width 100, es5 commas)' },
  { from: '.prettierignore', to: '.prettierignore', hint: 'the ignore paths the format check relies on' },
  {
    from: '.github/workflows/ci.yml',
    to: '.github/workflows/ci.yml',
    hint: 'the lint, format check, typecheck, test and build steps',
    // Order matters: `lint --fix` re-spaces code that `format` then re-wraps; format first leaves files prettier-dirty.
    onWrite:
      'the new CI runs lint and format:check, which fail until your code meets them. Oxlint runs first and stops the lint script, so clear its findings by hand before anything else (a type assertion `as X` becomes a real check or a type guard; no `any`; no `!`). Size limits are not autofixable either: a function over 60 lines, more than 4 parameters, a file over 300 counted lines, or a class, interface or object type with more than 30 members is split by hand (the demo `App` component was 72 lines in 0.2.0; extract the panels). Complexity limits are fixed the same way: a function over cyclomatic 6 (Oxlint `complexity`), cognitive 8 or an expression with more than 3 boolean operators (SonarJS) is split by hand, never suppressed. Duplicates are fixed the same way: `npm run dup` fails on a block of more than 5 lines and 50 tokens repeated in source, or in tests (judged apart); extract the shared code into one function or helper. Parent-relative imports are fixed by alias: a `../` specifier fails lint; write `@shared/x` (src/shared), `@main/x`, `@preload/x`, `@lint/x` or `@root/x` in tests, `@/x` in the renderer. This upgrade replaced electron.vite.config.ts and vitest.config.ts, so re-add any alias of your own there. Then run `npm run lint -- --fix`, then `npm run format`, then `npm run lint` and `npm run format:check`; fix anything left by hand before you push.',
  },
];
