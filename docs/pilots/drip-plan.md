---
pilot: drip
parent: appytron
status: named — not yet scaffolded
created: 2026-07-18
working_name: Drip
name_candidates: [Drip, FliShot, Conveyor, Relay]
resolves: [appytron-plan §13 first-pilot, appytron-plan §14.4]
security: lethal-trifecta (native-input + screen-capture + file writes) — see brains/personal-security
---

# First Pilot — Image-Batch Console (resolves AppyTron §13 TBD + §14.4)

**Status:** named as AppyTron's first real consumer, 2026-07-18. Designed in the same
conversation that produced the scaffold plan. Not yet scaffolded — pilot design is what
pressure-tests AppyTron before Phase 5.

**Working name:** `Drip` *(unratified — candidates: Drip / FliShot / Conveyor / Relay).*
"Drip" = the signature human-cadence prompt feed + a nod to its ancestor tool.

## What it is
A native desktop console (an AppyTron app) that **drives ChatGPT's image UI
(DALL·E / GPT-image) directly — no paid API.** It pastes image prompts into the real
ChatGPT window on a **human-like cadence**, uses **vision (region screenshots)** to detect
when each image is done, then **auto-downloads, names, and routes** the results into a
project's output directory. Later target: DZINE (pending Mary's workflow input).

## Why it's the *ideal* first pilot
It exercises exactly AppyTron's unique job — a **mutating operator console** driving *local
processes / another app's UI / files* on the same machine, the thing a browser tab
(AppyStack) and a headless daemon (AppySentinel) structurally cannot be. It hits nearly
every AppyTron surface at once, so it will honestly shake out the recipe catalogue.

## Hard constraint (drives the whole architecture)
**No API credits.** The tool must operate the real ChatGPT UI using David's subscription,
never an API key. This is a deliberate cost decision, not a limitation to design around.

## Origin
Rewrite of a ~30-line Ruby CLI, `mj-paste-test/main.rb` — a `pbcopy` drip feeder that
staged MidJourney `/imagine` prompts to the clipboard on a timer for manual paste.
Recover it at git `2a6f359:lib/mj-paste-test/main.rb` in `~/dev/ad/appydave-tools`.
Sins to fix: hardcoded paths, single target, and a *destructive* input file (it deleted
lines as it went — no clean resume/history).

## Domain model
```
Project → Theme → Style/Design → Prompt list → Runs (history)
```
Local-first, non-destructive, resumable, per-run history.

## Two operating modes (the spine)
- **Style Studio** — interactive: seed a style, test one image, redo/tweak, **lock** it.
- **Batch Runner** — hands-off: locked style → **open a fresh image tab** → drip the full
  list on human cadence → walk away.
- The handoff (**lock style → new tab → run from scratch**) is the core UX, not an add-on.

## Runtime engine
- **Auto-paste** into the focused window, **jittered human-like cadence** (randomized delays
  only — do not over-engineer anti-bot behavior until something breaks). Global **STOP key**.
- **Vision completion-detect:** screenshot-watch the image region → "done" → advance.
- **Adaptive tempo / learning:** the same screenshots that detect completion feed a rolling
  per-target pacing estimate, so the default *shifts over time* (solves "GPT is slow today").
  Fully local, no credits.
- **Harvest:** auto/batch download → rename by rule → route into the project output dir.

## What this pilot forces into AppyTron's recipe catalogue (§8)
New recipes it demands (Sentinel rule: recipes are byproducts of a real pilot):
| Recipe | Purpose | Note |
|--------|---------|------|
| `native-input` | Inject keystrokes / paste (Cmd+V+Enter) into the frontmost app | macOS **Accessibility** permission; cliclick/osascript or Electron |
| `screen-capture` | Region screenshot of the image area | macOS **Screen Recording** permission |
| `screen-watch` / `vision-diff` | Detect "generation done" from screenshot changes, local-only | pixel-diff first; optional local vision model later |
| `download-router` | Watch a downloads dir, rename + route files by rule into project dirs | chokidar-style watcher |
| `human-cadence` | Jittered timing engine + adaptive learning store | may be app code, not a shared recipe |

Existing planned recipes/primitives it **validates**: `local-store` (Project/Theme/Style/Run
persistence), `file-author-git` (path-safe, committed output writes), `ipc-crud` + `add-state`
(Zustand) + `nav-shell` (Studio/Batch views, live queue), `global-shortcut` (the STOP key),
`packaging-macos`.

## Security note
`native-input` + `screen-capture` + local file writes make this a **strong lethal-trifecta
surface** — it types into other apps, watches the screen, and writes files. Treat under
AppyTron §9: scoped `FileAuthor` root only, explicit macOS Accessibility + Screen Recording
grants, STOP key always live. Ties to `~/dev/ad/brains/personal-security`.

## First real job (built-in test data)
Joy's juice-bar product batch — **116 products currently with no photo.**
- Style: warm honey-wood counter, cream Thai-juice-bar interior, brass-gold accents, green
  plant, **text-free**, 1:1 square product shot (matches the approved "mango demo").
- Output dir: `joy-media/brand-art/juice-product/` (+ provenance log; product `photoRefs`
  set via the till API).
- Prompt list (116 prompts, one per product):
  `/private/tmp/claude-501/-Users-davidcruwys-dev-ad-joy/efefc0cc-3322-48af-b496-0b6aaeed2818/scratchpad/product-image-batch-preview.html`
  *(ephemeral scratchpad — copy into the project before relying on it).*
- **This is the cost case:** that HTML currently assumes the paid nano-banana-2 API
  (~$0.06 × 116 ≈ **$6.96/run**). Drip does the same batch on the ChatGPT subscription for
  $0 — and batches will recur, so the saving compounds.

## Open decisions for the pilot
1. **Name** — Drip / FliShot / Conveyor / Relay (currently "Drip").
2. **Plan doc home** — this file (`docs/pilots/drip-plan.md`) ✅.
3. **Scope of v1** — Batch Runner first (proves engine + vision + harvest on the Joy 116),
   with Style Studio as a fast-follow — or both in v1?
