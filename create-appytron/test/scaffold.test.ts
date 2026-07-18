import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../src/scaffold';

// test/ → create-appytron/ → appytron/ → template/
const TEMPLATE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'template');

describe('scaffold', () => {
  let tmp: string;
  let target: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(join(tmpdir(), 'appytron-scaffold-'));
    target = join(tmp, 'my-app');
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('copies the template and rewrites app name + core dependency', async () => {
    const res = await scaffold({ templateDir: TEMPLATE, targetDir: target, appName: 'my-app' });
    expect(res.files).toBeGreaterThan(10);

    const pkg = JSON.parse(await fs.readFile(join(target, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('my-app');
    expect(pkg.dependencies['@appydave/core']).toBe('^0.1.0');

    for (const f of [
      'electron.vite.config.ts',
      'src/main/index.ts',
      'src/preload/index.ts',
      'src/renderer/src/App.tsx',
    ]) {
      await expect(fs.access(join(target, f))).resolves.toBeUndefined();
    }
  });

  it('honours an explicit core version', async () => {
    await scaffold({
      templateDir: TEMPLATE,
      targetDir: target,
      appName: 'x',
      coreVersion: '^1.2.3',
    });
    const pkg = JSON.parse(await fs.readFile(join(target, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@appydave/core']).toBe('^1.2.3');
  });

  it('does not copy node_modules / out / dist', async () => {
    await scaffold({ templateDir: TEMPLATE, targetDir: target, appName: 'x' });
    await expect(fs.access(join(target, 'node_modules'))).rejects.toThrow();
    await expect(fs.access(join(target, 'out'))).rejects.toThrow();
  });

  it('rewrites the createConsole app name in main/index.ts', async () => {
    await scaffold({ templateDir: TEMPLATE, targetDir: target, appName: 'zapp' });
    const main = await fs.readFile(join(target, 'src/main/index.ts'), 'utf8');
    expect(main).toContain("name: 'zapp'");
    expect(main).not.toContain('appytron-app');
  });
});
