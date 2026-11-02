import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Change, DEADCODE_REMEDY, deadcode, SLOW } from './helpers/deadcode';
import { root } from './helpers/scratch';

// G11 / AF4: the production pass and the remedy line, as `npm run deadcode` runs them.

describe('G11 the production pass: code only a test uses is dead', () => {
  const TEST_ONLY = "import { onlyATestUsesThis } from '@shared/ipc';\n\nvoid onlyATestUsesThis;\n";

  it(
    'an export used by a test and nothing else',
    () => {
      const { failed, output } = deadcode({
        append: { 'src/shared/ipc.ts': '\nexport const onlyATestUsesThis = 1;\n' },
        write: { 'test/only-a-test.test.ts': TEST_ONLY },
      });

      expect(failed).toBe(true);
      expect(output).toContain('Unused exports');
      expect(output).toContain('onlyATestUsesThis');
    },
    SLOW
  );

  it(
    'a file used by a test and nothing else',
    () => {
      const { failed, output } = deadcode({
        write: {
          'src/main/only-a-test.ts': 'export const onlyATestUsesThis = 1;\n',
          'test/only-a-test.test.ts':
            "import { onlyATestUsesThis } from '@main/only-a-test';\n\nvoid onlyATestUsesThis;\n",
        },
      });

      expect(failed).toBe(true);
      expect(output).toContain('Unused files');
      expect(output).toContain('src/main/only-a-test.ts');
    },
    SLOW
  );

  it(
    'the same export passes when production code uses it, so the failure is the missing use',
    () => {
      const { failed } = deadcode({
        append: {
          'src/shared/ipc.ts': '\nexport const onlyATestUsesThis = 1;\n',
          'src/main/index.ts':
            "\nimport { onlyATestUsesThis } from '@shared/ipc';\n\nvoid onlyATestUsesThis;\n",
        },
      });

      expect(failed).toBe(false);
    },
    SLOW
  );

  it(
    'the file-author primitive, which no production code calls yet, is exempt by name, and only itself',
    () => {
      const config = JSON.parse(readFileSync(join(root, 'knip.json'), 'utf8'));
      const ignore = config.ignore.filter((file: string) => file !== 'src/main/file-author.ts');
      const bare = deadcode({ write: { 'knip.json': JSON.stringify({ ...config, ignore }) } });

      expect(bare.failed).toBe(true);
      expect(bare.output).toContain('src/main/file-author.ts');
    },
    SLOW
  );

  it(
    'a helper only file-author.ts imports is still dead, so the exemption hides nothing else',
    () => {
      const { failed, output } = deadcode({
        write: { 'src/main/author-helper.ts': 'export const helper = 1;\n' },
        append: {
          'src/main/file-author.ts':
            "\nimport { helper } from './author-helper';\n\nvoid helper;\n",
        },
      });

      expect(failed).toBe(true);
      expect(output).toContain('src/main/author-helper.ts');
    },
    SLOW
  );
});

describe('G11 a failing run ends with one line saying what to do', () => {
  const count = (text: string) => text.split(DEADCODE_REMEDY).length - 1;

  it.each([
    ['an unused file', { write: { 'src/main/orphan.ts': 'export const orphan = 1;\n' } }],
    ['an unused dependency', { dependencies: { 'left-pad': '1.3.0' } }],
    [
      'a cycle',
      {
        write: {
          'src/main/ca.ts': "import { b } from './cb';\nexport const a = () => b;\n",
          'src/main/cb.ts': "import { a } from './ca';\nexport const b = () => a;\n",
        },
        append: { 'src/main/index.ts': "\nimport { a } from './ca';\n\nvoid a;\n" },
      },
    ],
    [
      'a Knip tag',
      { append: { 'src/shared/ipc.ts': `\n/** @${'public'} */\nexport const hidden = 1;\n` } },
    ],
  ])(
    '%s',
    (_name, change: Change) => {
      const { failed, output } = deadcode(change);

      expect(failed).toBe(true);
      expect(count(output)).toBe(1);
      expect(output.trimEnd().endsWith(DEADCODE_REMEDY)).toBe(true);
    },
    SLOW
  );

  it(
    'a passing run prints none',
    () => {
      expect(count(deadcode().output)).toBe(0);
    },
    SLOW
  );
});
