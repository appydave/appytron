import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// AF3 (audit P1): the shipped CI skips the Electron binary download. Without this line every generated
// app's CI downloads ~100 MB per run and nothing fails, so the line is pinned here.
const root = resolve(import.meta.dirname, '..', '..');
const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

describe('template ci.yml skips the Electron binary download', () => {
  it('sets ELECTRON_SKIP_BINARY_DOWNLOAD to 1 as a job env', () => {
    expect(ci).toMatch(/^ {4}env:\n {6}ELECTRON_SKIP_BINARY_DOWNLOAD: '1'/m);
  });

  it('sets it before the install step, in the job that installs', () => {
    expect(ci.indexOf('ELECTRON_SKIP_BINARY_DOWNLOAD')).toBeGreaterThan(-1);
    expect(ci.indexOf('ELECTRON_SKIP_BINARY_DOWNLOAD')).toBeLessThan(ci.indexOf('npm install'));
  });
});
