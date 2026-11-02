/**
 * G16 no re-exports: a module may export only what it declares. Caught: export * from,
 * export * as ns from, export { x } from, export type { x } from, `import x; export { x }`,
 * `import x; export default x` (also `x as T`, `<T>x`, `x satisfies T`, `x!`, nested casts),
 * `import x = require(..); export = x`, `export import C = X` and `= require(..)` where X is imported (a local
 * `export import C = LocalNs` is allowed), and `export type T = Imported` or `= ns.Imported` (a bare alias of an
 * imported name or of a member of an imported namespace).
 * Also caught: `export type T = typeof Imported`, `export type T = import('./x').Y`,
 * `export declare const c: typeof Imported`, and an alias of such an alias (`type L = Imported; export type T = L`).
 * NOT caught (each is a new declaration or expression, or needs type resolution, so it is an accepted limit):
 * a binding copied through a variable (`const y = x; export { y }`); a derived type
 * (`export type T = Imported<U>`, `export interface I extends Imported {}`); `export default x.y`;
 * a type reached through a member of a value (`export type T = (typeof Imported)['k']`).
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

    if (node.type === 'TSTypeAliasDeclaration' && aliasedImport(node, names) !== undefined) {
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

const WRAPPERS = new Set([
  'TSAsExpression',
  'TSTypeAssertion',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
]);

/** The identifier a default export or `export =` is, looking through `as T`, `<T>x`, `satisfies T` and `!`. */
function identifierName(expression) {
  let node = expression;

  while (WRAPPERS.has(node.type)) {
    node = node.expression;
  }

  return node.type === 'Identifier' ? node.name : undefined;
}

/** The entity a bare type names (`U`, `ns.U`, `typeof U`) with the prefix that prints it, or undefined. */
function namedEntity(target) {
  if (target.type === 'TSTypeQuery') {
    return { entity: target.exprName, prefix: 'typeof ' };
  }

  if (target.type === 'TSTypeReference' && !target.typeArguments) {
    return { entity: target.typeName, prefix: '' };
  }

  return undefined;
}

/** What a type names from an import: `U`, `typeof U` or `import(..)`; undefined when it is none of them. */
function importedType(target, imported) {
  if (target.type === 'TSImportType') {
    return 'import(..)';
  }

  const named = namedEntity(target);
  const name = named && leftmostName(named.entity);

  return name !== undefined && imported.has(name) ? `${named.prefix}${name}` : undefined;
}

/** The imported name a type alias is a bare alias of (no type arguments, no parameters), if any. */
function aliasedImport(alias, imported) {
  return alias.typeParameters ? undefined : importedType(alias.typeAnnotation, imported);
}

/** The first identifier of `a`, `a.b` or `a.b.c`. */
function leftmostName(entity) {
  let node = entity;

  while (node.type === 'TSQualifiedName') {
    node = node.left;
  }

  return node.type === 'Identifier' ? node.name : undefined;
}

/** `export import C = X` re-exports only when X is imported (or a require); a local namespace is a declaration. */
function reportImportEquals(context, node, declaration, imported) {
  // A require(..) reference has no identifier, so `name` is undefined and it is reported.
  const name = leftmostName(declaration.moduleReference);

  if (name === undefined || imported.has(name)) {
    say(context, node, `export import ${declaration.id.name} = ..`);
  }
}

/** `export declare const c: typeof Imported`: a declaration that only types a value as another module's binding. */
function reportDeclaredConst(context, node, declaration, imported) {
  for (const { id } of declaration.declarations) {
    const name = id.typeAnnotation && importedType(id.typeAnnotation.typeAnnotation, imported);

    if (declaration.declare && name?.startsWith('typeof ')) {
      say(context, node, `declared '${id.name}' is ${name}`);
    }
  }
}

function reportAlias(context, node, declaration, imported) {
  const name = aliasedImport(declaration, imported);

  if (name !== undefined) {
    say(context, node, `type '${declaration.id.name}' is an alias of imported '${name}'`);
  }
}

const DECLARATION_REPORTS = {
  TSImportEqualsDeclaration: reportImportEquals,
  VariableDeclaration: reportDeclaredConst,
  TSTypeAliasDeclaration: reportAlias,
};

/** `export type T = Imported`, `export import C = X` and `export declare const c: typeof X`: a declaration that only names another module's binding. */
function reportDeclaration(context, node, imported) {
  const declaration = node.declaration;

  DECLARATION_REPORTS[declaration?.type]?.(context, node, declaration, imported);
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
