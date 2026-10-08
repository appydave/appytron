import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// CT-0075 (Tester): the 0.2.0 release is one number in several places, and a tarball that must carry the template.
const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(PKG, '..');
const readJson = async (p: string) => JSON.parse(await fs.readFile(p, 'utf8'));

describe('Feature: the version reads 0.2.0 everywhere it appears', () => {
  it('Scenario: given the release, when package.json, the lockfile and the wrapper are read, then create-appytron is 0.2.0 in all of them', async () => {
    const pkg = await readJson(join(PKG, 'package.json'));
    const lock = await readJson(join(PKG, 'package-lock.json'));
    const wrapper = await readJson(join(REPO, 'appytron-upgrade', 'package.json'));
    expect(pkg.version).toBe('0.2.0');
    expect(lock.version).toBe('0.2.0');
    expect(lock.packages[''].version).toBe('0.2.0');
    expect(wrapper.dependencies['create-appytron']).toBe('^0.2.0');
  });

  it('Scenario: given the changelog, when its newest entry is read, then it is 0.2.0 and names the 4e36ea8 stack bump', async () => {
    const log = await fs.readFile(join(PKG, 'CHANGELOG.md'), 'utf8');
    const newest = log.split('\n').find((l) => l.startsWith('## '));
    expect(newest).toContain('0.2.0');
    expect(log).toContain('4e36ea8');
    for (const word of ['Electron 44', 'electron-vite 5', 'Vite 7', 'Vitest 5', 'React 19', 'Tailwind 4']) {
      expect(log).toContain(word);
    }
  });
});

describe('Feature: the tarball is built to carry the template', () => {
  it('Scenario: given package.json, when the pack hooks are read, then prepack builds dist and bundles, postpack cleans, and files lists dist, template and the changelog', async () => {
    const pkg = await readJson(join(PKG, 'package.json'));
    expect(pkg.scripts.prepack).toBe('npm run build && node scripts/bundle-template.mjs');
    expect(pkg.scripts.postpack).toBe('node scripts/bundle-template.mjs --clean');
    expect(pkg.files).toEqual(expect.arrayContaining(['dist/', 'template/', 'README.md', 'CHANGELOG.md']));
  });

  it('Scenario: given the bundled copy, when git is asked, then it is ignored (a pack can never dirty the tree)', () => {
    const out = spawnSync('git', ['check-ignore', 'create-appytron/template/package.json'], { cwd: REPO, encoding: 'utf8' });
    expect(out.status).toBe(0);
  });
});

describe('Feature: the pack script run as prepack and postpack do', () => {
  let tmp: string;
  let pkg: string;
  beforeEach(async () => {
    tmp = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'appytron-packscript-')));
    pkg = join(tmp, 'create-appytron');
    await fs.mkdir(join(pkg, 'scripts'), { recursive: true });
    await fs.copyFile(join(PKG, 'scripts', 'bundle-template.mjs'), join(pkg, 'scripts', 'bundle-template.mjs'));
    await fs.mkdir(join(tmp, 'template', 'src'), { recursive: true });
    await fs.writeFile(join(tmp, 'template', 'package.json'), '{}');
    await fs.writeFile(join(tmp, 'template', 'src', 'a.ts'), 'a');
    await fs.mkdir(join(tmp, 'template', 'node_modules'), { recursive: true });
    await fs.writeFile(join(tmp, 'template', 'node_modules', 'x.js'), 'x');
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });
  const script = () => join(pkg, 'scripts', 'bundle-template.mjs');
  const exists = (p: string) => fs.access(p).then(() => true, () => false);

  it('Scenario: given a package beside a template, when the script runs, then ../template is copied in without node_modules, and --clean removes it', async () => {
    execFileSync('node', [script()], { encoding: 'utf8' });
    expect(await exists(join(pkg, 'template', 'src', 'a.ts'))).toBe(true);
    expect(await exists(join(pkg, 'template', 'node_modules'))).toBe(false);
    execFileSync('node', [script(), '--clean'], { encoding: 'utf8' });
    expect(await exists(join(pkg, 'template'))).toBe(false);
  });

  it('Scenario: given a stale copy left by a failed pack, when the next prepack runs, then the stale file is gone', async () => {
    await fs.mkdir(join(pkg, 'template'), { recursive: true });
    await fs.writeFile(join(pkg, 'template', 'stale.txt'), 'old');
    execFileSync('node', [script()], { encoding: 'utf8' });
    expect(await exists(join(pkg, 'template', 'stale.txt'))).toBe(false);
    expect(await exists(join(pkg, 'template', 'package.json'))).toBe(true);
  });

  // npm runs `node scripts/bundle-template.mjs` with the package folder as cwd. The script's main-module guard compares
  // import.meta.url (symlink-resolved) with argv[1]; the relative lifecycle form must still bundle when the folder is
  // reached through a symlink. (An ABSOLUTE symlinked path skips the guard and does nothing; npm never calls it that way.)
  it('Scenario: given the package folder is reached through a symlink, when prepack runs as npm runs it (relative path, package cwd), then the template is still bundled', async () => {
    const link = join(tmp, 'via-link');
    await fs.symlink(pkg, link);
    execFileSync('node', ['scripts/bundle-template.mjs'], { cwd: link, encoding: 'utf8' });
    expect(await exists(join(pkg, 'template', 'package.json'))).toBe(true);
  });

  // Open finding (Tester CT-0075 r1): the script logs on STDOUT, and npm passes lifecycle stdout through, so
  // `npm pack --json` prints a log line before the JSON and `npm pack --json | jq` (or any JSON.parse) fails.
  it.fails('Scenario: given prepack, when the script runs, then stdout stays empty so `npm pack --json` is still JSON', () => {
    const out = execFileSync('node', [script()], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    expect(out).toBe('');
  });
});
