/**
 * G02 no suppression: the lint script fails when gated source carries a comment that switches a
 * check off. ESLint's own `noInlineConfig` ignores inline disable comments but says nothing, and
 * the TypeScript and Oxlint directives are not ESLint's to police, so this is the one guard.
 * Run as `node lint/no-disable-directives.js`; exits 1 and names each hit.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Built from pieces so this file does not trip its own guard.
const DIRECTIVES = ['eslint', 'oxlint']
  .map((tool) => `${tool}-disable`)
  .concat(['ignore', 'expect-error', 'nocheck'].map((name) => `@ts-${name}`));
const SKIP_DIRS = new Set(['node_modules', 'out', 'dist', 'coverage', '.git', '.claude']);
const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      yield* sourceFiles(join(dir, entry.name));
    } else if (entry.isFile() && SOURCE.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

/** Returns `path:line: directive` for every directive found under `root`. */
export function findDisableDirectives(root) {
  const hits = [];

  for (const file of sourceFiles(root)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((text, index) => {
        const directive = DIRECTIVES.find((name) => text.includes(name));

        if (directive) {
          hits.push(`${relative(root, file)}:${index + 1}: ${directive}`);
        }
      });
  }

  return hits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const hits = findDisableDirectives(resolve(import.meta.dirname, '..'));

  for (const hit of hits) {
    console.error(hit);
  }

  if (hits.length > 0) {
    console.error(
      'A disable comment switches a check off, and checks here cannot be switched off. ' +
        'Fix the code the rule points at (a type guard, a null check, a real type) instead of silencing it.'
    );
    process.exit(1);
  }
}
