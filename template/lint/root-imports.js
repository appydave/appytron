// G10: a parent-relative specifier: '..', '../x', './..', './/../x', as a string or a template literal.
// Caught: import / import type, export from, import(), typeof import(), import x = require(),
// require(), and vi.mock / doMock / unmock / doUnmock / importActual / importMock / requireActual /
// requireMock. NOT caught: import.meta.glob('../x'), a vi that has been aliased, a specifier built
// at run time, require.resolve('../x'), `/// <reference path>`, `declare module '../x'`, vi['mock'](...).
// Filesystem strings such as join(__dirname, '../preload') are not specifiers and stay allowed.
const PARENT = String.raw`/^(\.\/+)*\.\.(\/|$)/`;
const MOCKS = 'mock|doMock|unmock|doUnmock|importActual|importMock|requireActual|requireMock';

export const PARENT_IMPORT_MESSAGE =
  "No '../' imports: use a root alias. @shared/* is src/shared, @/* is src/renderer/src; in tests also @main/* (src/main), @preload/* (src/preload), @lint/* (lint), @root/* (the project root). A file in the same folder stays './x'.";

const parentSpecifier = (node, path) =>
  `${node}:matches([${path}.value=${PARENT}], [${path}.quasis.0.value.cooked=${PARENT}])`;

export const parentImportSelectors = [
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

// no-restricted-syntax has one options array per file: G04's member-count selectors and these must
// be listed together, or the later block silently replaces the earlier.
export const restrictedSyntax = (sizeSelectors) => [
  'error',
  ...sizeSelectors,
  ...parentImportSelectors.map((selector) => ({ selector, message: PARENT_IMPORT_MESSAGE })),
];
