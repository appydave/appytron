/**
 * What counts as test code, defined once. A gate that treats tests differently (G05 magic numbers,
 * G06 complexity) must use exactly this list. eslint.config.js imports it. .oxlintrc.json is JSON and
 * cannot import, so it holds a copy that test/gates/test-scope.test.ts pins equal to this list.
 */
export const TEST_FILES = ['**/*.test.*', '**/test/**'];
