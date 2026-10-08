# Changelog — create-appytron

## 0.2.0 — unpublished (publish: `npm publish --access public --otp=<code>` in `create-appytron/`)

Marks the template stack bump, so an app whose `appytron.json` says `createAppytron: 0.1.0` now reads as **drift**
instead of a false "current".

- **Template stack bump** — `4e36ea8`, 2026-09-13: **Electron 44**, **electron-vite 5**, **Vite 7**, **Vitest 5**,
  **React 19**, **Tailwind 4** (with `@vitejs/plugin-react` 5; `JSX.Element` → `React.JSX.Element`). Per-dependency
  evidence: `docs/BUILD-LOG.md`, 2026-09-13. Apps scaffolded from 0.1.0 (Electron 34, React 18, Tailwind 3) are not
  upgraded by this release; each app's upgrade is its own ticket.
- **The package now ships the template.** 0.1.0's tarball held no `template/` (it lives one level above the package),
  so `npx create-appytron` could not scaffold (`docs/BUILD-LOG.md`, 2026-08-29). `prepack` builds `dist/` and copies
  `../template` in (same skip list as the scaffolder: no `node_modules`, build output or lockfiles); `postpack`
  removes the copy.
- **A new app records the version that scaffolded it.** The `appytron.json` baseline was hard-coded to `0.1.0`; it is
  now read from this package's `package.json`.
- `appytron-upgrade` depends on `create-appytron ^0.2.0` (a `^0.1.0` range never resolves to 0.2.0).

## 0.1.0

First publish. Shipped without the template (see 0.2.0).
