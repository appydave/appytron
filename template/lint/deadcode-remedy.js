/**
 * G11: `npm run deadcode` runs this when a check before it fails. Neither Knip nor dependency-cruiser
 * says what to do about a finding, so the one line is printed here, after the tool's own output.
 * It always exits 1: it only runs after a failure.
 *
 * What the gate accepts, so a reader does not hunt for it (all named in knip.json, pinned whole by
 * test/deadcode-gate.test.ts): src/main/updater.ts and electron-updater (the auto-update wiring an app
 * switches on later), and src/main/file-author.ts, a framework primitive no production code calls yet.
 * `ignore` hides that file's own findings (its unused exports too) and nothing it imports. Knip prints one
 * harmless 'Remove from ignore' hint for file-author.ts: only the production pass needs it.
 * G12e: dependency-cruiser also holds the process boundaries (.dependency-cruiser.cjs); each finding prints its
 * own remedy under it (err-long). Aliases resolve through tsconfig.boundaries.json, which lists all of them.
 * Not seen: a file outside src/, test/, lint/ and the project root; a specifier built at run time.
 */
console.error(
  'Dead code, a cycle or a process-boundary import: delete the unused file, export or dependency, or use it from production code (a test does not count); break a cycle by moving the shared piece into a third file; a boundary finding prints its own remedy above. Do not add suppression.'
);
process.exit(1);
