import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import oxlint from 'eslint-plugin-oxlint';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'node:url';
import { spacingRules } from './lint/spacing.js';

const NODE = [
  'src/main/**/*.ts',
  'src/preload/**/*.ts',
  'src/shared/**/*.ts',
  'electron.vite.config.ts',
];
// tsconfig.node.json sees preload/index.ts in place of index.d.ts; tsconfig.web.json sees the .d.ts.
const PRELOAD_TYPES = ['src/preload/index.d.ts'];
const RENDERER = ['src/renderer/src/**/*.{ts,tsx}', ...PRELOAD_TYPES];
const SOURCE = ['**/*.{ts,tsx,js,mjs,cjs}'];

// Type-aware rules need a tsconfig that includes the file, so each environment names its own.
const typed = (name, files, project, extra = [], ignores = []) => [
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({ ...c, files, ignores })),
  {
    name,
    files,
    ignores,
    languageOptions: { parserOptions: { project, tsconfigRootDir: import.meta.dirname } },
  },
  ...extra,
];

export default tseslint.config(
  { name: 'ignores', ignores: ['out/**', 'dist/**', 'coverage/**', 'node_modules/**'] },
  // Inline disable comments are ignored: a gate the code can switch off is not a gate.
  { name: 'quality/no-inline-config', linterOptions: { noInlineConfig: true } },
  { name: 'js/recommended', files: SOURCE, ...js.configs.recommended },
  // G03 readable spacing: autofixable, so `npm run lint -- --fix` clears it.
  {
    name: 'quality/spacing',
    files: SOURCE,
    plugins: { '@stylistic': stylistic },
    rules: spacingRules,
  },

  // Main process, preload and shared: Node, tsconfig.node.json.
  ...typed(
    'env/node',
    NODE,
    './tsconfig.node.json',
    [
      {
        name: 'env/node-globals',
        files: NODE,
        ignores: PRELOAD_TYPES,
        languageOptions: { globals: globals.node },
      },
    ],
    PRELOAD_TYPES
  ),

  // Renderer: browser + React, tsconfig.web.json.
  ...typed('env/renderer', RENDERER, './tsconfig.web.json', [
    {
      name: 'env/renderer-react',
      files: RENDERER,
      languageOptions: { globals: globals.browser },
      plugins: { react, 'react-hooks': reactHooks },
      settings: { react: { version: 'detect' } },
      rules: {
        ...react.configs.recommended.rules,
        ...react.configs['jsx-runtime'].rules,
        ...reactHooks.configs.recommended.rules,
      },
    },
  ]),

  // Tests and root configs are in no tsconfig: syntax-level rules only, Node globals.
  ...tseslint.configs.recommended.map((c) => ({
    ...c,
    files: ['test/**/*.ts', 'vitest.config.ts'],
  })),
  {
    name: 'env/tests',
    files: ['test/**/*.ts', 'vitest.config.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },

  // Config and gate scripts run in Node, outside every tsconfig.
  {
    name: 'env/node-scripts',
    files: ['eslint.config.js', 'lint/**/*.js'],
    languageOptions: { globals: globals.node },
  },

  // Last: switch off in ESLint every rule .oxlintrc.json turns on, so each rule has one owner.
  ...oxlint.buildFromOxlintConfigFile(fileURLToPath(new URL('./.oxlintrc.json', import.meta.url)))
);
