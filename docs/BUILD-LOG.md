---
project: appytron
kind: build-log (as-built record — what actually shipped, and where it diverged from the plan)
built: 2026-07-18 → 2026-07-19
status: complete (scaffold built, published, CI-green, running); pilot in progress (ImageDrip)
canonical: CONTEXT.md (system), docs/appytron-plan.md (design + decisions)
---

# AppyTron — Build Log

AppyTron went from idea → a complete, published, CI-green native-desktop scaffold in one session.
This is the **as-built** record: what shipped, and where reality diverged from the (earlier) plan.
For how it works read `CONTEXT.md`; for the design rationale read `docs/appytron-plan.md`.

## What shipped

| Piece | Where | Verified |
|-------|-------|----------|
| `@appydave/core@0.1.0` | `appydave/foundation` (public, **published to npm**) | 33 tests · installs + ESM-imports from a clean project |
| Template (bootable Electron app) | `appytron/template` | typecheck (node+web) · `electron-vite build` · **runs live** (window + typed IPC + persistent Store counter) |
| Tier-2 primitives (template source) | `template/src/main` | WindowManager · IpcRouter · Bridge · ProcessSupervisor · FileAuthor · Updater · createConsole; 8 tests |
| `create-appytron` (scaffold CLI) | `appytron/create-appytron` | 18 tests + e2e (scaffolds a real app; `--link-core` + `--into` acceptance-verified) |
| `appytron-upgrade` (tier system) | `appytron/appytron-upgrade` + `create-appytron` | auto/recipe/never/owned; e2e-proven (framework fix pulled into a scaffolded app) |
| Recipes | `template/.claude/skills/recipe/references` | nav-shell · ipc-crud · wrap-cli · landing-page (AppyTron's own) + webview-harness · image-harvest · rate-limit-guard (donated by ImageDrip) |
| CI | both repos | green (foundation: bun test+typecheck · appytron: create-appytron + template) |
| Docs | both repos | CONTEXT.md ×2 · README ×2 · plan · specs · pilots · signing-notarization.md |

**One-liner:** `npx create-appytron my-app` → a signed-buildable native desktop app with a typed IPC
bridge, process/file operators, an update channel, and recipes — all on `@appydave/core`.

## As-built vs the plan (deltas a future session must know)

The plan (`docs/appytron-plan.md`) was written before the build; these are where the code differs:

- **Renderer stack is React 18 / Vite 6 / Tailwind 3** (matched eve-studio's proven versions for a
  reliable first boot), **not** the plan's aspirational React 19 / Vite 7 / Tailwind 4. Bumping is a
  future call, not a bug.
- **`@appydave/appytron-config` was not built** — no shared lint/TS config package yet; the template
  carries its own configs. (The plan lists it; it's deferred.)
- **`app-idea` and `mochaccino` skills are not bundled** — only the `recipe` skill ships in the
  template. (Plan §4a lists them.)
- **No two-layer agentic install** — `create-appytron` is Layer 1 (mechanical copy + rewrite) only;
  the Layer-2 `configure-appytron` agentic interview (from AppySentinel's pattern) was not built.
- **`sandbox: true` → `sandbox: false`** — an ESM preload can't run sandboxed; security is carried by
  contextIsolation + minimal typed bridge + Zod + CSP. Plan §9 corrected. `sandbox: true` needs a
  CommonJS preload (future hardening).
- **`@appydave/core` extracted by COPY** from `appysentinel-core` (not moved) — AppySentinel is
  untouched and still holds duplicate primitives; de-dup onto `@appydave/core` is deferred (touches a
  live system, needs a go).

## Gotchas (learned by running it)

- **Preload path is `.mjs`, not `.js`** — electron-vite emits `out/preload/index.mjs`; loading
  `index.js` silently fails → `window.appytron` undefined → UI stuck "loading…", buttons dead. This
  was a real runtime bug caught only by launching the app.
- **`@appydave/core` is ESM-only** — `require()` fails; use `import`. (Bit the publish-verification.)
- **`@appydave/core@0.1.0` is published** — scaffolds resolve `^0.1.0` from npm by default;
  `--link-core` writes a `file:` link recomputed relative to the target for monorepo dev.
- **`FileAuthor.write` accepts `string | Uint8Array`** — widened so the image-harvest recipe can
  write binary; surfaced by the ImageDrip webview spec.
- **npm publish needs an OTP** — bump the version before each re-publish.

## Decisions (as resolved — see plan §14)

Generic desktop scaffold with an operator-console flagship · macOS-first · GitHub-Releases update
feed · shared foundation named **`@appydave/core`** (neutral, no product prefix), build now,
extract-by-copy · fleet-cockpit deferred · first pilot **ImageDrip** · **`@appydave/core` published**
(the plan's §14.6 "later" item — done).

## The pilot — ImageDrip

First consumer, in its own repo `~/dev/ad/apps/imagedrip/`. Drives ChatGPT's image UI (no paid API)
via a `webview-harness` (WebContentsView + synthesized input + DOM-read). It **donates recipes back**
to AppyTron (webview-harness, image-harvest, rate-limit-guard already contributed) — the
"recipes are byproducts of pilots" discipline in action. ImageDrip is scaffoldable today:
`create-appytron --into ~/dev/ad/apps/imagedrip --link-core`.

## Still open (all need David or are out of scope here)

- AppySentinel (and AppyStack) de-dup onto `@appydave/core` — needs a go (live systems)
- Apple Developer ID signing/notarization — see `docs/signing-notarization.md` (David's creds)
- ImageDrip build-out — its own project

## 2026-08-29 — ⚠️ `create-appytron@0.1.0` on npm cannot scaffold: the template is not in the tarball

Found while watching the FliCut build, which hit it on its very first command and worked around it
by using the repo-local path.

**Verified, not inferred:**

| Probe | Result |
|---|---|
| `package.json` `files` | `['dist/', 'template/', 'README.md']` — *declares* the template |
| `npm pack --dry-run --json` | **0 files under `template/`** |
| `create-appytron/template/` on disk | **does not exist** (no dir, no symlink) |
| `prepack` / `prepublishOnly` script | **none** |
| `npm view create-appytron dist.unpackedSize` | **33,645 bytes** — `dist/` + README only |

**Root cause**: the template lives at `appytron/template`, one level **above** the package root.
npm's `files` globs are relative to the package root, so `'template/'` matches nothing.

**Effect**: `npx create-appytron my-app` — the headline command in `README.md` — fails with
`template not found` for anyone outside this monorepo. `resolveTemplateDir()`'s first candidate
(`../template`, commented *"bundled (published package)"*) is never present in the published
package; only the repo-local dev fallback resolves.

⚠️ **`CONTEXT.md` §Status is currently false**: *"`npx create-appytron` produces an app that installs
and runs out of the box."* It does not.

**Likely fix**: a `prepack` script that copies `../template` into the package root before packing
(and `.gitignore`s the copy), then republish. **Not attempted** — found by a read-only watcher.

**Workaround that works today**, and what FliCut used:
```bash
node /Users/davidcruwys/dev/ad/apps/appytron/create-appytron/dist/index.js <app> --here
```

## 2026-09-13 — template stack bump (Electron 44 · electron-vite 5 · Vite 7 · Vitest 5 · React 19 · Tailwind 4)

Done for FliCast Phase 0 (`~/dev/ad/flivideo/flicast`, deliver B568), which is scaffolded from this
template. Evidence per dependency is in FliCast's `docs/phase-0/package-audit.md`; the short form:

| package | was | now | why |
|---|---|---|---|
| electron | ^34.2.0 | ^44.3.0 | `npm view electron version` = 44.3.0 (latest stable) |
| electron-vite | ^3.0.0 | ^5.0.0 | latest stable (6.0.0 is beta only) |
| vite | ^6.1.0 | ^7.3.6 | **electron-vite 5 peer-deps `vite ^5 \|\| ^6 \|\| ^7`** — Vite 8 is blocked until electron-vite accepts it |
| @vitejs/plugin-react | ^4.3.4 | ^5.2.0 | 6.x peer-deps `vite ^8`; 5.2.0 supports Vite 7 |
| vitest | ^2.1.0 | ^5.0.0 | latest; peer-deps `vite ^6.4 \|\| ^7 \|\| ^8`; needs Node ≥ 22.12 (CI template job → Node 24) |
| react / react-dom / @types | ^18.3 | ^19.3 | latest; `JSX.Element` global is gone → `React.JSX.Element` in `App.tsx` |
| tailwindcss | ^3.4.17 | ^4.3.3 | latest; runs as `@tailwindcss/vite` plugin — `tailwind.config.js`, `postcss.config.js`, `postcss`, `autoprefixer` removed; `index.css` is `@import "tailwindcss"` |
| electron-builder | ^25.1.8 | ^26.15.3 | latest |
| typescript | ^5.7.3 | ^5.9.3 | **pinned to 5.x on purpose**: `latest` is 7.0.2, the Go-native port; not validated against electron-vite / vitest / `--composite false` yet — a separate spike |
| @types/node | (transitive) | ^24.0.0 | now explicit; matches the Node 24 runtime and vitest 5's peer range |

Verified on the M4 (Node 24.13.0, npm 11.6.2): `npm run typecheck` · `npm test` (8/8) · `npm run build`
all green. `create-appytron` typecheck + 18 tests green. Not done: a live window launch (agent session
over tmux; no display check), `npm publish`.

**Gotcha found on the way** — the template's `file:` link to `@appydave/core` only works when the
**foundation itself is installed**: Node resolves `zod`/`pino` from the real path of the symlinked
package, so with an empty `appydave-foundation/node_modules` every core import fails with
`Cannot find package 'zod'`. Fix: `cd ~/dev/ad/apps/appydave-foundation && bun install --frozen-lockfile`
(what CI already does). FliCut never hit this because pnpm copies `file:` deps into its own store.
