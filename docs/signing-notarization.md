# macOS Signing & Notarization — prep checklist

> **For the full picture** — how KyberBot ships + self-updates, the honest "$99 or not" answer, and
> the auto-update implementation to copy — see [`distribution-and-auto-update.md`](./distribution-and-auto-update.md).
> This file is just the one-time Apple-credential checklist.

AppyTron builds are **macOS-first** and ship via a GitHub-Releases auto-update feed. For users to
run a downloaded build without Gatekeeper warnings (and for auto-update to work), builds must be
**signed with a Developer ID and notarized by Apple**. Everything is env-driven, so the code needs
no changes — this is the one-time credential setup, David's to do when ready.

## What you provide (once)

1. **Apple Developer Program membership** — $99/yr ([developer.apple.com](https://developer.apple.com/programs/)).
2. **A "Developer ID Application" certificate** — create it in Xcode (Settings → Accounts → Manage
   Certificates → +) or the developer portal, then **export it as a `.p12`** (Keychain Access →
   your cert → Export), choosing a password.
3. **An app-specific password** for notarization — [appleid.apple.com](https://appleid.apple.com) →
   Sign-In & Security → App-Specific Passwords.
4. **Your Team ID** — the 10-char code in the developer portal (Membership).

## The five environment variables (electron-builder reads these)

| Var | Value |
|-----|-------|
| `CSC_LINK` | path to (or base64 of) the `.p12` certificate |
| `CSC_KEY_PASSWORD` | the `.p12` export password |
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password from step 3 |
| `APPLE_TEAM_ID` | your Team ID |

Plus `GH_TOKEN` (a GitHub token with `repo` scope) for `--publish` to push the release + update feed.

## Enable it

1. In `template/electron-builder.yml`, under `mac:`, uncomment / add:
   ```yaml
   notarize: true
   ```
   (electron-builder notarizes automatically once the `APPLE_*` vars are present.)
2. Build + sign + notarize + publish:
   ```bash
   npm run release:mac      # electron-vite build && electron-builder --mac --publish always
   ```

## Notes

- **Never commit** the `.p12` or any of these values. Keep them in your shell env / a secrets manager;
  for CI, put them in GitHub Actions **repository secrets**.
- Notarization is **slow** (minutes) and its errors dominate first-time setup — read electron-builder's
  notarize output carefully; the common failures are a wrong Team ID or an app-specific password typo.
- Until this is set up, `npm run package` still produces an **unsigned** `.dmg` — fine for local
  testing, but macOS will warn on another machine and auto-update won't verify.
- Ties to `~/dev/ad/brains/personal-security` (handling signing credentials).
