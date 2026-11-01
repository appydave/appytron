import { expect } from 'vitest';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { root } from './scratch';

// G12e: the reviewed dependency-cruiser config, pinned whole, and a copy of the real one a mutant can edit.
export interface Rule {
  name: string;
  severity: string;
  comment?: unknown;
  from: { path?: string };
  to: { path?: string; pathNot?: string | string[]; dependencyTypes?: string[] };
}
export interface Config {
  forbidden: Rule[];
  options: { doNotFollow: { path: string }; tsPreCompilationDeps: boolean };
}

export const config = (): Config =>
  structuredClone(createRequire(import.meta.url)(join(root, '.dependency-cruiser.cjs')));
export const ELECTRON = 'node_modules/electron/';

const remedy = expect.stringContaining('src/shared');

export const PINNED = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'no-unresolved-import',
      severity: 'error',
      comment: expect.stringContaining('tsconfig.boundaries.json'),
      from: { path: '^src/' },
      to: { couldNotResolve: true },
    },
    {
      name: 'renderer-imports-main-or-preload',
      severity: 'error',
      comment: remedy,
      from: { path: '^src/renderer/' },
      to: { path: '^src/(main|preload)/' },
    },
    {
      name: 'renderer-imports-node-or-electron',
      severity: 'error',
      comment: remedy,
      from: { path: '^src/renderer/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'renderer-imports-electron',
      severity: 'error',
      comment: remedy,
      from: { path: '^src/renderer/' },
      to: { path: ELECTRON },
    },
    {
      name: 'preload-imports-outside-shared',
      severity: 'error',
      comment: remedy,
      from: { path: '^src/preload/' },
      to: { pathNot: ['^src/(preload|shared)/', ELECTRON] },
    },
    {
      name: 'main-imports-renderer-or-preload',
      severity: 'error',
      comment: remedy,
      from: { path: '^src/main/' },
      to: { path: '^src/(renderer|preload)/' },
    },
    {
      name: 'shared-imports-outside-shared',
      severity: 'error',
      comment: remedy,
      from: { path: '^src/shared/' },
      to: { pathNot: '^src/shared/' },
    },
  ],
  options: { doNotFollow: { path: 'node_modules' }, tsPreCompilationDeps: true },
};
