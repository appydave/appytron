## What & why

<!-- What changed, and what problem it solves. Not a restatement of the title. -->

## Surface area — reachability

Every user-facing capability must be reachable **headlessly**, not only from the UI.
Shipping a capability with only one surface is a **regression**, not a follow-up.

- [ ] Capability defined: typed input + typed output + metadata (class, idempotency, failure modes)
- [ ] Mutations return what they changed (prior value), so the operation is auditable and undoable
- [ ] Reachable from the UI
- [ ] Reachable headlessly — CLI / HTTP / MCP (at least one non-UI caller)
- [ ] **All of the above land in THIS PR**

> The headless surface is the embeddability contract. External agents and automations drive this app
> through it — they do not render the UI. A UI-only capability cannot be composed into them.
>
> Unticked boxes need a reason here. **"I'll do the CLI later" is not a reason.**

## Surface area — safety

Required for any **new or newly-exposed** capability.

- [ ] Classified: `read-only` / `reversible-write` / `destructive` / `external-side-effect`
- [ ] Authorization enforced in the capability layer — **not** in an adapter, **not** in a prompt
- [ ] The human/UI path goes through the same checks as the agent path
- [ ] Agent principal is narrower than the user's rights (scope, time, resource)
- [ ] Destructive or external-side-effect: preview / dry-run exists, and is answerable in advance
- [ ] Confirmation, override and approval channels are **not** on the agent-callable surface
- [ ] Any probe-dependent constraint **fails closed** — never degrades to the unconstrained path
- [ ] Meaningful effect: accepts an idempotency key, returns the original result on retry
- [ ] Audit record includes principal, parameters and prior state
- [ ] The published capability set is pinned by a test

> Unticked boxes need a reason. **"The agent won't do that" is not one.**

## Verification

- [ ] Ran it — not just a green suite
- [ ] No mutating capability was smoke-tested against live data

<!--
Reachability + safety blocks derive from ~/dev/ad/brains/agent-first-architecture/
  capability-model.md §6  ·  agent-safety.md §8  ·  field-notes.md (what these prevent)
-->
