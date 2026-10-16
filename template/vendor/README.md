# vendor/

Vendored, SHA-stamped tarball of `@appydave/core`, used in place of the old
`file:../../appydave-foundation/packages/core` dependency. That relative link resolved only when this checkout sat at its usual
depth; a git worktree one folder deeper (agent teams, OpenRig runs) pointed at nothing.
Same tarball and recipe as FliCut (`/Users/davidcruwys/dev/ad/flivideo/flicut/vendor/`).

## Current tarball

- `appydave-core-0.1.0-791e1c9.tgz`
- Source: `/Users/davidcruwys/dev/ad/apps/appydave-foundation/packages/core` (repo
  `appydave-foundation`, package `@appydave/core`), commit `791e1c9`.

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
