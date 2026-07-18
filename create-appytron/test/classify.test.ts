import { describe, it, expect } from 'vitest';
import { classify } from '../src/lib/classify';

describe('classify', () => {
  it('auto — framework primitives + build config', () => {
    for (const p of [
      'electron.vite.config.ts',
      'tsconfig.node.json',
      'vitest.config.ts',
      'src/main/window-manager.ts',
      'src/main/ipc-router.ts',
      'src/main/file-author.ts',
      'src/main/updater.ts',
      'src/preload/index.ts',
    ]) {
      expect(classify(p)).toBe('auto');
    }
  });

  it('owned — project identity', () => {
    for (const p of ['package.json', 'electron-builder.yml', 'appytron.json']) {
      expect(classify(p)).toBe('owned');
    }
  });

  it('recipe — skill files', () => {
    expect(classify('.claude/skills/recipe/references/wrap-cli.md')).toBe('recipe');
    expect(classify('.claude/skills/recipe/SKILL.md')).toBe('recipe');
  });

  it('never — the developer app code', () => {
    for (const p of [
      'src/renderer/src/App.tsx',
      'src/main/index.ts',
      'src/shared/ipc.ts',
      'test/file-author.test.ts',
      'README.md',
    ]) {
      expect(classify(p)).toBe('never');
    }
  });
});
