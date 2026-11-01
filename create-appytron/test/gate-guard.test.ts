import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from '../src/lib/classify';
import { ADDED_ENTRY_NOTES, CREATE_IF_ABSENT, GATE_DEV_DEPS, GATE_SCRIPTS } from '../src/lib/gate-manifest';

const TEMPLATE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'template');

/** The app's own scripts and devDependencies. Anything in the template's package.json not named here must be in the gate list. */
const APP_OWN_SCRIPTS = [
  'dev', 'start', 'build', 'package', 'release:mac', 'typecheck:node', 'typecheck:web',
  'typecheck', 'test', 'test:watch', 'format',
];
const APP_OWN_DEV_DEPS = [
  '@tailwindcss/vite', '@types/node', '@types/react', '@types/react-dom', '@vitejs/plugin-react',
  'electron', 'electron-builder', 'electron-vite', 'react', 'react-dom', 'tailwindcss',
  'typescript', 'vite', 'vitest',
];

/** Template files that are the app's own or never upgraded (everything else at the root, in lint/ or in .github/ must be registered). */
const APP_OWN_FILES = ['README.md', 'package-lock.json', '.github/pull_request_template.md'];

/** Files at the template root, plus everything (recursively) under lint/ and .github/. */
async function gateSurface(root = TEMPLATE): Promise<string[]> {
  const out: string[] = [];
  const walk = async (rel: string): Promise<void> => {
    for (const e of await fs.readdir(resolve(root, rel), { withFileTypes: true })) {
      const path = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (rel !== '' || path === 'lint' || path === '.github') await walk(path);
      } else out.push(path);
    }
  };
  await walk('');
  return out;
}

async function templatePackage(): Promise<{ scripts: Record<string, string>; devDependencies: Record<string, string> }> {
  return JSON.parse(await fs.readFile(resolve(TEMPLATE, 'package.json'), 'utf8'));
}

