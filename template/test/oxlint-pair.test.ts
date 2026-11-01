import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// AF3: eslint-plugin-oxlint declares the one oxlint minor it works with as a peer (~1.90.0). A caret on oxlint
// lets npm pick a newer minor than the plugin accepts, and a fresh `npm install` of a new app dies with ERESOLVE
// (AppyStack 0.5.0 did exactly this). The two ranges must stay equal; bump both together.
const root = resolve(import.meta.dirname, '..');
const read = (
  path: string
): {
  devDependencies?: Record<string, string>;
  version?: string;
  peerDependencies?: Record<string, string>;
} => JSON.parse(readFileSync(join(root, path), 'utf8'));
const dev = read('package.json').devDependencies ?? {};
const plugin = read('node_modules/eslint-plugin-oxlint/package.json');

describe('oxlint and eslint-plugin-oxlint ranges agree', () => {
  it('pins oxlint to the minor with ~, not ^', () => {
    expect(dev['oxlint']).toMatch(/^~\d+\.\d+\.\d+$/);
  });

  it('gives the plugin the same range as oxlint', () => {
    expect(dev['eslint-plugin-oxlint']).toBe(dev['oxlint']);
  });

  it('matches the oxlint range the installed plugin asks for as a peer', () => {
    expect(plugin.peerDependencies?.['oxlint']).toBe(dev['oxlint']);
  });
});
