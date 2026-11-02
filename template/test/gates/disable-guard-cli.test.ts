import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// A3: the guard's command line, as `npm run lint` runs it. findDisableDirectives() is tested in
// oxlint-gate.test.ts; this proves the script exits 1, reads the template root and tells the reader what to do.
const guard = resolve(import.meta.dirname, '..', '..', 'lint', 'no-disable-directives.js');
// Built from pieces so this file does not trip the guard it tests.
const DIRECTIVE = '@ts' + '-nocheck';
const scratch: string[] = [];

// A scratch copy of the real layout: the guard sits in lint/ and scans the folder above it.
function layout(): string {
  const root = mkdtempSync(join(tmpdir(), 'a3-guard-'));

  scratch.push(root);
  mkdirSync(join(root, 'lint'));
  copyFileSync(guard, join(root, 'lint', 'no-disable-directives.js'));

  return root;
}

function plant(root: string, file: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), `// ${DIRECTIVE}\nexport const a = 1;\n`);
}

function run(root: string): { status: number | null; stderr: string } {
  const { status, stderr } = spawnSync('node', [join(root, 'lint', 'no-disable-directives.js')], {
    encoding: 'utf8',
  });

  return { status, stderr };
}

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('A3 disable-directive guard, run as a command', () => {
  it('exits 0 and prints nothing on a clean tree', () => {
    const root = layout();

    plant(root, 'src/clean.ts');
    writeFileSync(join(root, 'src', 'clean.ts'), 'export const a = 1;\n');

    expect(run(root)).toEqual({ status: 0, stderr: '' });
  });

  it('exits 1, names path:line, and says what to do instead, for a plant in test/', () => {
    const root = layout();

    plant(root, 'test/x.ts');

    const { status, stderr } = run(root);

    expect(status).toBe(1);
    expect(stderr).toContain(`test/x.ts:1: ${DIRECTIVE}`);
    expect(stderr).toContain('Fix the code the rule points at');
  });

  it.each(['a.ts', 'a.tsx', 'a.js', 'a.jsx', 'a.mjs', 'a.cjs', 'a.mts', 'a.cts'])(
    'scans %s files',
    (name) => {
      const root = layout();

      plant(root, `src/${name}`);

      expect(run(root).status).toBe(1);
    }
  );

  it.each(['a.md', 'a.json', 'a.d.txt'])('does not scan %s files', (name) => {
    const root = layout();

    plant(root, `src/${name}`);

    expect(run(root).status).toBe(0);
  });

  // npm and shells may reach the script through a symlink (macOS /tmp and /var are symlinks).
  it('still fails when it is run through a symlinked path', () => {
    const root = layout();
    const link = `${root}-link`;

    scratch.push(link);
    symlinkSync(root, link);
    plant(root, 'test/x.ts');

    expect(run(link).status).toBe(1);
  });

  // .claude/skills holds markdown recipes and snippets that quote directives as examples to avoid.
  it('skips .claude, where the recipe skill quotes directives as examples', () => {
    const root = layout();

    plant(root, '.claude/skills/recipe/example.ts');

    expect(run(root).status).toBe(0);
  });

  // AF3 (audit G19, G18b): the guard exports findDisableDirectives for tests. Importing it must not run the CLI,
  // and must not throw when there is no script path (node -e, a REPL).
  it('does nothing when imported from an inline script (no argv[1]), even over a planted directive', () => {
    const root = layout();

    plant(root, 'test/x.ts');

    const { status, stderr } = spawnSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `import(${JSON.stringify(join(root, 'lint', 'no-disable-directives.js'))})`,
      ],
      { encoding: 'utf8' }
    );

    expect({ status, stderr }).toEqual({ status: 0, stderr: '' });
  });

  it('does nothing when imported by another script, even over a planted directive', () => {
    const root = layout();
    const entry = join(root, 'importer.mjs');

    plant(root, 'test/x.ts');
    writeFileSync(entry, `import './lint/no-disable-directives.js';\n`);

    const { status, stderr } = spawnSync('node', [entry], { encoding: 'utf8' });

    expect({ status, stderr }).toEqual({ status: 0, stderr: '' });
  });
});
