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
  'typecheck', 'test', 'test:gates', 'test:all', 'test:watch', 'format',
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
    'Dead code and cycles are fixed the same way: `npm run deadcode` (Knip, dependency-cruiser) fails on an unused file, export or dependency and on an import cycle; delete the dead code, or break the cycle by moving the shared piece into a third file.',
    'It also fails on a process-boundary import (renderer reaching main, preload or Node; preload reaching anything but src/shared and electron; main reaching the renderer or preload; src/shared reaching anything outside itself): move the shared piece into src/shared.',
    'Parent-relative imports are fixed by alias: a `../` specifier fails lint; write `@shared/x` (src/shared), `@main/x` (in src/main), `@preload/x` (in src/preload), `@lint/x` or `@root/x` in tests, `@/x` in the renderer. This upgrade replaced electron.vite.config.ts and vitest.config.ts, so re-add any alias of your own there.',
  ])('the ci.yml onWrite row says: %s', (sentence) => {
    const row = CREATE_IF_ABSENT.find((c) => c.to === '.github/workflows/ci.yml')?.onWrite;
    expect(row).toContain(sentence);
  });

  // An upgraded app keeps its own ci.yml (never overwritten), so this sentence is the only thing that makes it run the gate.
  it('the scripts.dup note tells an upgraded app to put `npm run dup` in its CI', () => {
    expect(ADDED_ENTRY_NOTES['scripts.dup']).toContain(
      'If you use the ci.yml this upgrade wrote, it already runs `npm run dup` after `npm run lint`; if your CI is a file of your own, add `npm run dup` after `npm run lint`.'
    );
  });

  it('the scripts.deadcode note tells an upgraded app to put `npm run deadcode` in its CI and names the exemption', () => {
    const note = ADDED_ENTRY_NOTES['scripts.deadcode'];

    expect(note).toContain(
      'If you use the ci.yml this upgrade wrote, it already runs `npm run deadcode` after `npm run dup`; if your CI is a file of your own, add `npm run deadcode` after `npm run dup`.'
    );
    expect(note).toContain('src/main/updater.ts with electron-updater, and src/main/file-author.ts');
  });

  it('the scripts.deadcode note names the process boundaries and what an app with an alias of its own must do', () => {
    const note = ADDED_ENTRY_NOTES['scripts.deadcode'];

    expect(note).toContain('the renderer imports nothing from src/main or src/preload and no Node or electron');
    expect(note).toContain('the preload imports only src/shared and electron');
    expect(note).toContain('src/shared imports nothing outside src/shared except the packages zod and @appydave/core (no Node, electron or other package)');
    expect(note).toContain('add it to tsconfig.boundaries.json too');
  });

  it('the alias list the boundary scan reads is gate-owned, so an upgrade carries it and the aliases in the builds', async () => {
    await fs.access(resolve(TEMPLATE, 'tsconfig.boundaries.json'));
    for (const f of ['tsconfig.boundaries.json', 'tsconfig.node.json', 'electron.vite.config.ts', 'lint/root-imports.js']) {
      expect(classify(f), f).toBe('auto');
    }
  });

  it('the no-re-export rule is gate-owned, and the note tells an app with barrel files what to fix', async () => {
    await fs.access(resolve(TEMPLATE, 'lint/exports.js'));
    expect(classify('lint/exports.js')).toBe('auto');
    const onWrite = CREATE_IF_ABSENT.map((c) => c.onWrite ?? '').join('\n');
    expect(onWrite).toContain('a barrel (`export * from`, `export { x } from`, or an import exported again) fails lint');
  });

  it('the test type-check is registered: its script and tsconfig travel with an upgrade, and the note says how to wire it', async () => {
    expect(GATE_SCRIPTS).toContain('typecheck:tests');
    await fs.access(resolve(TEMPLATE, 'tsconfig.tests.json'));
    expect(classify('tsconfig.tests.json')).toBe('auto');
    expect(ADDED_ENTRY_NOTES['scripts.typecheck:tests']).toContain('add `npm run typecheck:tests` to it');
  });

  it('every file under template/lint/ is gate-owned, the deadcode remedy script included', async () => {
    await fs.access(resolve(TEMPLATE, 'lint/deadcode-remedy.js'));
    expect(classify('lint/deadcode-remedy.js')).toBe('auto');
  });

  it('the deadcode script, Knip, dependency-cruiser and both configs are registered, so an upgrade carries them', async () => {
    expect(GATE_SCRIPTS).toContain('deadcode');
    expect(GATE_DEV_DEPS).toEqual(expect.arrayContaining(['knip', 'dependency-cruiser']));
    for (const f of ['knip.json', '.dependency-cruiser.cjs', 'tsconfig.boundaries.json']) {
      await fs.access(resolve(TEMPLATE, f));
      expect(classify(f), f).toBe('auto');
    }
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
    expect(ci).toContain('      - run: npm run lint\n      - run: npm run dup\n      - run: npm run deadcode\n');
    expect(scaffold).toContain('npm run lint\nnpm run dup\nnpm run deadcode\n');
  });
});
