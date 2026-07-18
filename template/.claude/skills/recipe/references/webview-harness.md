# Recipe: webview-harness

**Embed a real, logged-in remote web app, WRITE to it with synthesized trusted input,
and READ its DOM — no paid API, no macOS Accessibility/Screen-Recording grants.**
First extracted from the **ImageDrip** pilot (driving ChatGPT's image UI). Companion
recipes: `image-harvest`, `rate-limit-guard`.

## When to use

A capability that must operate a website the app doesn't own — on the user's real
session — and detect/collect results. It is a **lethal-trifecta** surface (embedded
remote origin + synthesized input + file writes); §9 rules are non-negotiable.

## Design invariants (the whole point)

1. **WRITE = trusted input**, never JS `.value=`/`dispatchEvent`. Trusted input travels
   the real Chromium pipeline → the page sees `event.isTrusted === true`.
2. **READ = DOM only** (a MutationObserver in a trusted preload). Reads are invisible to
   the server. All fragility lives in the selectors → isolate them in ONE module.
3. **Mechanism, not policy.** The harness exposes events + `feed()`; *when* to feed next
   (cadence/learning) is a separate concern.

## Electron 34 note

`BrowserView` is deprecated. Use **`WebContentsView`** added to the window's content view
and positioned by explicit bounds:
```ts
const view = new WebContentsView({ webPreferences: {
  partition: 'persist:<app>-<site>',   // login persists across restarts (treat as a profile)
  preload: join(__dirname, '../preload/webview-preload.mjs'),
  contextIsolation: true, nodeIntegration: false, sandbox: false, // ESM preload (§8 gotcha)
}});
window.contentView.addChildView(view);
view.setBounds(bounds);                 // renderer measures its panel rect, sends it over IPC
view.webContents.loadURL('https://…/');
```

## Files this recipe creates

```
src/main/webview-harness.ts     # the harness: attach/setBounds/newConversation/feed/harvest/stop + events
src/preload/webview-preload.ts  # trusted reader; ONE namespaced channel out; exposes NOTHING to the page
src/main/<site>-selectors.ts    # the ONE swappable module — every selector + predicate lives here
src/shared/ipc.ts               # + webview channel names + the inbound message union
electron.vite.config.ts         # + a second preload input: 'webview-preload'
```

## Wire the primitives

- **Read (preload → main):** a `MutationObserver` on `document.body`, debounced ~300ms,
  reports on ONE channel (e.g. `app:webview`). It exposes nothing via `contextBridge` —
  the page's JS must never see it. Main listens on `view.webContents.ipc.on(...)` (scoped
  to this view, not global `ipcMain`) and de-dupes bursty events.
- **Write (`feed`):** `clipboard.writeText(prompt)` → synthesized mouse click on the
  composer (focuses it, trusted) → **paste** → synthesized Enter.
  **⚠️ VERIFIED (ImageDrip probe, 2026-07-19): a synthesized Cmd/Ctrl+V via
  `sendInputEvent` is a NO-OP into a contenteditable — it does NOT paste.** Use
  **`view.webContents.paste()`** (the real Edit>Paste editing command): it fires `paste`
  + `input` events with `isTrusted === true`, upholding invariant #1 *and* actually
  landing the text. The click and the Enter keystroke ARE trusted via `sendInputEvent`.
- **Locate the input:** main sends a `locate-input` request; the preload replies with the
  composer's `getBoundingClientRect` center (device px) for the synthesized click.
- **Harvest:** on a de-duped "done" event, run the `image-harvest` recipe.
- **Selectors:** one module. Expect churn (the site renames classes) — re-pinning is a
  5-minute edit + rebuild, not a code hunt. Ship them as **UNVERIFIED placeholders** until
  a human proves them against the live DOM.

## Probe first (do this before wiring the real site)

Mirror `create-appytron/probe`. All three are cheap and the first two need no login:
1. **Read:** `WebContentsView` → a local page that emits DOM mutations → confirm the
   preload reports to main.
2. **Write + isTrusted:** point at a page that logs `event.isTrusted`; confirm
   `sendInputEvent` clicks/keys arrive trusted, AND that your paste path lands text into a
   contenteditable. **This gates the approach.**
3. **Real:** the live site + manual login (proves the persistent partition); a
   hand-triggered action fires "done" with a fetchable result.

## Security (docs §9 — non-negotiable)

- The embedded origin is **untrusted**: `contextIsolation:true`, `nodeIntegration:false`,
  no Node in the view, the preload exposes nothing to the page, ONE namespaced inbound
  channel. Never log or expose the persistent partition (it holds auth cookies).
- File writes go through **`FileAuthor`** (scoped root; refuses path escapes; git-commits).
- A global **STOP** shortcut halts immediately, session intact.
- **ToS/account risk is real** when automating a third-party site on a real session.
  Conservative cadence + `rate-limit-guard` + STOP are mitigations, not guarantees.

## Acceptance (verify by driving the real app)

1. Manual login **persists** across an app restart (partition works).
2. Synthesized input registers as `isTrusted:true`; the paste path lands the prompt.
3. `feed(prompt)` submits; a "done" event fires once per real action with a fetchable URL.
4. Harvest writes into the scoped dir + git-commits; swapping the selector module
   re-targets without touching harness code; STOP halts mid-batch.
5. `npm run typecheck` + `npm run build` stay clean.

## Idempotency

Detect an existing `webview-harness.ts` / `<site>-selectors.ts` and extend rather than
re-add; never duplicate the webview channel or the second preload input.
