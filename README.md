# AppyTron

**A scaffold for native, local-first desktop apps.** AppyTron is the third AppyDave scaffold — a
peer of [AppyStack](https://github.com/appydave/appystack) (web) and AppySentinel (headless). It
builds **Electron** apps that drive local processes, files, CLIs, and native OS surfaces — the
"operator console" a browser tab or a headless daemon structurally can't be.

```bash
npx create-appytron my-app
cd my-app
npm install
npm run dev
```

## What you get

- **Electron** (`electron-vite` + `electron-builder`) — main / preload / renderer split
- **React + Vite + Tailwind + Zustand** renderer, talking to main over a **typed, Zod-validated IPC bridge**
- **[`@appydave/core`](https://github.com/appydave/foundation)** — Lifecycle · Config · Logger · local-first Store
- **Tier-2 primitives** (template source): `WindowManager` · `IpcRouter` · `Bridge` · `ProcessSupervisor` · `FileAuthor` (path-scoped, git-committed) · `Updater` · `createConsole()`
- **Recipes** — `wrap-cli` (turn any CLI into a native console) · `landing-page`
- **macOS-first** packaging with a GitHub-Releases auto-update feed

## Layout

```
template/            the product — the app that create-appytron copies
create-appytron/     the scaffold CLI
docs/
├── appytron-plan.md          full design + all decisions
├── pilots/                   pilot specs
└── specs/                    recipe specs
CONTEXT.md           ← read this to understand the system deeply (for humans + agents)
```

## Build on it

Read **[`CONTEXT.md`](./CONTEXT.md)** — a read-once orientation to the primitives, the
`createConsole` pattern, the IPC contract, the security model, and the non-obvious gotchas.

## Status

Early. The scaffold is complete and runs end-to-end (`@appydave/core` → `createConsole` →
native window + typed IPC). `@appydave/core` is not yet published to npm, so scaffolded apps build
against the local monorepo for now.

MIT · David Cruwys
