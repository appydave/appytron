# create-appytron

Scaffold a new **AppyTron** desktop app (Electron, built on `@appydave/core`).

```bash
npx create-appytron my-desktop-app
cd my-desktop-app
npm install
npm run dev
```

## What it does

1. Copies the canonical AppyTron `template/` (skipping `node_modules`, `out`, `dist`, `.git`).
2. Rewrites placeholders via plain string replacement (no template engine):
   - `package.json` `name` → your app name
   - `@appydave/core` dev `file:` link → the published semver range (`^0.1.0`, or `--core <version>`)
   - the `createConsole({ name })` binding + window title → your app name

## Publishing note

The published package bundles its own copy of `template/`. Until a publish-time sync exists, the
CLI falls back to the repo-local `../template` when run from the AppyTron monorepo (so local dev
and tests work against the canonical template directly).
