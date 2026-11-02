import { describe, expect, it } from 'vitest';
import { errorMessages } from './helpers/eslint-probe';

// A3: the env/node-scripts block gives eslint.config.js and lint/*.js Node globals. Without it a gate
// script that calls process.exit fails no-undef, so the guard could not be written.

async function errors(source: string, file: string): Promise<string[]> {
  return (await errorMessages(source, file)).map(
    (message) => `${message.ruleId}: ${message.message}`
  );
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
