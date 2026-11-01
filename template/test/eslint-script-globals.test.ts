import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// A3: the env/node-scripts block gives eslint.config.js and lint/*.js Node globals. Without it a gate
// script that calls process.exit fails no-undef, so the guard could not be written.
const root = resolve(import.meta.dirname, '..');
const ERROR = 2;
const eslint = new ESLint({ cwd: root });

async function errors(source: string, file: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath: resolve(root, file) });

  return (result?.messages ?? [])
    .filter((message) => message.severity === ERROR)
    .map((message) => `${message.ruleId}: ${message.message}`);
}

describe('A3 Node globals for config and gate scripts', () => {
  it.each(['lint/probe.js', 'eslint.config.js'])(
    'process.exit(0) lints clean in %s',
    async (file) => {
      expect(await errors('process.exit(0);\n', file)).toEqual([]);
    }
  );

  it('still reports a name that is not a Node global in a lint script', async () => {
    expect(await errors('window.close();\n', 'lint/probe.js')).toEqual([
      expect.stringContaining('no-undef'),
    ]);
  });
});
