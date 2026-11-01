/**
 * G04 size limits: a function is at most 60 lines, takes at most 4 parameters, a file is at
 * most 300 lines (blank lines and comments are not counted), and a class, interface or object
 * type declares at most 30 members. `describe` callbacks are exempt from the function limit:
 * they hold a whole suite, and each `it` inside is still checked. The exemption applies to
 * test files only (TEST_FILES in test-scope.js).
 */
import { builtinRules } from 'eslint/use-at-your-own-risk';

const MAX_MEMBERS = 30;
const coreMaxLinesPerFunction = builtinRules.get('max-lines-per-function');

// describe(...), describe.skip/only(...), describe.each([...])(...) and describe.each`...`(...)
// all start from `describe`.
function startsFromDescribe(callee) {
  if (callee.type === 'CallExpression') {
    return startsFromDescribe(callee.callee);
  }

  if (callee.type === 'TaggedTemplateExpression') {
    return startsFromDescribe(callee.tag);
  }

  if (callee.type === 'MemberExpression') {
    return startsFromDescribe(callee.object);
  }

  return callee.type === 'Identifier' && callee.name === 'describe';
}

// A test file is one eslint.config.js matched with TEST_FILES (lint/test-scope.js), which sets
// settings.size.testFile for it. The list lives once; ESLint, not this file, does the matching.
function isTestFile(context) {
  return context.settings.size?.testFile === true;
}

function isDescribeCallback(node) {
  const call = node.parent;

  return (
    call?.type === 'CallExpression' &&
    call.arguments.includes(node) &&
    startsFromDescribe(call.callee)
  );
}

const maxLinesPerFunction = {
  meta: coreMaxLinesPerFunction.meta,
  create(context) {
    const filtered = Object.create(context, {
      report: {
        value: (descriptor) => {
          const exempt =
            isTestFile(context) && descriptor.node && isDescribeCallback(descriptor.node);

          if (!exempt) {
            context.report(descriptor);
          }
        },
      },
    });

    return coreMaxLinesPerFunction.create(filtered);
  },
};

export const sizePlugin = { rules: { 'max-lines-per-function': maxLinesPerFunction } };

const memberLimit = (selector, what) => ({
  selector,
  message: `${what} may declare at most ${MAX_MEMBERS} members. Split it into smaller types.`,
});

export const sizeRules = {
  'size/max-lines-per-function': [
    'error',
    { max: 60, skipBlankLines: true, skipComments: true, IIFEs: true },
  ],
  'max-params': ['error', { max: 4 }],
  'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
  'no-restricted-syntax': [
    'error',
    memberLimit(`ClassBody[body.length>${MAX_MEMBERS}]`, 'A class'),
    memberLimit(`TSInterfaceBody[body.length>${MAX_MEMBERS}]`, 'An interface'),
    memberLimit(`TSTypeLiteral[members.length>${MAX_MEMBERS}]`, 'An object type'),
  ],
};
