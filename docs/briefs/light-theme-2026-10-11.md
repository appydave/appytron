# AppyTron template opens in the AppyDave light theme

**Status:** draft brief, not authorised to build. No dev-team ticket exists yet.
**Job:** D08 job 2 (AppyTron). Sibling for AppyStack: `/Users/davidcruwys/dev/ad/appydave-plugins/dev-team/contract/tickets/CT-0011.md`
**Spec artifact:** https://claude.ai/artifact/ScjVn6CPvocCZbuyppnVk1 · source `/Users/davidcruwys/dev/ad/apps/appytron/docs/briefs/light-theme-spec.html`
**Written:** 2026-10-11

## The problem

A new AppyTron app opens near-black (`bg-neutral-950`, indigo and emerald buttons). The AppyDave
brand is light-only, so every app scaffolded from the template starts off-brand and is re-skinned by
hand. FliCast and Teletubby both did that already.

## What changes (template only)

1. `template/src/renderer/src/index.css` gains an `@theme` block with the AppyDave tokens: cream
   `#faf5ec` canvas, `#f0ebe4` surface, `#e8e0d4` linen, `#d4cdc4` border, `#342d2d` ink,
   `#7a6e5e` muted, `#ffde59` CTA, `#c8841a` amber, `#2e91fc` links only; `color-scheme: light` on `:root`.
2. `template/src/renderer/src/App.tsx` swaps its 15 `neutral-*` classes and the indigo/emerald
   buttons for those tokens. Same three cards, same behaviour.
3. Brand fonts (Bebas Neue / Oswald / Roboto / Roboto Mono) are bundled locally, because the page's
   Content-Security-Policy blocks Google Fonts (see Evidence). Exact route is a choice for David.
4. `src/main/window-manager.ts` is **not** touched (see "Existing apps").

## Evidence

- `template/src/renderer/src/App.tsx:13` — `min-h-screen bg-neutral-950 text-neutral-100`;
  cards `border-neutral-800` (:30, :50, :62); buttons `bg-indigo-600` (:55), `bg-emerald-600` (:70).
- `template/src/renderer/src/index.css:1-24` — only `@import "tailwindcss"` and the drag-region
  classes; no theme tokens at all.
- `template/src/renderer/index.html:6-9` — CSP `default-src 'self'; ... style-src 'self' 'unsafe-inline'`;
  no `font-src`, so a fonts.googleapis.com link would be refused.
- `template/src/main/window-manager.ts:22,37` — `show: false` then `ready-to-show` → `win.show()`,
  so there is no dark flash to fix with `backgroundColor`.
- `template/src/main/index.ts:52` — the starter opens one 1100 x 760 window.

## Existing apps (create-appytron 0.2.0 upgrade tiers)

`create-appytron/src/lib/classify.ts:8-43`: renderer files (`App.tsx`, `index.css`, `index.html`)
and tests are tier `never`; `package.json` is `owned`. `upgrade.ts:50` turns both into `skip`.
So an upgrade changes nothing in FliCast or Teletubby for this job — both already run their own light
renderers (FliCast uses `#faf5ec` 13 times; Teletubby uses `bg-canvas text-ink` tokens).

Separate risk found, not this job: `window-manager.ts` is tier `auto` and is overwritten silently
(`upgrade.ts:90`). FliCast's and Teletubby's copies are customised (window roles, saved positions),
so any upgrade would clobber them today. Keep this job out of that file.

## Acceptance

- Template `index.css` contains `faf5ec` and `color-scheme: light`; `App.tsx` contains no `neutral-9`.
- `grep -c "prefers-color-scheme"` on both files prints `0`.
- `npm run typecheck` and `npm test` pass in `template/`.
- A fresh scaffold opens cream with brown text and the brand fonts (screenshot, before and after).
- Planning an upgrade against FliCast lists `App.tsx`, `index.css`, `index.html` as `skip`.

## Out of scope

Re-skinning existing apps; a theme prompt in `create-appytron` (AppyStack CT-0011 Q2 territory);
fixing the `window-manager.ts` auto-tier clobber risk (own ticket).
