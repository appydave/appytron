/**
 * G16 no re-exports: a module may export only what it declares. Caught: export * from,
 * export * as ns from, export { x } from, export type { x } from, `import x; export { x }`,
 * `import x; export default x` (also `x as T`, `x satisfies T`, `x!`), `import x = require(..); export = x`,
 * `export import C = X`, and `export type T = Imported` (a bare alias of an imported name).
 * NOT caught: a binding copied through a variable (`const y = x; export { y }`), a derived type
 * (`export type T = Imported<U>`, `export interface I extends Imported {}`), and `export default` of a call or
 * member of an import (`export default x.y`). Each is a new declaration or expression, not the same binding.
 *
 * A type a public signature uses but its module does not export (ConsoleContext, ProcessStatus, LogChunk,
 * kept private because Knip rejects an unused export and cannot exempt one by name; its JSDoc public tag is
 * banned by no-disable-directives.js): a consumer derives it from the exported type that uses it, and
 * never re-exports it. `Parameters<CreateConsoleOptions['onReady']>[0]` is the ConsoleContext;
 * `ManagedProcess['status']` is the ProcessStatus; `Parameters<ManagedProcess['onLog']>[0]` is the
 * LogChunk. test/public-types.test.ts compiles each one.
 */
const WHY = 'A re-export hides the real dependency from import-graph checks.';

function importedNames(program) {
  const names = new Set();

  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
      node.specifiers.forEach((specifier) => names.add(specifier.local.name));
    }

    if (node.type === 'TSImportEqualsDeclaration') {
      names.add(node.id.name);
    }
  }

  return names;
}

function say(context, node, what) {
  context.report({
    node,
    message: `No re-exports (${what}). Import it from its real module where it is used. ${WHY}`,
  });
}

const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);

/** The identifier a default export or `export =` is, looking through `as T`, `satisfies T` and `!`. */
function identifierName(expression) {
  let node = expression;

  while (WRAPPERS.has(node.type)) {
    node = node.expression;
  }

  return node.type === 'Identifier' ? node.name : undefined;
}

/** The imported name a type alias is a bare alias of (no type arguments, no parameters), if any. */
function aliasedImport(alias, imported) {
  const target = alias.typeAnnotation;

  if (alias.typeParameters || target.type !== 'TSTypeReference' || target.typeArguments) {
    return undefined;
  }

  const { typeName } = target;

  return typeName.type === 'Identifier' && imported.has(typeName.name) ? typeName.name : undefined;
}

/** `export type T = Imported` and `export import C = X`: a declaration that only names another module's binding. */
function reportDeclaration(context, node, imported) {
  const declaration = node.declaration;

  if (declaration?.type === 'TSImportEqualsDeclaration') {
    say(context, node, `export import ${declaration.id.name} = ..`);
  }

  if (declaration?.type !== 'TSTypeAliasDeclaration') {
    return;
  }

  const name = aliasedImport(declaration, imported);

  if (name !== undefined) {
    say(context, node, `type '${declaration.id.name}' is an alias of imported '${name}'`);
  }
}

const noReexport = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    let imported = new Set();

    return {
      Program(program) {
        imported = importedNames(program);
      },
      ExportAllDeclaration(node) {
        say(context, node, `export * from '${node.source.value}'`);
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          say(context, node, `export { .. } from '${node.source.value}'`);

          return;
        }

        reportDeclaration(context, node, imported);

        for (const specifier of node.specifiers) {
          if (imported.has(specifier.local.name)) {
            say(context, specifier, `imported '${specifier.local.name}' exported again`);
          }
        }
      },
      ExportDefaultDeclaration(node) {
        const name = identifierName(node.declaration);

        if (name !== undefined && imported.has(name)) {
          say(context, node, `imported '${name}' exported as default`);
        }
      },
      TSExportAssignment(node) {
        const name = identifierName(node.expression);

        if (name !== undefined && imported.has(name)) {
          say(context, node, `imported '${name}' exported with export =`);
        }
      },
    };
  },
};

export const exportsPlugin = { rules: { 'no-reexport': noReexport } };
export const exportsRules = { 'exports/no-reexport': 'error' };
