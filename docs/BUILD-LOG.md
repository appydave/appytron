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
