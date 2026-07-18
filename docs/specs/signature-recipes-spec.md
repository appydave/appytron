---
spec: signature-recipes
project: appytron
status: draft — for ratification
created: 2026-07-18
covers: [wrap-cli, landing-page]
source_of_truth: ~/dev/ad/apps/appytron/docs/appytron-plan.md  # §8 Signature recipes
altitude: design (implementation-detail decisions deferred until first consumer — see feedback)
---

# Spec — AppyTron Signature Recipes: `wrap-cli` + `landing-page`

> The "an idea → shipped native tool **with** a product page, same day" pair.
> These are what make AppyTron feel like a superpower, not just a scaffold.
> They are **recipes** (markdown capability-descriptions run by Claude inside a scaffolded
> AppyTron app, per the AppyStack recipe model) — not library code in `core`.

---

## 1. Objective

Ship two recipes that together reproduce, generically, what eve-studio did for `eve`:

- **`wrap-cli`** — turn any capable off-the-shelf **CLI** into a **native desktop console**
  in ~an hour. Point it at a CLI; get a GUI that spawns/adopts it, surfaces each capability as
  a view, and drives it without a terminal.
- **`landing-page`** — generate the app's **beautiful landing + download page** (its
  distribution surface: signed-build download, release notes, the GitHub-Releases update feed).

**Target users:** David + collaborators building AppyDave desktop tools. Recipes are invoked by
a developer inside a scaffolded AppyTron app via Claude Code.

**Success = one AppyTron app can, in a single sitting:** wrap a real CLI into a working native
console AND have a branded page people can download it from — with no hand-written glue.

---

## 2. Commands (how the recipes are invoked & behave)

Both follow the AppyStack recipe contract: idempotent, composable, the reference file is the
source of truth; Claude reads it, understands the project, and scaffolds code that fits.

### `wrap-cli`
```
/recipe wrap-cli <cli-name>       # e.g. /recipe wrap-cli gh
```
Flow:
1. **Discover** the CLI's capabilities — parse `--help` / subcommands / JSON output, or accept a
   developer-supplied capability manifest when the CLI isn't introspectable.
2. **Interview** (short) on which capabilities to surface first + which are read vs mutate.
3. **Scaffold** the console (see §3): process supervision, typed IPC channels, a view per
   capability, an output/log console, a Zustand store for invocation state + history.
4. **Smoke-test**: run one discovered command from the GUI and confirm streamed output.

### `landing-page`
```
/recipe landing-page              # reads app metadata + GitHub Releases
```
Flow:
1. **Gather** app identity (name, tagline, features, screenshots) from the app's manifest +
   `docs/`, and the latest **GitHub Release** (download asset + notes).
2. **Generate** a responsive, brand-consistent static site (hero, features, screenshots,
   download CTA → GH Release asset, release notes, auto-update note).
3. **Preview** locally; leave hosting choice to the developer (§6 boundary).

---

## 3. Project Structure (where they live + what they scaffold)

Recipes ship as reference specs inside the AppyTron **template** (bundled skills pattern):
```
template/.claude/skills/recipe/references/
├── wrap-cli.md          # the wrap-cli capability description (the contract)
└── landing-page.md      # the landing-page capability description
```

**`wrap-cli` scaffolds into a consumer AppyTron app:**
```
src/main/
├── cli/<cli-name>.ts        # adapter: how to invoke + discover this CLI
└── (uses core) ProcessSupervisor + CliDriver
src/shared/ipc.ts            # typed channels: invoke, stream, cancel
src/renderer/src/
├── views/<capability>.tsx   # one view per surfaced capability
├── views/Console.tsx        # streamed output log
└── store/cli.ts             # Zustand: invocation state + history
```

**`landing-page` scaffolds into a consumer AppyTron app:**
```
site/                        # self-contained static site (web artifact)
├── index.html
├── assets/                  # inlined/local images, screenshots
└── (draws on brand-dave brand tokens + frontend-design)
```

Composes existing primitives/recipes (no new `core` primitives required): `wrap-cli` →
`ProcessSupervisor` + `CliDriver` + `IpcRouter` + `nav-shell`; `landing-page` → AppyStack /
`frontend-design` web knowledge + `brand-dave:brand`.

---

## 4. Code Style

- **wrap-cli output** follows AppyTron/AppyStack conventions: TypeScript, React 19, Tailwind v4,
  Zustand; typed IPC only (renderer never touches Node); `nav-shell` for layout.
- **landing-page output** is a **self-contained static site** — inline/local assets, responsive,
  theme-aware, AppyDave brand via `brand-dave:brand`. No external CDNs required to render.
- Both honor AppyDave file-naming (kebab-case) and the plan's architecture (§5).

---

## 5. Testing Strategy

Recipes are **generative**, so verification = scaffold-then-drive (the `domain-expert-uat`
pattern), not unit tests of the recipe text.

- **`wrap-cli` acceptance:** pick a real CLI (candidate: `gh`), run the recipe, then confirm from
  the GUI: (a) a discovered command executes, (b) its output streams live, (c) a second command
  works, (d) invocation history persists across app restart. "Done" = driven in the real app.
- **`landing-page` acceptance:** render the site and confirm: (a) responsive at mobile+desktop,
  (b) brand-consistent, (c) the download CTA resolves to the actual latest GitHub Release asset,
  (d) release notes present, (e) renders with no network (self-contained).

---

## 6. Boundaries

**Always**
- `wrap-cli` drives CLIs via **arg allow-lists**, never string-concatenated shell (ties to core
  `CliDriver` + §9 security). Path-safe writes only (scoped `FileAuthor` root).
- `landing-page` is self-contained + brand-consistent; download links resolve to a **real** GH
  Release asset.

**Ask first**
- *Which* CLI to wrap, and which capabilities are mutate-vs-read, before surfacing them.
- **Hosting** for the landing page (GitHub Pages / Cloudflare Pages / Vercel / other) — the recipe
  generates the site; deploying it live is the developer's call.
- Before publishing the download link publicly (it distributes a binary).

**Never**
- **Fork eve-studio** — patterns only; no lifted code, no Vercel/Eve coupling.
- Hardcode a vendor or model into `wrap-cli` output — stay CLI-agnostic.
- Expose secrets in either output (use core `Store`/Keychain, never plaintext in the site or app).
- Impersonate a real org/person on the landing page, or fabricate download assets/reviews.

---

## 7. Open Choices (raise conversationally, don't block the spec)

- **wrap-cli capability discovery** — auto-parse `--help` first, with a developer-supplied manifest
  as fallback? (Leaning yes — auto-first, manifest-fallback.)
- **landing-page hosting default** — recommend one (GitHub Pages pairs naturally with the GH
  Releases feed), or stay hosting-agnostic and just emit the static site?
- **First CLI to prove `wrap-cli`** — `gh` is a clean, introspectable candidate; open to a better one.

*(Implementation-detail decisions — toolchain, exact package boundaries — deferred until AppyTron
is built and tested on its first consumer.)*
