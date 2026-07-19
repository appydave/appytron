---
project: appytron
kind: system-context (deep comprehension doc — read once, understand the system)
audience: any AI agent or developer building an app ON AppyTron
status: living
last_verified: 2026-07-18
canonical_paths:
  foundation: ~/dev/ad/apps/appydave-foundation      # @appydave/core (shared lib)
  appytron: ~/dev/ad/apps/appytron                    # the desktop scaffold
plan: ~/dev/ad/apps/appytron/docs/appytron-plan.md    # full design + decisions
---

# AppyTron — System Context

**Read this first if you are building a desktop app on AppyTron** (for example, a future "Drip"
app). It tells you what AppyTron is, what an app gets for free, how to build one, and the
non-obvious gotchas — so you don't have to read the source to be productive.

---

## 1. What AppyTron is

AppyTron is the **third AppyDave scaffold**, a peer of AppyStack (web) and AppySentinel (headless).
It builds **native, local-first desktop apps** (Electron). It is *not* an app itself — the
`template/` directory is the product; `create-appytron` copies it to make a new app.

**Three-tier model:**
```
Tier 1  @appydave/core          shared foundation (no product prefix) — reused by ALL boilerplates
           ▲                     Lifecycle · ConfigLoader · Logger · atomicWrite · SerialQueue · Store
Tier 2  AppyTron (self-contained boilerplate)
           │                     its own Electron primitives, carried as TEMPLATE SOURCE:
           │                     WindowManager · IpcRouter · Bridge · ProcessSupervisor ·
           │                     FileAuthor · Updater · createConsole()
Tier 3  the apps you scaffold    e.g. an operator console, a CLI-wrapper, "Drip"
```

**AppyTron's unique job** (what a browser tab or a headless daemon structurally cannot do): a
**mutating operator console** — a GUI that drives *local* processes, files, CLIs, and native OS
surfaces on the same machine.

---

## 2. The stack an app gets

- **Electron** via `electron-vite` (main / preload / renderer split) + `electron-builder` (packaging)
- **React 18 + Vite + TailwindCSS 3 + Zustand** in the renderer
- **`@appydave/core`** for logging / config / lifecycle / local-first storage
- **AppyTron Tier-2 primitives** (in `src/main/`) for windows, IPC, process/file operation, updates
- **Recipe skills** bundled at `.claude/skills/recipe/` (see §5)
- **macOS-first** packaging with a GitHub-Releases auto-update feed

---

## 3. Core abstractions (with real signatures)

### Tier 1 — `@appydave/core` (import from `'@appydave/core'`)
| Primitive | Signature (essentials) |
|-----------|------------------------|
| `createLifecycle()` | `{ start(); stop(reason?); onStart(hook); onStop(hook); onReload(hook); health() }` — hooks run in registration order on start, reverse on stop |
| `createConfigLoader(...)` | defaults → file → env, Zod-validated, reloadable |
| `createLogger({ name, level? })` | Pino logger; returns `Logger` |
| `atomicWrite(path, content, opts?)` | torn-write-proof file write (temp + rename) |
| `SerialQueue` | `.enqueue(task)` · `.drain()` · `.size` — ordered, one-at-a-time |
| `createStore<T>({ path, defaults })` | `{ read(); write(v); update(fn) }` — local-first JSON, atomic + serialised |
| `z` | re-exported Zod, so consumers don't depend on zod directly |

### Tier 2 — AppyTron primitives (in the app's `src/main/`)
| Primitive | What it does |
|-----------|--------------|
| `WindowManager` | `create(opts)` native windows with secure defaults; tracks + restores |
| `IpcRouter` | `register({ channel, input?: ZodType, handle })` — the validated door; `dispose()` |
| `Bridge` (preload) | exposes a minimal typed API on `window.appytron` via `contextBridge` |
| `ProcessSupervisor` | `spawn({command,args,cwd,env})` → `ManagedProcess` (`onLog`, `onExit`, `stop`); `all()`, `stopAll()` |
| `FileAuthor` | `new FileAuthor({ root, git? })`; `write(rel, content, msg?)` / `delete(...)` — **refuses paths escaping root**, git-commits each change |
| `Updater` | electron-updater wrapper over the GH-Releases feed; state machine + `onChange`, `check/download/install` |
| `createConsole(opts)` | **the facade** — wires core + Tier-2 into one object every `main/index.ts` drives |

---

## 4. How to build an app on AppyTron

**The main-process entry (`src/main/index.ts`) always looks like this:**
```ts
import { app } from 'electron';
import { z } from '@appydave/core';
import { IPC, type AppInfo } from '@shared/ipc';
import { createConsole } from './create-console.js';

const desktop = createConsole({
  name: 'my-app',
  registerIpc({ ipc }) {
    ipc.register<string, string>({
      channel: IPC.ping,
      input: z.string(),          // Zod-validated at the boundary — untrusted renderer input
      handle: (msg) => `pong: ${msg}`,
    });
  },
  onReady({ windows, logger }) {
    windows.create({ width: 1100, height: 760 });
    logger.info('window opened');
  },
});
void desktop.start();
```

