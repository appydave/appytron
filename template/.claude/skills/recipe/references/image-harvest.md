# Recipe: image-harvest

**Download a resolved asset URL IN the embedded session, then route it through
`FileAuthor` — named, scoped, git-committed, with a provenance line.**
Companion to `webview-harness`; first extracted from the ImageDrip pilot.

## When to use

The `webview-harness` (or any embedded remote view) has surfaced a finished asset's URL
and you need it on disk, safely, inside a project's output dir.

## Why fetch in-session

Fetch through the **view's session**, not a bare `fetch`:
```ts
const res = await view.webContents.session.fetch(imageUrl);  // carries the session's auth/CDN cookies
const buf = Buffer.from(await res.arrayBuffer());
await fileAuthor.write(relPath, buf, `harvest ${relPath}`);
```
CDN/auth-gated URLs (e.g. `*.oaiusercontent.com`) only resolve with the session cookies —
a plain `fetch` gets a 403.

## Files this recipe creates

```
src/main/image-harvest.ts   # harvestImage({ session, fileAuthor, imageUrl, relPath }) + appendProvenance
```

## Wire the primitives

- **`FileAuthor` is the only writer.** Construct it scoped to the project's output dir; it
  **refuses any `relPath` that escapes root** and git-commits each write (a revert point).
  Harvested assets can therefore land ONLY inside the scoped dir (docs §9).
- **Naming is domain policy, not harness policy.** The caller supplies
  `nameFor(index) => relPath` (e.g. `brand-art/item-001.png`). Keep the harness generic;
  the consuming project owns the filename rule.
- **Provenance:** append one JSON line per harvest (`{ prompt, imageUrl, savedPath, at }`)
  to a log file, also via `FileAuthor` (so it's scoped + committed) — a durable
  prompt→url→file→time record.
- **Guard the body:** reject a non-2xx response and an empty body before writing.

## Security (docs §9)

- Every byte is written by `FileAuthor` — no raw `fs.writeFile` to arbitrary paths.
- Never fetch a URL the embedded page didn't actually surface (don't take URLs from the
  renderer); the harness passes through only what its preload observed in the DOM.

## Acceptance

1. A finished asset downloads and lands at the expected scoped path, git-committed.
2. A path that escapes the root is **refused** (FileAuthor throws).
3. The provenance log gains one line per harvest.
4. `npm run typecheck` stays clean.

## Idempotency

Re-running against the same `relPath` overwrites deterministically (a new commit); it does
not append duplicates. Detect an existing `image-harvest.ts` and extend rather than re-add.
