# vendor/

Vendored, SHA-stamped tarball of `@appydave/core`, used in place of the old
`file:../../appydave-foundation/packages/core` dependency. That relative link resolved only when this checkout sat at its usual
depth; a git worktree one folder deeper (agent teams, OpenRig runs) pointed at nothing.
Same tarball and recipe as FliCut (`/Users/davidcruwys/dev/ad/flivideo/flicut/vendor/`).

## Current tarball

- `appydave-core-0.2.0-1cd0e79.tgz` (zod 4; `zod` is a **peer dependency**, `^4.0.0`, satisfied by this app's own zod 4)
- Source: branch `core-0.2.0-zod4` @ `1cd0e79` of `appydave-foundation` (package `@appydave/core`),
  packed 2026-10-29 from `/Users/davidcruwys/dev/ad/apps/appydave-foundation-worktrees/core-0.2.0-zod4`.
  0.2.0 is **not yet on npm**. Once it is published: in `create-appytron/src/scaffold.ts` raise the
  default `coreVersion` from `^0.1.0` to `^0.2.0` (it is both the scaffold's package.json spec and its
  `appytron.json` `core` marker), and update the two `^0.1.0` assertions in `create-appytron/test/scaffold.test.ts`.
  `CORE_DEV_DEP` in `scaffold.ts` must always equal this template's package.json spec.

## Refresh it

```bash
git -C /Users/davidcruwys/dev/ad/apps/appydave-foundation diff --quiet HEAD -- packages/core || { echo "core tree dirty — commit first"; exit 1; }
cd /Users/davidcruwys/dev/ad/apps/appydave-foundation/packages/core && npm run build   # dist/ is gitignored and npm pack packs the working tree
SHA=$(git -C /Users/davidcruwys/dev/ad/apps/appydave-foundation rev-parse --short HEAD)
npm pack --pack-destination /Users/davidcruwys/dev/ad/apps/appytron/template/vendor
mv /Users/davidcruwys/dev/ad/apps/appytron/template/vendor/appydave-core-0.1.0.tgz /Users/davidcruwys/dev/ad/apps/appytron/template/vendor/appydave-core-0.1.0-$SHA.tgz
```

Then point `"@appydave/core"` in `package.json` at the new filename, remove the old tarball, and `npm install`.

**Durable fix**: publish `@appydave/core` (git-installable repo or npm) and pin a tag instead of vendoring.
