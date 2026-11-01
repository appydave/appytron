import { describe, expect, it } from 'vitest';
import { type Change, inCopy, SLOW } from './helpers/deadcode';

// G12e item B: the remedy lint prints for a file in a subfolder of src/main or src/preload must work when followed
// literally. Planted in a scratch copy: first the '../' form (lint refuses it, naming the alias), then the advised
// alias form, which must lint, typecheck, build and end up in the bundle.
const LONG = 5 * SLOW;
const files = (parent: string, alias: string, mark: string): Record<string, string> => ({
  [`src/${parent}/names.ts`]: `export const name = '${mark}';\n`,
  [`src/${parent}/sub/helper.ts`]: `import { name } from '${alias}/names';\n\nexport const helper = name;\n`,
});
const entry = (parent: string): Change['append'] => ({
  [`src/${parent}/index.ts`]:
    "\nimport { helper } from './sub/helper';\n\nprocess.stdout.write(helper);\n",
});

describe('G12e item B @main and @preload, followed as the lint message says', () => {
  const MAIN = files('main', '@main', 'ADVICE_MAIN_MARK');
  const PRELOAD = files('preload', '@preload', 'ADVICE_PRELOAD_MARK');
  const advised = {
    write: { ...MAIN, ...PRELOAD },
    append: { ...entry('main'), ...entry('preload') },
  };

  it(
    'lints, typechecks, builds, and the helpers are in the main and preload bundles',
    () => {
      const { failed, output } = inCopy(advised, [
        'sh',
        '-c',
        'npx eslint src/main src/preload --max-warnings 0 && npm run typecheck:node && npx electron-vite build && grep -q ADVICE_MAIN_MARK out/main/index.js && grep -q ADVICE_PRELOAD_MARK out/preload/index.mjs',
      ]);

      expect(output).not.toContain('error');
      expect(failed).toBe(false);
    },
    LONG
  );

  it.each([
    ['main', '../names', '@main/* is src/main'],
    ['preload', '../names', '@preload/* is src/preload'],
  ])(
    'the ../ form in a %s subfolder is refused, and the message offers the alias that works there',
    (parent, specifier, advice) => {
      const { failed, output } = inCopy(
        {
          write: {
            [`src/${parent}/names.ts`]: "export const name = 'x';\n",
            [`src/${parent}/sub/helper.ts`]: `import { name } from '${specifier}';\n\nexport const helper = name;\n`,
          },
        },
        ['npx', 'eslint', `src/${parent}/sub/helper.ts`]
      );

      expect(failed).toBe(true);
      expect(output).toContain(advice);
    },
    SLOW
  );

  it(
    'a renderer file importing @main does not build: the renderer build has no such alias',
    () => {
      const { failed } = inCopy(
        { append: { 'src/renderer/src/main.tsx': "\nimport '@main/ipc-router';\n" } },
        ['npx', 'electron-vite', 'build']
      );

      expect(failed).toBe(true);
    },
    LONG
  );
});
