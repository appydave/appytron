/**
 * The ONE list of package.json entries an upgrade adds to an existing app (names only; the
 * command or version range is read from the template's package.json, so no value lives twice).
 * Every gate PR that adds a script or devDependency registers it here; test/gate-guard.test.ts enforces it.
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
