/**
 * G11: `npm run deadcode` runs this when a check before it fails. Neither Knip nor dependency-cruiser
 * says what to do about a finding, so the one line is printed here, after the tool's own output.
 * It always exits 1: it only runs after a failure.
 *
 * What the gate accepts, so a reader does not hunt for it (all named in knip.json, pinned whole by
 * test/deadcode-gate.test.ts): src/main/updater.ts and electron-updater (the auto-update wiring an app
 * switches on later), and src/main/file-author.ts, a framework primitive no production code calls yet.
 * `ignore` hides that file's own findings (its unused exports too) and nothing it imports. The plain Knip pass would
 * print a 'Remove from ignore' hint for file-author.ts (only the production pass needs it; following it fails that
 * pass), so that pass runs with --no-config-hints. The production pass still prints its own hints.
 * G12e: dependency-cruiser also holds the process boundaries (.dependency-cruiser.cjs); each finding prints its
 * own remedy under it (err-long). Aliases resolve through tsconfig.boundaries.json, which lists all of them.
 * Not seen: a file outside src/, test/, lint/ and the project root; a specifier built at run time.
 *
 * Accepted limits (measured, decided, not to be re-found; one list, here):
 *  - A new top-level folder (such as scripts/) is invisible to Knip: its `project` list is narrow on purpose and is
 *    not widened, so an orphan file there is not reported. Add the folder to knip.json `project` when you add it.
 *  - `typecheck:tests` reaches an upgraded app as a script plus a note; the app wires it into its own CI.
 *  - False alarms in src/renderer: `import 'events'` and `import 'buffer'` (the npm packages of those names) are
 *    reported as Node core modules; `import 'virtual:x'` (a Vite virtual module) is reported as unresolved.
 *  - Misses, each caught elsewhere: the renderer may import `@lint/*` and `@root/*` and depcruise lets it (the build
 *    rejects it); ESLint does not refuse `@main` in the renderer (depcruise does).
 *  - src/main may not import src/preload, even for a type: put the shared type in src/shared.
 *  - `upgrade-proof.sh --break` stops at the first lint/ line it removes; CI is the pin for the rest.
 *  - Extensions: the glob names .ts .tsx .mts .cts .js .jsx .mjs .cjs, but .mts and .cts get only the generic ESLint
 *    block (no TypeScript parser), so TypeScript syntax in them is `Parsing error: Unexpected token :` and the strict
 *    rules never run: write .ts for TypeScript (the template has no .mts/.cts). Knip's
 *    root `project` glob is `*.{js,ts,cjs}` and is not widened (an .mjs, .mts or .cts file at the root is invisible to
 *    it); the jscpd formats are typescript, tsx, javascript and jsx (.mts/.cts not measured).
 *  - The three types (ConsoleContext, ProcessStatus, LogChunk) stay private; derive them with `Parameters<>`
 *    (see lint/exports.js).
 */
console.error(
  'Dead code, a cycle or a process-boundary import: delete the unused file, export or dependency, or use it from production code (a test does not count); break a cycle by moving the shared piece into a third file; a boundary finding prints its own remedy above. Do not add suppression.'
);
process.exit(1);
