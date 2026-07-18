---
project: appytron
status: draft-plan
created: 2026-07-18
author: David Cruwys (+ Claude)
kind: requirements + architecture + build plan
peers:
  - appystack   # web scaffold (RVETS)
  - appysentinel # headless daemon scaffold
reference:
  - ~/dev/upstream/repos/eve-studio   # pattern donor — DO NOT FORK
---

# AppyTron — Requirements & Build Plan

## 0. TL;DR

**AppyTron is the third AppyDave scaffold: it builds native, local-first desktop apps (Electron).**
It is a **peer** to AppyStack and AppySentinel, not an evolution of either — a different use case.

- It **borrows heavily** from AppyStack (the scaffold machinery + the React/Vite/Tailwind/Zustand renderer) and from AppySentinel (the long-running local-process harness + two-layer agentic install).
- It **borrows patterns — never code** — from `eve-studio` (Electron main/preload/renderer split, typed IPC bridge, per-workspace shell, file-authoring-with-git-commit, auto-updater wiring). No fork. No Vercel/Eve coupling.
- Its unique job is the **native desktop cockpit**: a GUI that drives *local* processes, files, CLIs and native OS surfaces — the thing a browser tab (AppyStack) and a headless daemon (AppySentinel) both structurally cannot be.

The three compose into one story: **AppySentinel observes, AppyStack shows it in a browser, AppyTron shows-and-controls it natively on the desktop.**

---

## 1. Identity — what AppyTron is (and is not)

**One-line purpose:** A scaffold + shared runtime for building local-first native desktop apps with a consistent Electron architecture, a typed IPC bridge, a safe process/file operator layer, and the same recipe/upgrade/agentic-install machinery every AppyDave scaffold shares — so every desktop app starts identical from commit zero.

