# Recipe: rate-limit-guard

**Turn a detected provider limit-state into a pause + notify — never a blind spin.**
Companion to `webview-harness`; first extracted from the ImageDrip pilot. Account-safety,
not a nicety: when automating a third-party site on a real session, the cost of getting it
wrong is the account.

## When to use

Any long-running automation of an external service that can say "you've hit your limit".
The `webview-harness` preload observes the banner and emits `onRateLimit`; this guard
decides "are we allowed to send right now?" and owns the backoff clock.

## Files this recipe creates

```
src/main/rate-limit-guard.ts   # RateLimitGuard: hit() / isPaused / msUntilResume() / resume() / dispose()
test/rate-limit-guard.test.ts  # pure logic — fake timers, no Electron needed
```

## Wire the primitives

- **Detect** in the preload's selector module: a broad `[role="alert"]` (or similar)
  selector PLUS a **text gate** (a list of limit phrases), since the banner rarely has a
  stable class. Matching = `querySelector` + `textContent.includes(phrase)`.
- **Guard is mechanism, not policy.** The batch runner feeds the observed banner to
  `guard.hit(text)`, then checks `guard.isPaused` **before every send**. WHEN to resume
  (wait out the timer, prompt the user, or stop the run) is the caller's call.
- **Backoff:** on `hit()`, pause + schedule an auto-resume after `backoffMs` (default
  conservative, e.g. 15 min) and fire `onPause({ text, resumeAt })`. De-dupe repeat
  banners (the observer re-fires while the banner is visible) so one limit = one pause.
- **Escape hatches:** `resume()` (user chose to continue early), `dispose()` (clear timers
  on stop, without firing resume).

## Security / safety (docs §9)

- The guard exists BECAUSE unattended automation must fail safe: a limit → stop sending,
  surface it, wait — never keep hammering. Pair it with the global STOP shortcut and a
  conservative default cadence.

## Acceptance

1. `hit()` pauses and notifies with a `resumeAt`; `isPaused` is true.
2. After `backoffMs`, it auto-resumes and fires `onResume` once.
3. Repeat banners while paused do **not** double-pause.
4. `resume()` and `dispose()` behave (early resume; dispose clears without resuming).
5. Unit tests pass with fake timers.

## Idempotency

Detect an existing `rate-limit-guard.ts` and extend rather than re-add; keep the phrase
list in the site's selector module (one place for churn).
