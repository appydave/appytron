# appytron-upgrade

Pull AppyTron template improvements into an existing app.

```bash
npx appytron-upgrade          # apply framework (auto) fixes; list recipe changes to review
npx appytron-upgrade --yes    # also apply recipe (skill) updates
```

Thin wrapper over [`create-appytron`](../create-appytron)'s upgrade engine (the logic + bundled
template live there). Exists purely for the clean command name — the same split AppyStack uses
between `create-appystack` and `appystack-upgrade`.

## Upgrade tiers

| Tier | Files | Behaviour |
|------|-------|-----------|
| `auto` | framework code (Tier-2 primitives, build config) | overwritten silently — this is how a fix (e.g. the preload `.mjs` fix) reaches every app |
| `recipe` | `.claude/skills/**` | reported for review; applied only with `--yes` |
| `owned` | `package.json`, `electron-builder.yml`, `appytron.json` | never touched |
| `never` | your app code (renderer, `main/index.ts`, `shared/ipc.ts`, tests) | never touched |

Reads `appytron.json` (written at scaffold time) as the baseline and stamps `lastUpgrade`.
