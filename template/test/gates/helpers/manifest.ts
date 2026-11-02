import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..', '..');

/** The template's package.json: what the gates pin. */
export function manifest(): {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
}

/** The version npm actually installed for `name`: a pin on package.json alone says nothing about node_modules. */
export function installedVersion(name: string): string {
  const installed: { version: string } = JSON.parse(
    readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')
  );

  return installed.version;
}
