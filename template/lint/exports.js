/**
 * G16 no re-exports: a module may export only what it declares. Caught: export * from,
 * export * as ns from, export { x } from, export type { x } from, `import x; export { x }`,
 * `import x; export default x`, and `import x = require(..); export = x`.
 * NOT caught: a binding copied through a variable (`const y = x; export { y }`).
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

        for (const specifier of node.specifiers) {
          if (imported.has(specifier.local.name)) {
            say(context, specifier, `imported '${specifier.local.name}' exported again`);
          }
        }
      },
      ExportDefaultDeclaration(node) {
        const { declaration } = node;

        if (declaration.type === 'Identifier' && imported.has(declaration.name)) {
          say(context, node, `imported '${declaration.name}' exported as default`);
        }
      },
      TSExportAssignment(node) {
        if (node.expression.type === 'Identifier' && imported.has(node.expression.name)) {
          say(context, node, `imported '${node.expression.name}' exported with export =`);
        }
      },
    };
  },
};

export const exportsPlugin = { rules: { 'no-reexport': noReexport } };
export const exportsRules = { 'exports/no-reexport': 'error' };
