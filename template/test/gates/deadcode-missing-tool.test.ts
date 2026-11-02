import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEADCODE_REMEDY } from './helpers/deadcode';
import { manifest } from './helpers/manifest';
import { root } from './helpers/scratch';

// AF5: the remedy line is printed when a tool of the deadcode script cannot run at all, not only when it finds
// something. The script text is run with a PATH that has Node and the system tools but no node_modules/.bin, so
// knip is "not found": the `||` still reaches the remedy script, which says all three causes and exits 1.
describe('AF5 deadcode with a missing tool still ends with the one remedy line', () => {
  const run = spawnSync('sh', ['-c', manifest().scripts.deadcode ?? ''], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin` },
  });
  const output = run.stdout + run.stderr;

  it('fails', () => {
    expect(run.status).toBe(1);
  });

  it('prints the line once, last, naming dead code, a cycle and a process-boundary import', () => {
    expect(output.split(DEADCODE_REMEDY)).toHaveLength(2);
    expect(output.trimEnd().endsWith(DEADCODE_REMEDY)).toBe(true);
  });

  it('did so because a tool was missing, not because it found something', () => {
    expect(output).toMatch(/knip.*not found/i);
  });
});
