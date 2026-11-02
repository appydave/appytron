// G10: a parent-relative specifier: '..', '../x', './..', './/../x', as a string or a template literal.
// Caught: import / import type, export from, import(), typeof import(), import x = require(),
// require(), and vi.mock / doMock / unmock / doUnmock / importActual / importMock / requireActual /
// requireMock. NOT caught: import.meta.glob('../x'), a vi that has been aliased, a specifier built
// at run time, require.resolve('../x'), `/// <reference path>`, `declare module '../x'`, vi['mock'](...).
// Filesystem strings such as join(__dirname, '../preload') are not specifiers and stay allowed.
const PARENT = String.raw`/^(\.\/+)*\.\.(\/|$)/`;
const MOCKS = 'mock|doMock|unmock|doUnmock|importActual|importMock|requireActual|requireMock';

const parentSpecifier = (node, path) =>
  `${node}:matches([${path}.value=${PARENT}], [${path}.quasis.0.value.cooked=${PARENT}])`;

const parentImportSelectors = [
  parentSpecifier('ImportDeclaration', 'source'),
  parentSpecifier('ExportAllDeclaration', 'source'),
  parentSpecifier('ExportNamedDeclaration', 'source'),
  parentSpecifier('ImportExpression', 'source'),
  parentSpecifier('TSImportType', 'argument.literal'),
  parentSpecifier('TSExternalModuleReference', 'expression'),
  parentSpecifier("CallExpression[callee.name='require']", 'arguments.0'),
  parentSpecifier(
    `CallExpression[callee.object.name='vi'][callee.property.name=/^(${MOCKS})$/]`,
    'arguments.0'
  ),
];

const SAME_FOLDER = "A file in the same folder stays './x'.";
const alias = (names) => `No '../' imports: use a root alias. ${names} ${SAME_FOLDER}`;
const NO_ALIAS = `No '../' imports: no root alias resolves in this folder. ${SAME_FOLDER}`;

// The remedy must work where the file is, so each folder names only the aliases that resolve there
// (tsconfig paths, electron.vite.config.ts, vitest.config.ts). First entry is the fallback for any
// source file no later entry names; a later entry replaces it for its own files.
const ROOT_IMPORT_SCOPES = [
  { name: 'fallback', files: ['**/*.{ts,tsx,js,mjs,cjs}'], message: NO_ALIAS },
  {
    name: 'main',
    files: ['src/main/**'],
    message: alias('@main/* is src/main; @shared/* is src/shared.'),
  },
  {
    name: 'preload',
    files: ['src/preload/**'],
    message: alias('@preload/* is src/preload; @shared/* is src/shared.'),
  },
  { name: 'shared', files: ['src/shared/**'], message: alias('@shared/* is src/shared.') },
  {
    name: 'renderer',
    files: ['src/renderer/src/**'],
    message: alias('@/* is src/renderer/src; @shared/* is src/shared.'),
  },
  {
    name: 'tests',
    files: ['test/**'],
    message: alias(
      '@shared/* is src/shared, @main/* is src/main, @preload/* is src/preload, @lint/* is lint, @root/* is the project root.'
    ),
  },
];

// no-restricted-syntax has one options array per file: G04's member-count selectors and these must
// be listed together, or the later block silently replaces the earlier. One config block per scope.
export const rootImportConfigs = (sizeSelectors) =>
  ROOT_IMPORT_SCOPES.map(({ name, files, message }) => ({
    name: `quality/root-imports/${name}`,
    files,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...sizeSelectors,
        ...parentImportSelectors.map((selector) => ({ selector, message })),
      ],
    },
  }));