describe('gate drift guard: a gate PR registers its files and dependencies in the upgrade tool', () => {
  it('every file under template/lint/ classifies auto', async () => {
    const files = (await fs.readdir(resolve(TEMPLATE, 'lint'))).filter((f) => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(classify(`lint/${f}`), f).toBe('auto');
  });

  it('eslint.config.js is gate-owned (auto); the files an app may already have are create-if-absent and never overwritten', async () => {
    await fs.access(resolve(TEMPLATE, 'eslint.config.js'));
    expect(classify('eslint.config.js')).toBe('auto');
    const created = CREATE_IF_ABSENT.map((c) => c.from);
    expect(created).toEqual(['gitignore', '.prettierrc', '.prettierignore', '.github/workflows/ci.yml']);
    for (const f of created) {
      await fs.access(resolve(TEMPLATE, f));
      expect(classify(f), f).toBe('owned');
    }
    expect(classify('.github/pull_request_template.md')).toBe('never');
  });

  it('every root file, lint/ file and .github/ file in the template is registered: auto, create-if-absent, or named app-own', async () => {
    const created = CREATE_IF_ABSENT.map((c) => c.from);
    const unregistered = (await gateSurface()).filter((f) => {
      const tier = classify(f);
      if (tier === 'auto') return false;
      if (tier === 'owned' && (created.includes(f) || f === 'package.json' || f === 'electron-builder.yml')) return false;
      return !APP_OWN_FILES.includes(f);
    });
    expect(unregistered).toEqual([]);
  });

  it.each([
    '.github/workflows/new-gate.yml',
    '.github/workflows/sub/b.yml',
    'lint/sub/y.cjs',
  ])('the drift guard sees a new file at %s', async (rel) => {
    // Planted in a scratch copy, never in the real template: other test files read it in parallel.
    const root = await fs.mkdtemp(join(tmpdir(), 'appytron-guard-'));
    try {
      await fs.cp(TEMPLATE, root, { recursive: true, filter: (src) => !src.includes('node_modules') });
      expect(await gateSurface(root)).not.toContain(rel);
      await fs.mkdir(dirname(resolve(root, rel)), { recursive: true });
      await fs.writeFile(resolve(root, rel), 'planted\n');
      expect(await gateSurface(root)).toContain(rel);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('.prettierignore anchors .claude to the template root, so a nested src/.claude is checked', async () => {
    const lines = (await fs.readFile(resolve(TEMPLATE, '.prettierignore'), 'utf8')).split('\n');
    expect(lines).toContain('/.claude');
    expect(lines).not.toContain('.claude');
  });

  it('every command in a create-if-absent onWrite row is a script the template has', async () => {
    const { scripts } = await templatePackage();
    const rows = CREATE_IF_ABSENT.flatMap((c) => (c.onWrite === undefined ? [] : [c.onWrite]));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const names = [...row.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1] as string);
      expect(names.length).toBeGreaterThan(0);
      for (const n of names) expect(scripts[n], n).toBeDefined();
    }
  });

  it('every template script is the app\'s own or in the gate list', async () => {
    const { scripts } = await templatePackage();
    const unregistered = Object.keys(scripts).filter(
      (s) => !APP_OWN_SCRIPTS.includes(s) && !(GATE_SCRIPTS as readonly string[]).includes(s),
    );
    expect(unregistered).toEqual([]);
  });

  it('every template devDependency is the app\'s own or in the gate list', async () => {
    const { devDependencies } = await templatePackage();
    const unregistered = Object.keys(devDependencies).filter(
      (d) => !APP_OWN_DEV_DEPS.includes(d) && !(GATE_DEV_DEPS as readonly string[]).includes(d),
    );
    expect(unregistered).toEqual([]);
  });

  it('every gate-list name exists in the template package.json', async () => {
    const { scripts, devDependencies } = await templatePackage();
    for (const s of GATE_SCRIPTS) expect(scripts[s], s).toBeDefined();
    for (const d of GATE_DEV_DEPS) expect(devDependencies[d], d).toBeDefined();
  });

  // The row an app owner reads after the upgrade writes ci.yml: each gate's sentence is part of the contract.
  it.each([
    'Complexity limits are fixed the same way: a function over cyclomatic 6 (Oxlint `complexity`), cognitive 8 or an expression with more than 3 boolean operators (SonarJS) is split by hand, never suppressed.',
    'Duplicates are fixed the same way: `npm run dup` fails on a block of more than 5 lines and 50 tokens repeated in source, or in tests (judged apart); extract the shared code into one function or helper.',
  ])('the ci.yml onWrite row says: %s', (sentence) => {
    const row = CREATE_IF_ABSENT.find((c) => c.to === '.github/workflows/ci.yml')?.onWrite;
    expect(row).toContain(sentence);
  });

  // An upgraded app keeps its own ci.yml (never overwritten), so this sentence is the only thing that makes it run the gate.
  it('the scripts.dup note tells an upgraded app to put `npm run dup` in its CI', () => {
    expect(ADDED_ENTRY_NOTES['scripts.dup']).toContain('Add `npm run dup` to your CI after `npm run lint`');
  });

  it('the dup script, jscpd and both configs are registered, so an upgrade carries them', async () => {
    expect(GATE_SCRIPTS).toContain('dup');
    expect(GATE_DEV_DEPS).toContain('jscpd');
    for (const f of ['.jscpd.json', '.jscpd.tests.json', 'lint/test-scope.js']) {
      await fs.access(resolve(TEMPLATE, f));
      expect(classify(f), f).toBe('auto');
    }
  });

  // CI files outside template/ cannot be read by the template's own tests (they ship into generated apps).
  it('the repo CI and the scaffold check run `npm run dup` right after lint', async () => {
    const repo = resolve(TEMPLATE, '..');
    const ci = await fs.readFile(resolve(repo, '.github/workflows/ci.yml'), 'utf8');
    const scaffold = await fs.readFile(resolve(repo, '.github/scripts/scaffold-check.sh'), 'utf8');
    expect(ci).toContain('      - run: npm run lint\n      - run: npm run dup\n');
    expect(scaffold).toContain('npm run lint\nnpm run dup\n');
  });
});