**The IPC contract lives in ONE file** — `src/shared/ipc.ts` — the single source of truth for
channel names + payload/response types, imported by both preload (implements) and renderer
(consumes). Add a channel there, register a handler in `registerIpc`, expose a method in
`src/preload/index.ts`, call it from the renderer via `window.appytron.*`.

**The renderer** is a normal React + Tailwind + Zustand app. It never touches Node — it only
calls `window.appytron.*`. Persist UI state with a Zustand store; persist app data with
`@appydave/core` `Store` in the main process.

**Scaffold a new app:** `npx create-appytron my-app` (copies the template, rewrites the app name,
the `@appydave/core` dependency, and the packaging identity).

---

## 5. Recipes (the "intelligence" layer)

Recipes are **markdown capability-descriptions** bundled in each app at
`.claude/skills/recipe/references/*.md` (the AppyStack model). An agent reads the reference, looks
at the app's current structure, and scaffolds code that *fits* — idempotently. Shipped recipes:
- **`wrap-cli`** — turn an off-the-shelf CLI into a native console (ProcessSupervisor + IpcRouter + nav-shell). AppyTron's signature move.
- **`landing-page`** — a branded landing + download page wired to the GH-Releases feed.

**Discipline (important):** *recipes are byproducts of pilots, not speculative features.* Don't
write a recipe until a real app needs it; when it does, extract the pattern into a `references/*.md`.

---

## 6. Security model (the app is a lethal-trifecta surface)

An operator console has local file/process access + renders content + can act. Rules:
- `contextIsolation: true`, `nodeIntegration: false`. The preload is the **only** door; expose a
  minimal typed API — never raw `ipcRenderer`.
- **Zod-validate every IPC payload** in the main process before acting.
- **`FileAuthor` refuses any path outside its `root`** and git-commits each change (a revert point).
- **`ProcessSupervisor`/CLI drivers use arg allow-lists**, never string-concatenated shell (`spawn`, no shell).
- Strict CSP in the renderer; secrets via OS keychain, never plaintext.
- `sandbox: false` today (an ESM preload can't run sandboxed); `sandbox: true` is a future
  hardening step gated on a CommonJS preload.

---

## 7. Packaging & distribution

`electron-builder.yml` — macOS-first (arm64 dmg), `publish: github`. Scripts: `npm run package`
and `npm run release:mac`. Signing/notarization are env-driven (`CSC_LINK`, `APPLE_ID`, …) and
supplied when a Developer ID is available. Auto-update reads the GitHub-Releases feed via `Updater`.

---

## 8. Non-obvious gotchas (learned the hard way)

- **Preload path is `.mjs`, not `.js`.** electron-vite emits `out/preload/index.mjs`; loading
  `index.js` silently fails and `window.appytron` is never defined (symptom: UI stuck "loading…",
  buttons do nothing). `WindowManager` loads `../preload/index.mjs`.
- **`sandbox: true` breaks an ESM preload.** See §6.
- **`@appydave/core@0.1.0` is published to npm** (public) — a scaffolded app's default `^0.1.0`
  resolves. `create-appytron --link-core` keeps a `file:` link (recomputed relative to the target)
  when you want to edit core + the app together in the monorepo.
- **Two tsconfigs** (`tsconfig.node.json` for main/preload/shared, `tsconfig.web.json` for
  renderer). App code in both is `never`-touched by the upgrade system.
- **Data lives local-first** (via `Store`); there is no server.

---

## 9. Repo map

```
~/dev/ad/apps/appydave-foundation/      github.com/appydave/foundation  (public)
└── packages/core → @appydave/core      Bun + Vitest; 33 tests

~/dev/ad/apps/appytron/                 github.com/appydave/appytron    (public)
├── CONTEXT.md                          ← you are here
├── docs/appytron-plan.md               full design + all locked decisions
├── docs/pilots/imagedrip-plan.md       pointer → own repo (appydave/imagedrip)
├── docs/specs/signature-recipes-spec.md
├── template/                           the product (npm; the app you scaffold)
│   ├── src/main | preload | renderer | shared
│   ├── electron-builder.yml
│   └── .claude/skills/recipe/          wrap-cli · landing-page
└── create-appytron/                    npx create-appytron <app>  (npm; 5 tests)
```

**Verify the whole system is healthy:**
```
cd ~/dev/ad/apps/appydave-foundation && bun run test          # 33
cd ~/dev/ad/apps/appytron/template && npm test && npm run typecheck && npm run build
cd ~/dev/ad/apps/appytron/create-appytron && npm test
```

---

## 10. If you are building an app ON AppyTron — start here

1. Read §3 (primitives), §4 (the `createConsole` pattern), §6 (security), §8 (gotchas).
2. Scaffold with `create-appytron`, or copy `template/` and keep the `file:` core link for local dev.
3. Add features as **recipes** where a pattern repeats; keep the IPC contract in `src/shared/ipc.ts`.
4. Everything the renderer needs crosses the bridge as a **typed, Zod-validated** channel.
5. Anything that writes files goes through `FileAuthor` (scoped + committed); anything that runs a
   local process goes through `ProcessSupervisor`.
