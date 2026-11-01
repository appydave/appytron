import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeGatePackage, type Pkg } from '../src/lib/merge-package';
import { GATE_DEV_DEPS, GATE_SCRIPTS } from '../src/lib/gate-manifest';
import { runUpgrade } from '../src/upgrade';

const TEMPLATE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'template');

const template: Pkg = {
  scripts: Object.fromEntries(GATE_SCRIPTS.map((s) => [s, `run ${s}`])),
  devDependencies: Object.fromEntries(GATE_DEV_DEPS.map((d) => [d, '^2.0.0'])),
};

describe('mergeGatePackage', () => {
  it('adds every missing gate entry, keeps the app\'s other keys and script order', () => {
    const app: Pkg = { name: 'x', scripts: { zeta: 'z', alpha: 'a' }, devDependencies: { vite: '^7.0.0' } };
    const { pkg, added, todo } = mergeGatePackage(template, app);
    expect(added).toHaveLength(GATE_SCRIPTS.length + GATE_DEV_DEPS.length);
    expect(todo).toEqual([]);
    expect(Object.keys(pkg.scripts ?? {})).toEqual(['zeta', 'alpha', ...GATE_SCRIPTS]);
    expect(Object.keys(pkg.devDependencies ?? {})).toEqual(['vite', ...GATE_DEV_DEPS].sort((a, b) => a.localeCompare(b)));
    expect(pkg['name']).toBe('x');
  });

  it('never replaces a customised value: leaves it and returns a to-do row', () => {
    const app: Pkg = { scripts: { lint: 'my lint' }, devDependencies: { eslint: '^8.0.0' } };
    const { pkg, todo } = mergeGatePackage(template, app);
    expect(pkg.scripts?.['lint']).toBe('my lint');
    expect(pkg.devDependencies?.['eslint']).toBe('^8.0.0');
    expect(todo).toEqual([
      expect.stringContaining('scripts.lint: yours "my lint", framework "run lint"'),
      expect.stringContaining('devDependencies.eslint: yours "^8.0.0", framework "^2.0.0"'),
    ]);
  });

  it('an app that already matches changes nothing', () => {
    const app: Pkg = JSON.parse(JSON.stringify(template));
    const { added, todo } = mergeGatePackage(template, app);
    expect(added).toEqual([]);
    expect(todo).toEqual([]);
  });

  it('throws when the gate list names something the template lacks', () => {
    expect(() => mergeGatePackage({ scripts: {}, devDependencies: {} }, {})).toThrow(/gate-manifest lists/);
  });
});

describe('runUpgrade: package.json merge, UPGRADE_TODO.md, .gitignore create-if-absent', () => {
  let app: string;
  beforeEach(async () => {
    app = await fs.mkdtemp(join(tmpdir(), 'appytron-upg-'));
    await fs.writeFile(join(app, 'appytron.json'), '{}\n');
    await fs.writeFile(
      join(app, 'package.json'),
      JSON.stringify({ name: 'old', scripts: { lint: 'custom' }, devDependencies: { eslint: '^8.0.0' } }, null, 2),
    );
  });
  afterEach(async () => {
    await fs.rm(app, { recursive: true, force: true });
  });

  it('writes .gitignore from the template when the app has none', async () => {
    const res = await runUpgrade(TEMPLATE, app);
    expect(res.applied).toContain('.gitignore');
    expect(await fs.readFile(join(app, '.gitignore'), 'utf8')).toBe(await fs.readFile(join(TEMPLATE, 'gitignore'), 'utf8'));
    await expect(fs.access(join(app, 'gitignore'))).rejects.toThrow();
  });

  it('never touches an existing .gitignore, even an empty one', async () => {
    await fs.writeFile(join(app, '.gitignore'), '');
    const res = await runUpgrade(TEMPLATE, app);
    expect(res.applied).not.toContain('.gitignore');
    expect(await fs.readFile(join(app, '.gitignore'), 'utf8')).toBe('');
  });

  it('merges gate entries, keeps customised ones, logs them once in UPGRADE_TODO.md', async () => {
    const first = await runUpgrade(TEMPLATE, app);
    const pkg = JSON.parse(await fs.readFile(join(app, 'package.json'), 'utf8'));
    expect(pkg.scripts.lint).toBe('custom');
    expect(pkg.scripts['format:check']).toBe('prettier --check .');
    expect(pkg.devDependencies.eslint).toBe('^8.0.0');
    expect(pkg.devDependencies.prettier).toBeDefined();
    expect(first.todo).toHaveLength(2);
    const todoFile = await fs.readFile(join(app, 'UPGRADE_TODO.md'), 'utf8');
    for (const row of first.todo) expect(todoFile).toContain(row);

    const second = await runUpgrade(TEMPLATE, app);
    expect(second.todo).toEqual([]);
    expect(await fs.readFile(join(app, 'UPGRADE_TODO.md'), 'utf8')).toBe(todoFile);
  });

  it('writes no UPGRADE_TODO.md when nothing was customised', async () => {
    await fs.writeFile(join(app, 'package.json'), JSON.stringify({ name: 'old' }));
    await runUpgrade(TEMPLATE, app);
    await expect(fs.access(join(app, 'UPGRADE_TODO.md'))).rejects.toThrow();
  });

  it.each(['.prettierrc', '.prettierignore', '.github/workflows/ci.yml'])('%s: absent -> written from the template', async (f) => {
    const res = await runUpgrade(TEMPLATE, app);
    expect(res.applied).toContain(f);
    expect(await fs.readFile(join(app, f), 'utf8')).toBe(await fs.readFile(join(TEMPLATE, f), 'utf8'));
  });

  it.each(['.prettierrc', '.prettierignore', '.github/workflows/ci.yml'])('%s: present and different -> left as is, one to-do row', async (f) => {
    await fs.mkdir(dirname(join(app, f)), { recursive: true });
    await fs.writeFile(join(app, f), '# the app own\n');
    const res = await runUpgrade(TEMPLATE, app);
    expect(res.applied).not.toContain(f);
    expect(await fs.readFile(join(app, f), 'utf8')).toBe('# the app own\n');
    expect(res.todo.filter((r) => r.startsWith(`- ${f}: yours differs`))).toHaveLength(1);
    expect((await runUpgrade(TEMPLATE, app)).todo.filter((r) => r.startsWith(`- ${f}:`))).toEqual([]);
  });

  it.each(['.prettierrc', '.prettierignore', '.github/workflows/ci.yml'])('%s: present and identical -> nothing', async (f) => {
    await fs.mkdir(dirname(join(app, f)), { recursive: true });
    await fs.copyFile(join(TEMPLATE, f), join(app, f));
    const res = await runUpgrade(TEMPLATE, app);
    expect(res.applied).not.toContain(f);
    expect(res.todo.filter((r) => r.startsWith(`- ${f}:`))).toEqual([]);
  });

  it('eslint.config.js stays auto: a customised copy is overwritten', async () => {
    await fs.writeFile(join(app, 'eslint.config.js'), '// mine\n');
    const res = await runUpgrade(TEMPLATE, app);
    expect(res.applied).toContain('eslint.config.js');
  });
});