**AppyTron IS:**
- A **scaffold that produces apps** (like AppyStack) — it does not run as an app itself.
- Opinionated toward **local-first operator / control-center** apps (its flagship recipe class), but generic enough for any desktop app.
- A **mutating** system by design — it authors files, spawns processes, drives CLIs. (This is the deliberate divergence from AppySentinel's observe-only rule.)
- **User-launched**, windowed, with native OS integration (tray, menu, notifications, shortcuts, auto-update).

**AppyTron is NOT:**
- Not a web app (that's AppyStack — no Express server, no Socket.io; **IPC replaces the transport tier**).
- Not a headless daemon (that's AppySentinel — AppyTron *has a UI* and is not always-on).
- Not an "Eve agent console" — eve-studio is one *instance* of the class; AppyTron is the generic scaffold with none of the Eve/Vercel domain baked in.
- Not a fork of anything.

> **AppyTron stands on its own.** The "Drip" image tool (§13) is merely its *first example/consumer*
> — a pilot that pressure-tests the recipes. It does **not** define AppyTron. Read the scaffold's
> identity from this section, never from any single pilot.

---

## 2. The Three-Stack Model (peers)

| Axis | **AppyStack** | **AppySentinel** | **AppyTron** (new) |
|------|---------------|------------------|--------------------|
| Use case | Full-stack **web app / dashboard** | Headless **local data coordinator** | Native **desktop app / cockpit** |
| Builds | Viewers (browser UIs) | Sentinels (observers) | **Consoles (desktop operators)** |
| Shell | Browser + Express server | launchd/systemd daemon | **Electron (main + renderer)** |
| Transport | HTTP + Socket.io | Access zone (MCP/HTTP/CLI) | **IPC (contextIsolated bridge)** |
| UI | React 19 + Vite 7 + Tailwind | none (headless) | **React + Vite + Tailwind + Zustand** |
| Lifecycle | request/response + sockets | always-on process harness | **user-launched app + main-process harness** |
| Mutation | app-defined | **observe-only** (by rule) | **mutates** (files, processes, CLIs) |
| Persistence | JSON `data/` (+ ORM recipe) | JSONL/snapshot files | **local-first (atomic JSON / SQLite / Keychain)** |
| Distribution | Dockerfile / Procfile | service scripts (launchd/systemd) | **signed+notarized build + auto-update feed** |
| Baseline file | `appystack.json` | (deferred) | `appytron.json` |

All three share the **same scaffold DNA**: a `create-*` CLI, a canonical `template/`, a shared config package, recipes-as-skills, and (AppyTron adopts) the two-layer agentic install.

---

## 3. The Composition Story

The three stacks are not just parallel — they **compose**:

```
   ┌────────────────────────────────────────────────────────────┐
   │  AppyTron console  (native desktop cockpit)                 │
   │  drives local processes/files + reads the fleet             │
   └───────────────▲───────────────────────────┬────────────────┘
                   │ reads Access zone          │ IPC / local
                   │ (MCP/HTTP/CLI)             │
   ┌───────────────┴───────────┐    ┌──────────▼────────────────┐
   │ AppySentinel daemons       │    │ local processes / files / │
   │ (one per machine, observe) │    │ CLIs on THIS machine       │
   └───────────────┬───────────┘    └───────────────────────────┘
                   │ same Access zone
   ┌───────────────▼───────────┐
   │ AppyStack Viewer (web)     │  ← the browser view of the same data
   └───────────────────────────┘
```

AppySentinel's own CONTEXT says *"Visualisation is a separate Viewer application."* AppyStack builds the **web** Viewer; **AppyTron builds the native desktop Viewer/controller.** This is the missing third corner, and it's why AppyTron is a peer, not a variant.

---

## 4. Borrow Map (the central instruction)

> David's rule: **borrow from AppyStack/AppySentinel — absolutely; borrow patterns (not code) from eve-studio; do not fork.**

### 4a. From AppyStack — ABSOLUTELY (the scaffold DNA + the renderer)
- **The whole scaffold machinery**: `create-appytron` CLI, canonical `template/`, `@appydave/appytron-config` package, and the **upgrade tier system** (`auto` / `recipe` / `never` / `owned`) with `appytron.json` as the version baseline.
- **String-replacement templating** (`content.split(from).join(to)`) — zero-dependency, auditable. Same rationale.
- **The renderer UI stack**: React 19 + Vite 7 + TailwindCSS v4 + Zustand. (Electron renderer ≈ an AppyStack client minus the Express/Socket transport.)
- **Skills-in-template**: bundle `recipe`, `app-idea`, `mochaccino` skills in `.claude/skills/` so every scaffolded desktop app ships with them.
- **Recipes-as-capability-descriptions** philosophy (composable, idempotent, reference-spec is the contract).
- **Config package with independent lifecycle** (shared ESLint 9 / TS / Prettier / Vitest) upgradable across all apps at once.
- **Directly reusable recipes**: `nav-shell`, `appydave-palette`, `add-state` (Zustand), `add-tanstack-query`, `add-elevenlabs-voice`, `domain-expert-uat`.

### 4b. From AppySentinel — ABSOLUTELY (the main-process harness DNA)
- **Process harness primitives** — port the shareable ones straight over: `Lifecycle` (starting→running→stopping, hooks in registration order / reverse on stop), `ConfigLoader` (defaults→file→env, Zod-validated, reloadable), `Logger` (Pino), `atomicWrite`, `SerialQueue`. These are exactly what an Electron **main process** needs.
- **The `createSentinel()` facade pattern** → AppyTron's `createConsole()` (or `createDesktop()`) facade wiring the primitives into one object every `main/index.ts` interacts with.
- **The two-layer install**: Layer 1 static CLI (deterministic, zero-LLM mechanical scaffold) + Layer 2 agentic handoff (`claude -p` runs a `configure-appytron` interview that wires recipes). Graceful degrade if `claude` is absent.
- **Boundary-zone thinking** — adapt Collect/Access/Deliver into AppyTron's own zones (§5b).
- **File-based state / CQRS-lite** for the main process's own state (commands write files, the loop reads them) — keeps main-process logic unit-testable.
- **"Recipes are byproducts of pilots, not speculative features"** discipline — no recipe without a real pilot demanding it.

### 4c. Patterns from eve-studio — BORROW, DO NOT FORK
Read `~/dev/upstream/repos/eve-studio` as a **reference blueprint** for *how a good Electron console is wired*:
- **The three-process split** — `src/main` (Node), `src/preload` (bridge), `src/renderer/src` (React), `src/shared` (types) with `contextIsolation`.
- **The typed IPC contract** — one `src/shared/ipc.ts` defining every channel; a single `window.<app>` object exposed via `contextBridge` (eve-studio uses `window.studio`).
- **Per-workspace tabbed shell** — a rail of items, each with its own workspace of tabs.
- **File-authoring with git-commit-per-change** — every mutation writes real files *and* commits, giving a revert point; path-safe (nothing outside a scoped root is ever touched). **This is the single best pattern to lift.**
- **Auto-updater wiring** — `electron-updater` + `electron-builder`, signed & notarized macOS builds, in-app updater.
- **Live-catalog / provider-agnostic thinking** — never hardcode a vendor; fetch capabilities at runtime.
- **The `electron-vite` + `electron-builder` build pipeline.**

### 4d. Deliberately NOT borrowed
- ❌ eve-studio's **Vercel/Eve coupling** — `main/vercel.ts`, `main/gateway.ts`, `main/eveSession.ts`, `main/evolve.ts`, `main/arcana.ts`, `main/arcanaWire.ts`, and renderer views `Deploy` / `Sandbox` / `Connections` / `Channels` / `Model`. None of it.
- ❌ eve-studio's **"Eve agent" domain model** (`@vercel/blob`, AI Gateway, Eve dev-server contract).
- ❌ From AppyStack: the **Express server + Socket.io** transport (IPC replaces it; an embedded local HTTP server becomes an *optional recipe*, not the default).
- ❌ From AppySentinel: the **observe-only rule** (AppyTron mutates), the **headless rule** (AppyTron has a UI), the **always-on daemon** model (AppyTron is user-launched).

---

## 5. Architecture

### 5a. The Electron three-process model

```
┌──────────────────────────────────────────────────────────────┐
│  RENDERER  (src/renderer/src)                                  │
│  React 19 · Vite 7 · Tailwind v4 · Zustand      ← from AppyStack│
│  nav-shell · workspace tabs · views                            │
└───────────────▲──────────────────────────────┬────────────────┘
                │  window.appytron (typed API)   │ IPC (contextIsolated,
                │  exposed by preload            │      sandbox:true)
┌───────────────┴──────────────────────────────▼────────────────┐
│  PRELOAD  (src/preload)  — the ONLY door                        │
│  contextBridge.exposeInMainWorld('appytron', <typed api>)      │
└───────────────▲──────────────────────────────┬────────────────┘
                │  ipcRenderer.invoke/on         │ ipcMain.handle
┌───────────────┴──────────────────────────────▼────────────────┐
│  MAIN  (src/main)  — the process harness        ← from Sentinel │
│  Shell zone · Bridge zone · Operator zone · Sync zone (§5b)     │
│  Lifecycle · ConfigLoader · Logger · Store · Updater           │
└──────────────┬─────────────────────┬──────────────┬───────────┘
        spawn/adopt          path-safe writes    optional
   ┌────────────▼─────┐   ┌──────────▼──────┐  ┌────▼──────────────┐
   │ local processes  │   │ files (git)     │  │ remote: update    │
   │ + external CLIs  │   │ scoped root     │  │ feed / Sentinels  │
   └──────────────────┘   └─────────────────┘  └───────────────────┘

  src/shared — types + the IPC channel contract (single source of truth)
```

### 5b. Main-process zones (Sentinel's zone model, adapted to a mutating desktop app)

| Zone | Role | Primitives |
|------|------|-----------|
| **Shell** | Owns native chrome: windows, tray/menu-bar, app menu, notifications, global shortcuts, deep links | `WindowManager`, `Tray`, `Notifier`, `ShortcutRegistry` |
| **Bridge** | The **only** door between renderer and main. Every channel typed in `shared/ipc.ts`; **every input Zod-validated at the boundary** | `IpcRouter` |
| **Operator** | The "does things locally" layer — where mutation lives (the divergence from Sentinel) | `ProcessSupervisor`, `FileAuthor` (git-safe), `CliDriver`, `Store` |
| **Sync** (optional) | Deliver-equivalent: pull the update feed, optionally read AppySentinel Access zones, push telemetry. Kept thin | `Updater`, `FleetClient` |

### 5c. IPC contract
- One `src/shared/ipc.ts` enumerates every channel + its request/response types (borrow eve-studio's shape).
- Renderer never touches Node — it only calls `window.appytron.*`.
- Main validates every payload with **Zod at the IPC boundary** (mirrors how Sentinel Zod-validates config). Untrusted renderer input is the primary injection surface (§9).

### 5d. Renderer = AppyStack-lite
- Same React/Vite/Tailwind/Zustand the AppyStack template already uses.
- Replace AppyStack's `useSocket` data layer with a thin `useIpc` hook wrapping `window.appytron`.
- The `nav-shell`, `appydave-palette`, and `add-state` recipes port over with minimal change.

---

## 6. Core Primitives — the `@appydave/appytron-core` package

Mirrors AppySentinel's "7 primitives + facade" shape. Ported items are marked.

| Primitive | Purpose | Origin |
|-----------|---------|--------|
| `Lifecycle` | start/stop hook harness for the main process | **port from Sentinel** |
| `ConfigLoader` | defaults→file→env, Zod, reloadable | **port from Sentinel** |
| `Logger` | Pino structured logging | **port from Sentinel** |
| `Store` | local-first persistence (atomic JSON default; SQLite recipe) | atomicWrite + SerialQueue **from Sentinel** |
| `IpcRouter` | typed channel registry, validate-then-dispatch | new (eve-studio pattern) |
| `Bridge` | preload `contextBridge` exposer, minimal typed API | new (eve-studio pattern) |
| `WindowManager` | create/track/restore native windows, tray, menu | new |
| `ProcessSupervisor` | spawn / adopt / monitor / stream-logs of local child processes | new (eve-studio `agentManager` pattern) |
| `FileAuthor` | path-scoped, git-committed file writes (revert point per change) | new (eve-studio's best pattern) |
| `Updater` | electron-updater wiring + signature-verified feed | new (eve-studio pattern, feed decoupled) |
| `createConsole()` | facade wiring all of the above into one object | **Sentinel's `createSentinel` shape** |

Core runtime deps kept minimal (Sentinel discipline): `pino`, `zod`, `ulid`, plus Electron-required `electron-updater`. Everything else (SQLite, MCP SDK, chokidar…) arrives only via a recipe.

---

## 7. The Scaffold System

Three published packages + one baseline file (AppyStack's exact shape):

```
@appydave/appytron-core     — primitives + createConsole()        (published)
@appydave/appytron-config   — shared ESLint/TS/Prettier/Vitest    (published)
create-appytron             — static scaffold (Layer 1) + upgrade  (published)
appytron-upgrade            — thin wrapper: `npx appytron-upgrade`  (published)
template/                   — canonical electron-vite app (NOT published)
appytron.json               — written at scaffold time, upgrade baseline
```

**Layer 1 — static CLI** (`npx create-appytron my-app`): copy `template/`, string-replace name/scope/appId/productName, `npm install`, `git init`, optional `gh` repo, write `appytron.json`. Deterministic, zero-LLM.

**Layer 2 — agentic handoff** (from Sentinel): spawn `claude -p` → runs `.claude/skills/configure-appytron/SKILL.md`, interviews on window model / process needs / native surfaces / recipes / packaging target, generates recipe code, smoke-tests `electron-vite dev`. Degrades gracefully if `claude` is absent.

**Upgrade** (from AppyStack): `npx appytron-upgrade` walks the template, classifies each file `auto`/`recipe`/`never`/`owned`, auto-applies config, diffs skill files, never touches `src/renderer/src` or `src/main` app code.

---

## 8. Recipe Catalogue (desktop capability patterns)

Recipes are the byproducts of real pilots (Sentinel discipline). Seed set:

### Signature recipes — the eve-studio playbook (David's insight)
What Ian built with eve-studio is really **two reusable recipes**, and they may be AppyTron's
most valuable output — the reason someone reaches for AppyTron at all:

- **`wrap-cli`** — *turn any capable off-the-shelf CLI into a native desktop console in ~an hour.*
  eve-studio is "just" a GUI over the `eve` CLI. The recipe: point AppyTron at a CLI, discover
  its commands/capabilities, spawn/adopt it as a managed process, and surface each capability as
  a native view — driving it without a terminal. This is the **operator-console flagship made
  repeatable**; it composes the `process-supervisor` + `cli-driver` + `nav-shell` primitives into
  one high-level move. AppyTron's headline value prop.
- **`landing-page`** — *build a beautiful landing + download page for the app* (à la evestudio.dev).
  For a desktop app the site is not just marketing — it's the **distribution surface**: the
  signed-build download, release notes, and the GitHub-Releases auto-update feed (§10) all live
  there. A web artifact, so it **borrows AppyStack / `frontend-design` web knowledge** — a clean
  cross-stack composition (AppyTron app + AppyStack-flavored site).

> These two are the "an idea → shipped native tool *with* a product page, same day" pair. Capture
> them early; they are what makes AppyTron feel like a superpower rather than a scaffold.

**Ported from AppyStack:** `nav-shell`, `appydave-palette`, `add-state` (Zustand), `add-tanstack-query`, `add-elevenlabs-voice`, `domain-expert-uat`.

**New — Electron/native:**
- `tray-menubar` — tray / menu-bar–only app mode
- `auto-updater` — electron-updater + chosen feed (§10), signature-verified
- `process-supervisor` — spawn/adopt/monitor local processes, stream logs to a view
- `file-author-git` — path-safe file authoring, commit-per-change (the eve-studio pattern)
- `cli-driver` — safely drive external CLIs (`gh`, `ansible`, project CLIs) with arg allow-lists
- `ipc-crud` — typed IPC CRUD channel + Zustand store binding (replaces AppyStack's `entity-socket-crud`)
- `local-store` — atomic JSON (default) or SQLite persistence
- `secrets-keychain` — macOS Keychain via Electron `safeStorage`; never plaintext secrets
- `native-notifications`, `global-shortcut`, `deep-link` (custom protocol handler)
- `mcp-host` / `mcp-client` — if the console hosts or consumes MCP
- `fleet-client` — read AppySentinel Access zones (the composition recipe; deferred per §14.5)
- `packaging-macos` — electron-builder config, code signing, notarization

**Forced by the first pilot ("Drip", see `docs/pilots/drip-plan.md`):**
- `native-input` — inject keystrokes / paste into the frontmost app (macOS Accessibility)
- `screen-capture` — region screenshot of a target area (macOS Screen Recording)
- `screen-watch` / `vision-diff` — detect "done" from screenshot changes, local-only
- `download-router` — watch a downloads dir, rename + route files into project dirs
- `human-cadence` — jittered timing engine + adaptive per-target pacing store

---

## 9. Security Model (Electron is a lethal-trifecta surface — treat it as one)

An Electron console has **local file/process access + it renders content + it can act** — the lethal trifecta. This gets first-class treatment (ties to `brains/personal-security`).

Non-negotiable template defaults:
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Renderer never gets Node.
- **Preload is the only bridge**; expose the *minimal* typed API via `contextBridge` — no raw `ipcRenderer`.
- **Zod-validate every IPC payload** in main before acting. Treat all renderer input as untrusted.
- **Path-safe file authoring** — `FileAuthor` refuses any path outside its scoped root (eve-studio does this; make it a primitive guarantee, not a per-app habit).
- **Strict CSP** in the renderer; disable navigation to untrusted origins; no remote code loaded into the main window.
- **`cli-driver` uses arg allow-lists**, never string-concatenated shell.
- **Secrets via `safeStorage`/Keychain**, never `.env` plaintext in a shipped app.
- **Signed + notarized builds**; auto-update **signature-verified** before apply.

---

## 10. Packaging & Distribution (non-Vercel)

Neither parent covers this — it's AppyTron's own domain (AppyStack ships a Dockerfile; Sentinel ships launchd/systemd scripts).

- **Build:** `electron-vite build` → `electron-builder` (borrow eve-studio's scripts: `package`, `release:mac`).
- **Signing/notarization:** macOS Developer ID + notarytool (eve-studio is "signed & notarized").
- **Update feed — the decoupling from eve-studio's `@vercel/blob`:**
  - **Default recommendation: GitHub Releases** (electron-builder has a native GH provider; zero extra infra; matches the public `appydave/*` repo pattern).
  - Alternatives: S3/R2 bucket, or a **Tailscale-internal feed** for fleet-only private apps.
- **Platform:** **macOS-first** (matches the fleet + eve-studio's stance + a simpler first notarization pipeline). Cross-platform is a later recipe, not v1.

---

## 11. Non-obvious Constraints & Risks

- **The renderer↔main boundary is a real network boundary in disguise** — every crossing is serialized IPC. Design channels coarse; don't chatter.
- **App code lives in TWO trees** (`src/main` Node + `src/renderer` web) with **two tsconfigs** (eve-studio has `tsconfig.node.json` + `tsconfig.web.json`). The upgrade tier system must treat both as `never`.
- **Notarization is slow and credential-heavy** — it will dominate the packaging recipe's failure modes. Budget for it.
- **electron-vite ≠ AppyStack's Vite setup** — Vite config, entry points, and env handling differ; the ported renderer recipes need a shim.
- **Auto-update on unsigned/dev builds silently no-ops** — mirror AppyStack's "silent wrong-port" class of bug: make dev-mode update a visible no-op, not a mystery.
- **Process adoption is fragile** — supervising processes the app didn't spawn (eve-studio "adopts existing servers") needs careful PID/port hygiene (reuse AppyStack's port-registry discipline for any embedded services).
- **AppyTron mutates — so the git-commit-per-change revert guarantee is load-bearing.** If `FileAuthor` ever writes without committing, the safety story breaks.

---

## 12. Scope Limits (what AppyTron is NOT)

- Does **NOT** run as an app itself — the template is the product (AppyStack rule).
- Does **NOT** ship a server or require deployment — the "backend" is the main process; data is local-first.
- Does **NOT** default to cross-platform — macOS-first; Windows/Linux via later recipe.
- Does **NOT** bundle a database — atomic JSON default; SQLite via `local-store` recipe.
- Does **NOT** include cloud/agent-framework coupling — no Vercel, no Eve, no vendor lock (the eve-studio exclusion).
- Does **NOT** replace AppyStack for web dashboards or AppySentinel for headless collection — it is the desktop peer, chosen when native OS access / local-first / no-browser is the requirement.

---

## 13. Build Roadmap

| Phase | Deliverable | Borrows |
|-------|-------------|---------|
| **0 — Charter** | This plan ratified + the four §14 decisions made | — |
| **1 — `core`** | `@appydave/appytron-core`: port Lifecycle/ConfigLoader/Logger/Store from Sentinel; add IpcRouter/Bridge/WindowManager/ProcessSupervisor/FileAuthor/Updater + `createConsole()` | Sentinel core (port) |
| **2 — `template`** | Minimal `electron-vite` app (main/preload/renderer/shared) wired to core, with `nav-shell` + one `ipc-crud` demo view. React/Vite/Tailwind/Zustand | AppyStack renderer + eve-studio shell shape |
| **3 — `create-appytron`** | Static Layer-1 CLI: copy AppyStack's CLI machinery (string-replace, `appytron.json`, upgrade tiers) | AppyStack CLI |
| **4 — agentic install** | Layer-2 `configure-appytron` skill + agentic handoff + seed recipe catalogue from Phase-5 pilot | Sentinel two-layer install |
| **5 — packaging + pilot** | `packaging-macos` recipe (sign+notarize+update feed) + **first pilot app** proving the whole chain | eve-studio build pipeline |

**First pilot: the "Drip" Image-Batch Console** → full spec in [`docs/pilots/drip-plan.md`](./pilots/drip-plan.md). A native operator console that drives ChatGPT's image UI (no paid API), vision-detects completion, and harvests/routes results — it exercises AppyTron's unique "mutating operator over local UI/processes/files" job and forces several new recipes (`native-input`, `screen-capture`, `screen-watch`, `download-router`, `human-cadence`). **Not needed to begin Phase 1** — the scaffold work is independent. Watchtower / switchboard remain later candidates.

---

## 14. Decisions — RESOLVED 2026-07-18

1. **Use-case boundary** — ✅ **Generic desktop scaffold with an operator-console flagship** (mirrors how AppyStack is generic). Not narrowed to agent-consoles.
2. **Platform** — ✅ **macOS-first.** Windows/Linux via a later recipe, not v1.
3. **Update feed** — ✅ **GitHub Releases** (electron-builder native provider; zero extra infra; matches the public `appydave/*` pattern).
4. **First pilot** — ✅ **The "Drip" Image-Batch Console** → see [`docs/pilots/drip-plan.md`](./pilots/drip-plan.md). Not needed to start Phase 1; it pressure-tests the recipe catalogue.
5. **Composition depth ("native cockpit over AppySentinel daemons")** — ✅ **Later concern, NOT v1.** The first pilot (Drip) drives *local* processes/UI/files and needs no `fleet-client`; defer that recipe until a fleet-cockpit pilot actually demands it (Sentinel rule: recipes are byproducts of pilots).

---

## 15. Naming & Package Layout

```
~/dev/ad/apps/appytron/
├── docs/                       # this plan + architecture/recipes as they solidify
├── config/    → @appydave/appytron-config     (shared linting/TS/test)
├── core/      → @appydave/appytron-core        (primitives + createConsole)
├── create-appytron/            → create-appytron  (Layer 1 + upgrade)
├── appytron-upgrade/           → appytron-upgrade (thin wrapper)
└── template/                   # canonical electron-vite app (the product)
```

Baseline file in every scaffolded app: `appytron.json`. Bridge global: `window.appytron`.
"Tron" = elecTRON — the name carries the shell choice.

---

*This is a draft plan for ratification, not a build. Nothing is scaffolded yet — Phase 1 begins on David's go.*
