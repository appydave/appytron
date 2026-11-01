/**
 * G11: `npm run deadcode` runs this when a check before it fails. Neither Knip nor dependency-cruiser
 * says what to do about a finding, so the one line is printed here, after the tool's own output.
 * It always exits 1: it only runs after a failure.
 *
 * What the gate accepts, so a reader does not hunt for it (all named in knip.json, pinned whole by
 * test/deadcode-gate.test.ts): src/main/updater.ts and electron-updater (the auto-update wiring an app
 * switches on later), and src/main/file-author.ts, a framework primitive no production code calls yet.
 * An entry file's exports are not reported (Knip's default), so file-author.ts's exports are exempt
 * with it. Not seen: a cycle through a test alias (@main, @lint, @root), because tsconfig.web.json does
 * not list them; a file outside src/, test/, lint/ and the project root.
 */
console.error(
  'Dead code or a cycle: delete the unused file, export or dependency, or use it from production code (a test does not count); break a cycle by moving the shared piece into a third file. Do not add suppression.'
);
process.exit(1);
