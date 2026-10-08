import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs pack script, no type declarations
import { bundleTemplate, cleanTemplate } from '../scripts/bundle-template.mjs';

// CT-0075: the template must travel inside the package (0.1.0 shipped without it), minus deps, build output, lockfiles.
describe('bundle-template (prepack / postpack)', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(join(tmpdir(), 'appytron-bundle-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  const write = async (rel: string) => {
    await fs.mkdir(join(tmp, 'src', rel, '..'), { recursive: true });
    await fs.writeFile(join(tmp, 'src', rel), rel);
  };
  const list = async (d: string): Promise<string[]> =>
    (await fs.readdir(d, { recursive: true, withFileTypes: true }))
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name).slice(d.length + 1))
      .sort();

  it('copies the template with its dot-folders, and leaves out node_modules, build output and lockfiles', async () => {
    for (const f of [
      'package.json',
      'src/main/index.ts',
      '.claude/skills/recipe/SKILL.md',
      '.github/workflows/ci.yml',
      'package-lock.json',
      'node_modules/x/index.js',
      'out/main/index.js',
      'dist/a.js',
      '.DS_Store',
    ]) {
      await write(f);
    }
    await bundleTemplate(join(tmp, 'src'), join(tmp, 'pkg', 'template'));
    expect(await list(join(tmp, 'pkg', 'template'))).toEqual([
      '.claude/skills/recipe/SKILL.md',
      '.github/workflows/ci.yml',
      'package.json',
      'src/main/index.ts',
    ]);
  });

  it('replaces a stale copy, and the clean step removes it so it never shadows the repo template in dev', async () => {
    const to = join(tmp, 'pkg', 'template');
    await fs.mkdir(to, { recursive: true });
    await fs.writeFile(join(to, 'stale.txt'), 'old');
    await write('package.json');
    await bundleTemplate(join(tmp, 'src'), to);
    await expect(fs.access(join(to, 'stale.txt'))).rejects.toThrow();
    await cleanTemplate(to);
    await expect(fs.access(to)).rejects.toThrow();
  });
});
