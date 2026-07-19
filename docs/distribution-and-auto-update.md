# Distribution & Auto-Update (macOS) — the KyberBot pattern + the $99 question

**How an AppyTron app ships and updates itself** — grounded in Ian's working KyberBot app (a proven
reference on this machine) and Electron's official constraints. Companion to
[`signing-notarization.md`](./signing-notarization.md) (the one-time Apple-credential checklist).

## TL;DR — does it cost $99?

- **For a real product ("click a button and it just updates" for *anyone*): yes, $99/yr is
  unavoidable on macOS.** Not because of AppyTron — because of Apple. Two OS gates both require it:
  - **Gatekeeper** (first download/open) requires a **Developer-ID-signed + notarized** app, or macOS
    blocks it ("app is damaged / can't be opened").
  - **Squirrel.Mac** (the silent update swap that `electron-updater` uses) **requires a valid code
    signature** that matches between old and new build.
- **For personal / internal use (just you + Ian on your own Macs): you can go free** — but with a
  one-time **right-click → Open** speed bump per machine (or `xattr -dr com.apple.quarantine App.app`).
  Silent auto-update still won't work unsigned; you'd use a **manual-DMG button** instead.
- **KyberBot pays** (reuses Ian's existing Apple Developer ID, team `JQPJ9R933B`) and gets the clean,
  silent experience.

## How KyberBot does it (the reference to copy)

Reference app on Roamy: **`~/dev/kybernesis/kyberbot-desktop`** (electron-vite + electron-builder +
`electron-updater`). It's the full paid path — signed + hardened + notarized + stapled — with
Squirrel.Mac silent update polling GitHub Releases.

**`electron-builder.yml` (the key parts):**
```yaml
mac:
  identity: "Ian Winscom (JQPJ9R933B)"   # Apple Developer ID
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  target:
    - target: dmg   # arch: universal  → the human's first-time download
    - target: zip   # arch: universal  → REQUIRED by Squirrel.Mac for auto-update
afterSign: build/notarize.cjs           # xcrun notarytool submit --wait, then stapler staple
publish:
  provider: github
  owner: KybernesisAI
  repo: kyberbot-desktop
```
- **The `zip` target is what Squirrel actually consumes** (it feeds `latest-mac.yml`); the `.dmg` is
  only the first-time human download. You need **both**.
- `build/notarize.cjs` uses `xcrun notarytool submit … --keychain-profile "…-Notarize" --wait` +
  `xcrun stapler staple`. `@electron/notarize` is a devDependency.

**`src/main/updater.ts` (the UX pattern — lift it almost verbatim):**
- `autoUpdater.autoDownload = false`, `autoInstallOnAppQuit = true`.
- Polls: `checkForUpdates()` ~10s after launch, then every 6h.
- On `update-available`: **no dialog** — flip a state flag, push to renderer, show a title-bar badge.
- **Two-click, badge-driven:** click 1 (available) → `downloadUpdate()` → "Downloading…"; on
  `update-downloaded` the button turns green → **"RESTART"**; click 2 → `quitAndInstall(false, true)`.
- Set `app.isQuitting = true` before `quitAndInstall` so a hide-to-tray close handler doesn't
  intercept the relaunch.

**Flow:** `renderer TitleBar` → `preload` (`window.kyberbot.updater.*`) → `ipcMain` → `autoUpdater`.

## The options, honestly

| Option | Cost | First install (Gatekeeper) | Silent auto-update (Squirrel) | Reality |
|--------|------|----------------------------|-------------------------------|---------|
| **(a) Developer ID + notarization** | $99/yr | clean, no warning | ✅ silent | KyberBot. The only "just works" path. |
| **(b) ad-hoc / self-signed** | free | ❌ Gatekeeper blocks (right-click→Open) | ⚠️ unsupported/fragile | fine for you-and-Ian, bad for a product |
| **(c) manual-DMG button** | free | ❌ still Gatekeeper on open | N/A (bypasses Squirrel) | avoids Squirrel, **not** Gatekeeper |
| **(d) update.electronjs.org** | free service | — | still needs signing | not an escape hatch |

The trap with (c): polling `api.github.com/repos/<owner>/<repo>/releases/latest`, downloading the new
`.dmg`, and opening it *does* dodge Squirrel's signature check — but the app inside an
unsigned/unnotarized DMG is **still blocked by Gatekeeper on open**. So "free" only "just works" if
you accept the quarantine dance. (KyberBot already uses exactly this raw-GitHub-API poll for its
*CLI* updater — good code to copy for the manual variant.)

## Recommendation for AppyTron

1. **Default: reuse KyberBot's setup wholesale** — the hard part is already solved and sitting in
   `~/dev/kybernesis/kyberbot-desktop`. Copy `electron-builder.yml`'s mac/notarize/publish blocks and
   `updater.ts`, point `publish` at the AppyTron repo, and use a Developer ID (Ian's or an AppyDave
   one). AppyTron's existing `Updater` primitive already wraps `electron-updater` — extend it with the
   10s+6h timer, the two-click badge UX, and the `isQuitting` guard.
2. **If $99 is a hard no right now** (personal AppyTron for you + Ian): ship the **manual-DMG-button**
   variant (copy KyberBot's CLI GitHub-API fetch), accept right-click→Open on each of your Macs, and
   set electron-builder mac `identity: null` for ad-hoc. **Flag loudly:** the moment you want it to
   "just update" for anyone who isn't you, you're back to option (a).

**What this changes in the template (when you're ready to ship):** add a `zip` mac target +
`hardenedRuntime` + `entitlements` + an `afterSign` notarize hook to `template/electron-builder.yml`,
and grow `Updater` into the badge-driven two-click flow. None of it is needed for local dev.

## Sources

- KyberBot: `~/dev/kybernesis/kyberbot-desktop/{electron-builder.yml, build/notarize.cjs, src/main/updater.ts, src/renderer/components/layout/TitleBar.tsx, src/preload/index.ts}`
- Electron autoUpdater docs: *"Your application must be signed for automatic updates on macOS. This is a requirement of Squirrel.Mac."*
- Electron updates tutorial (macOS builds must be code-signed to use update feeds); electron-builder auto-update (Squirrel.Mac zip-target requirement); Apple notarization required for Gatekeeper since macOS 10.15.
