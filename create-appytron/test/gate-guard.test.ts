import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from '../src/lib/classify';
import { CREATE_IF_ABSENT, GATE_DEV_DEPS, GATE_SCRIPTS } from '../src/lib/gate-manifest';

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
});
