---
handover: installability-g1-g2
repo: appytron
audience: a Claude Code session working in ~/dev/ad/apps/appytron
created: 2026-07-19
partner: imagedrip   # first consumer; owns G3 (webview-harness), not this brief
---

# Handover — Make `create-appytron` Produce a Runnable Starter (G1 + G2)

**How to use:** paste the brief below into a Claude Code session `cd`'d into
`~/dev/ad/apps/appytron`. It's self-contained. Full detail lives in the ImageDrip installability
spec (linked).

---

**Task: make `create-appytron` produce a runnable starter app (G1 + G2).**

Full spec: `/Users/davidcruwys/dev/ad/apps/imagedrip/docs/specs/installability-spec.md`.
Context: `/Users/davidcruwys/dev/ad/apps/appytron/CONTEXT.md`. Both gaps verified 2026-07-19;
`create-appytron` has a vitest suite — keep it green.

**G1 — core dep won't resolve.** `@appydave/core` is unpublished (npm 404).
`create-appytron/src/scaffold.ts` rewrites the template's `file:` link → `^0.1.0`, so `npm install`
fails; and the `file:` path is fixed for the template's depth, wrong from any other location.
**Fix:** add a `--link-core` flag that writes a `file:` link recomputed with
`path.relative(targetDir, coreDir)` where `coreDir = ~/dev/ad/apps/appydave-foundation/packages/core`.
Acceptance: a scaffolded app under `~/dev/ad/apps/` runs `npm install` successfully.

**G2 — scaffolder aborts on existing folders** (`create-appytron/src/index.ts:32`). **Fix:** add
`--here` / `--into <dir>` merge mode — copy files that don't already exist, refuse only on real
collisions (unless `--force`), and never touch an existing `docs/` or `.git`. Acceptance: running it
against a folder that already holds `docs/`+`.git` adds the template cleanly.

**G4 (later, don't do now)** — publishing `@appydave/core` is the real fix behind G1; out of scope
for this pass.

**Do NOT** build the `webview-harness` recipe — ImageDrip owns that (G3) and will contribute the
reference file back. Order: G1 then G2. Add tests for both. Commit + push to `appydave/appytron`.
