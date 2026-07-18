---
pilot: imagedrip
parent: appytron
status: pointer — full plan lives in the ImageDrip repo
moved: 2026-07-19   # ImageDrip is its own scaffolded app + repo, not part of AppyTron
---

# First Pilot — ImageDrip (pointer)

**ImageDrip is a separate app scaffolded *from* AppyTron — its own folder + repo.** AppyTron is
the boilerplate, not the host. This file is only a pointer so AppyTron's plan can reference its
first consumer.

- **Repo:** `appydave/imagedrip`
- **Folder:** `~/dev/ad/apps/imagedrip/`
- **Full plan:** `~/dev/ad/apps/imagedrip/docs/imagedrip-plan.md`
- **Installability spec:** `~/dev/ad/apps/imagedrip/docs/specs/installability-spec.md`

## Why it matters to AppyTron
ImageDrip is AppyTron's **first real consumer**, so building it pressure-tests the scaffold. It
drives ChatGPT's image UI (no paid API) via **Approach C** — an embedded webview host, synthesized
OS-level input, and DOM-read for completion/harvest — then routes downloaded images into a project
dir via `FileAuthor`.

**Recipes it forces into AppyTron** (Sentinel rule: recipes are byproducts of a real pilot):
`webview-harness`, `dom-observe`, `image-harvest`, `rate-limit-guard`, `human-cadence`.
*(These supersede the earlier `native-input`/`screen-capture`/`screen-watch`/`download-router`
set — Approach C makes OS-automation of an external window unnecessary.)*

**Validates existing surfaces:** `create-appytron` (see the installability spec for the gaps),
`FileAuthor`, `Store`, `IpcRouter`, `WindowManager`, `global-shortcut`, `packaging-macos`.
