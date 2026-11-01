/**
 * The ONE list of package.json entries an upgrade adds to an existing app (names only; the
 * command or version range is read from the template's package.json, so no value lives twice).
 * Every gate PR that adds a script or devDependency registers it here; test/gate-guard.test.ts fails on a template script or devDependency that is neither listed here nor named app-own in the test.
 */
export const GATE_SCRIPTS = ['lint', 'format:check'] as const;

export const GATE_DEV_DEPS = [
  '@eslint/js',
  '@stylistic/eslint-plugin',
  'eslint',
  'eslint-plugin-react',
  'eslint-plugin-react-hooks',
  'globals',
  'prettier',
  'typescript-eslint',
] as const;

/**
 * Files written only when the app has none (never overwritten: 0.2.0 shipped none of them, so an existing one
 * is the app's own). `hint` set = a different existing copy also gets an UPGRADE_TODO.md row naming what the
 * template's adds. Classified `owned`, so the upgrade walk never touches them. Every gate PR that adds a file
 * the app may already have registers it here; test/gate-guard.test.ts fails on an unregistered file at the template root, under lint/ or under .github/.
 */
export const CREATE_IF_ABSENT: readonly { from: string; to: string; hint?: string }[] = [
  { from: 'gitignore', to: '.gitignore' },
  { from: '.prettierrc', to: '.prettierrc', hint: 'the shared Prettier style (single quotes, width 100, es5 commas)' },
  { from: '.prettierignore', to: '.prettierignore', hint: 'the ignore paths the format check relies on' },
  {
    from: '.github/workflows/ci.yml',
    to: '.github/workflows/ci.yml',
    hint: 'the lint, format check, typecheck, test and build steps',
  },
];
