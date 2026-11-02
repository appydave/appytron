import { resolve } from 'node:path';
import { ESLint, type Linter } from 'eslint';

// The one place the ESLint probe tests build their linter, so the CI workaround and the severity
// filter live once. A probe runs the real eslint.config.js over text, so it proves the gate is wired.
export const root = resolve(import.meta.dirname, '..', '..', '..');
export const ERROR = 2;

// With CI set, typescript-eslint assumes a one-shot run and reads each file from disk, ignoring the
// probe text lintText is given. Turning that inference off makes the probe text count everywhere.
export const eslint = new ESLint({
  cwd: root,
  overrideConfig: {
    languageOptions: { parserOptions: { disallowAutomaticSingleRunInference: true } },
  },
});

/** Every message for `source` linted as `file` (a path relative to the template root). */
export async function lint(source: string, file: string): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(source, { filePath: resolve(root, file) });

  return result?.messages ?? [];
}

/** Only the messages that fail the build: a rule downgraded to a warning prints but does not fail. */
export async function errorMessages(source: string, file: string): Promise<Linter.LintMessage[]> {
  return (await lint(source, file)).filter((message) => message.severity === ERROR);
}

export async function errorRuleIds(source: string, file: string): Promise<string[]> {
  return (await errorMessages(source, file)).map((message) => message.ruleId ?? 'parse-error');
}
