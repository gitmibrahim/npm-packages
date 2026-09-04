# Architecture Decision Records — WebMCP Consent Layer

This document records the significant architectural decisions made during the
design and implementation of the consent layer for `@mcp-b/react-webmcp`. Each
entry captures the context, decision, consequences, and current status.

---

## ADR-001: Composition over fork — `useGuardedWebMCP` wraps `useWebMCP`

**Status:** Accepted  
**Date:** 2026-09-03

### Context

We needed a consent-gated tool registration hook for `@mcp-b/react-webmcp`.
Two approaches were considered:

1. **Fork `useWebMCP`** — copy the hook and add consent logic inline.
2. **Compose over `useWebMCP`** — create a new `useGuardedWebMCP` hook that
   wraps the existing hook, intercepting only the `execute` path.

### Decision

We chose **composition**. `useGuardedWebMCP` accepts a `GuardedToolDef` that
includes a `consent: ConsentMetadata` field, evaluates `requiresApproval` on
every invocation, and delegates to the underlying `useWebMCP` with the original
`execute` replaced by a gated wrapper. All other hook behavior (registration,
state, reset) passes through unchanged.

### Consequences

- **Positive:** Zero changes to `useWebMCP` itself. The consent layer is fully
  opt-in — existing consumers are unaffected. Upstream changes to `useWebMCP`
  flow through automatically.
- **Positive:** Clear ownership boundary — consent logic lives entirely in the
  new files (`useGuardedWebMCP.ts`, `consent-broker.ts`, `consent-types.ts`,
  `consent-annotations.ts`, `ConsentBrokerProvider.tsx`, `consent-presence.ts`).
- **Negative:** The `execute` function passed to `useWebMCP` has a different
  signature than the caller's original `execute` (it wraps it). This requires
  an `as any` cast on the inner `execute` call to satisfy the generic type
  constraints, since the hook's generic params don't perfectly align with
  `useWebMCP`'s `WebMCPConfig` type.

---

## ADR-002: Framework-agnostic `ConsentBroker` class

**Status:** Accepted  
**Date:** 2026-09-03

### Context

The consent flow needs a stateful coordinator: a queue of pending approval
requests, timeout management, session preapproval, decision event streams, and
(later) rate-limiting. This could live inside the React hook, inside a React
context, or as a standalone class.

### Decision

We implemented `ConsentBroker` as a **plain TypeScript class** with no React
dependency. It manages:

- A `Map<string, PendingConsentRequest>` of in-flight requests.
- A `Set<Listener>` subscriber pattern for state change notifications.
- Session preapproval via an `approvedThisSession` set (keyed on
  `origin::toolName`), only allowed for reversible tools.
- Configurable timeout (default 30 s) that auto-denies unattended requests.
- Presence-failure tracking with escalating backoff (10 s → 30 s → 90 s →
  capped at 5 min) and cooldown-based auto-rejection.

The React layer (`ConsentBrokerProvider`, `useConsentBroker`,
`usePendingConsentRequests`) wraps the broker in a context and subscribes to its
state via `useEffect` + `broker.subscribe(setPending)`.

### Consequences

- **Positive:** The broker is independently testable — pure TS tests, no DOM,
  no `renderHook`, no React Testing Library. The broker test suite covers
  lifecycle, timeout, session preapproval, presence-failure lockout, and backoff
  reset.
- **Positive:** The same broker could be consumed by a non-React framework
  (Vue, Svelte, vanilla JS) with a thin adapter.
- **Negative:** Two layers of state (broker internal state + React `useState`
  driven by `subscribe`) require careful synchronization, though in practice the
  subscriber pattern makes this straightforward.

---

## ADR-003: Dual-layer annotation mapping — `ConsentMetadata` + MCP `ToolAnnotations`

**Status:** Accepted  
**Date:** 2026-09-03

### Context

MCP defines `ToolAnnotations` (`readOnlyHint`, `destructiveHint`,
`idempotentHint`) as behavioral hints for agent runtimes. Our consent layer
defines `ConsentMetadata` (`scope`, `reversible`, `riskLevel`,
`requiresApproval`, `requireUserPresence`) as a richer, human-facing schema.
These serve overlapping but distinct purposes.

### Decision

We maintain **both schemas** and provide a deterministic mapping function
`toMcpAnnotations(consent: ConsentMetadata) → McpToolAnnotations`:

```
readOnlyHint     = riskLevel === 'low'  && reversible
destructiveHint  = !reversible
idempotentHint   = reversible && riskLevel !== 'high'
```

`McpToolAnnotations` is a narrower interface defined locally in
`consent-annotations.ts`, structurally compatible with (but intentionally
separate from) `ToolAnnotations` in `@mcp-b/webmcp-types`.

### Consequences

- **Positive:** Native runtimes (ChatGPT's built-in browser, the MCP-B Agent
  extension) that already understand `ToolAnnotations` receive real behavioral
  signal even if they never see `ConsentMetadata`.
- **Positive:** The consent layer's own UI can use the richer `ConsentMetadata`
  for more informative cards (scope lists, reversibility badges, risk levels).
- **Negative:** The mapping is a heuristic approximation — e.g., a
  `medium`-risk reversible tool maps to `idempotentHint: true`, which may not
  always be semantically accurate. This is documented and tested against three
  canonical cases.

---

## ADR-004: On-page consent card with `isTrusted` guard

**Status:** Accepted (with documented limitations)  
**Date:** 2026-09-04

### Context

When no native consent gate is present (most WebMCP runtimes), the consent
layer renders an in-page approval card. A critical vulnerability was identified:
a page-scriptable agent or extension could dispatch a synthetic click event on
the Approve button to self-approve its own high-risk operations.

### Decision

We added an **`isTrusted` guard** to both Approve and Deny click handlers:

```tsx
if (!e.isTrusted) {
  console.warn('[13.2-FIX] Ignored untrusted approve event for request', id);
  return;
}
```

This blocks script-dispatched DOM events (`.click()`,
`dispatchEvent(new MouseEvent(...))`).

Additionally, we confirmed via codebase audit (13.3) that the `ConsentBroker`
instance is **not leaked** to `window`, global registries, or any path
accessible outside the React component tree.

### Consequences

- **Positive:** Blocks the most common self-approval vector — Rook-style
  extensions and injected scripts using basic DOM automation.
- **Negative (documented limitation):** Does **not** block:
  - Chrome DevTools Protocol `Input.dispatchMouseEvent` (produces
    `isTrusted: true` by browser design).
  - OS-level input synthesis (native automation frameworks).
  - Direct `broker.decide()` calls if the broker instance is somehow leaked in
    a future change.
- **Positioning:** The card is a best-effort UI for runtimes without native
  gates. It is not a security boundary equivalent to OS/browser-level
  permission prompts. This is why `hasNativeConsentGate()` exists — defer to
  native gates where available; the card is a fallback.

---

## ADR-005: `hasNativeConsentGate()` as a detection stub

**Status:** Accepted (stub — returns `false`)  
**Date:** 2026-09-03

### Context

Two first-party runtimes already provide their own consent UI:

1. **ChatGPT's built-in browser** — "Site tools" review panel (GPT-5.6
   Sol/Terra, desktop app only, not Enterprise/Edu).
2. **MCP-B Agent Chrome extension** — per-tool "approval settings."

Neither can be injected into with custom UI. When a native gate is present,
rendering our own card is redundant and potentially confusing.

### Decision

We created `hasNativeConsentGate(): boolean` as a **detection stub** that
currently returns `false`. The consent card is only rendered when this function
returns `false`. The intent is for future work to detect real signals from
native runtimes (extension-injected globals, UA markers, etc.).

### Consequences

- **Positive:** The architecture is ready for runtime-conditional rendering
  without requiring a code change to the card component itself.
- **Negative:** Until detection signals are confirmed and implemented, the
  consent card always renders, even on runtimes that already have native gates.
  This is explicitly flagged as a stub in comments and in the PR description.

---

## ADR-006: WebAuthn user-presence verification for high-risk operations

**Status:** Accepted  
**Date:** 2026-09-04

### Context

For irreversible, high-risk operations (e.g., production rollbacks), a simple
click-to-approve may not provide sufficient assurance that a human is physically
present. We needed a stronger "proof of presence" mechanism.

### Decision

We implemented an optional **WebAuthn-based presence verification** gate:

- `consent-presence.ts` enrolls and verifies a platform-authenticator
  credential (Touch ID, Windows Hello, hardware key).
- Self-attested, client-generated challenge — not a server-side identity check.
- Opt-in via `ConsentMetadata.requireUserPresence?: boolean`.
- **Graceful fallback:** If no platform authenticator is available, the card
  falls back to a standard click-to-approve flow.
- `@simplewebauthn/browser` added to the pnpm catalog and `react-webmcp`
  dependencies.

### Rate-limiting defense

To prevent MFA-fatigue attacks (repeatedly prompting the user until they
approve out of frustration), the broker tracks presence failures per request:

| Mechanism           | Detail                                                    |
| ------------------- | --------------------------------------------------------- |
| Failure tracking    | `recordPresenceFailure()` increments per pending request  |
| Lockout trigger     | 3 failures (`MAX_PRESENCE_ATTEMPTS`) → cooldown           |
| Escalating backoff  | 10 s → 30 s → 90 s → … capped at 5 minutes                |
| Immediate rejection | Auto-denies calls during active cooldown (`rate-limited`) |
| Countdown support   | `getCooldownRemaining()` for live UI countdowns           |

### Consequences

- **Positive:** Raises the approval bar beyond a synthetic click for genuinely
  dangerous operations — a biometric check or hardware-key tap.
- **Positive:** Graceful degradation means the feature doesn't hard-block on
  unsupported hardware.
- **Negative:** Adds a dependency (`@simplewebauthn/browser`) to the package.
- **Negative:** WebAuthn ceremonies can fail for legitimate reasons (timeout,
  user cancellation), which the rate-limiter may incorrectly penalize.
  Mitigation: lockout resets on any successful approval.

---

## ADR-007: Cross-tab attention cues

**Status:** Accepted  
**Date:** 2026-09-04

### Context

When a tool invocation arrives via the MCP tabServer transport from another tab
or the extension, and the demo tab is not focused, the user has no way to know
a consent card is waiting for their decision.

### Decision

We implemented a `useTabAttention` hook in the demo app that provides two
visual cues:

1. **Title blink:** Alternates between the original title and `"⚠ Approval
needed"` (1 s interval) while `document.hidden` is `true` and a pending
   request exists.
2. **Favicon badge:** Swaps from `favicon.svg` to `favicon-dot.svg` (red dot
   overlay) whenever any pending request exists, regardless of focus.

Both effects stop immediately when the pending request is approved or denied,
since `usePendingConsentRequests()` updates reactively on `broker.decide()`.

### Consequences

- **Positive:** Users are alerted to pending approvals even when the tab is in
  the background — critical for cross-tab agentic workflows.
- **Positive:** Minimal implementation (single hook, no external dependencies).
- **Note:** This hook lives in the demo app (`apps/consent-demo`), not in the
  `react-webmcp` package — it's a demo-level UX pattern, not a package export.

---

## ADR-008: Session preapproval restricted to reversible tools

**Status:** Accepted  
**Date:** 2026-09-03

### Context

For frequently invoked tools that require approval, prompting the user every
time creates unnecessary friction. A "remember this decision" checkbox was
considered.

### Decision

The `ConsentBroker` supports session preapproval via a `rememberForSession`
parameter on `decide()`, but **only when `consent.reversible` is `true`**.
Irreversible actions (where `consent.reversible === false`) can never be
session-preapproved — each invocation requires an explicit decision.

The session key is `origin::toolName`, scoping preapproval to a specific tool
from a specific origin within the current page session.

### Consequences

- **Positive:** Reduces approval fatigue for safe, reversible operations
  without compromising the gate on genuinely dangerous ones.
- **Positive:** Session scope (not persisted) means preapprovals don't survive
  page reloads, limiting the blast radius of an accidental approval.
- **Negative:** The "remember" checkbox is hidden for irreversible tools with
  no explanation in the default card UI — consuming apps should explain why.

---

## ADR-009: `origin` field reflects the registering page, not the real caller

**Status:** Accepted (known limitation)  
**Date:** 2026-09-04

### Context

When a tool is invoked from another tab/extension via the MCP tabServer
transport, the `PendingConsentRequest.origin` field shows the demo app's own
origin (`window.location.origin`) rather than the actual caller's.

### Root cause

`useGuardedWebMCP` evaluates `origin: window.location.origin` inside the page
that _registered_ the tool, not the page that _invoked_ it.
`TabServerTransport.ts` receives the real caller's origin in
`MessageEvent.origin` and validates it against `allowedOrigins`, but discards
it before passing the JSONRPC message to the tool's `execute` callback.

### Decision

We documented this as a **known transport-layer limitation** rather than
attempting a fix:

- Threading the real origin through the MCP protocol layer would require
  changes to `TabServerTransport`, `useWebMCP`'s `execute` callback signature,
  and potentially the JSONRPC message envelope — a scope significantly larger
  than the consent layer itself.
- A comment was added to `useGuardedWebMCP.ts` on the `origin` line.
- The limitation is documented in `NOTES.md` and referenced honestly in
  submission materials.

### Consequences

- **Negative:** Audit logs and consent cards will show the demo app's own
  origin in all cases, even when calls originate from the extension.
- **Positive:** Honest documentation prevents overclaiming in the submission
  and leaves a clear trail for a future fix at the transport layer.

---

## ADR-010: Package placement — consent layer in `react-webmcp`, demo as `apps/consent-demo`

**Status:** Accepted  
**Date:** 2026-09-03

### Context

The consent layer could live in several places: a new standalone package, the
existing `react-webmcp` package, or `usewebmcp` (the strict-core hooks
package).

### Decision

- **Consent types, broker, annotations, presence verification, and hooks**
  live in `packages/react-webmcp/src/` — co-located with the existing
  `useWebMCP` hook they compose over. This is the MCP-B React layer, which is
  the correct home per the [package philosophy](./MCPB_PACKAGE_PHILOSOPHY.md).
- **The demo app** lives at `apps/consent-demo/` as a workspace member linked
  via `"@mcp-b/react-webmcp": "workspace:*"`.
- `usewebmcp` (strict core hooks) was **not touched** — consent is an MCP-B
  extension, not a core WebMCP feature.

### Consequences

- **Positive:** Follows the established layering: core types →
  core polyfill → MCP-B runtime → MCP-B React hooks.
- **Positive:** The consent layer ships as part of `@mcp-b/react-webmcp`'s
  published package — no extra dependency for consumers.
- **Negative:** Increases `react-webmcp`'s surface area and adds a new
  dependency (`@simplewebauthn/browser`). This is acceptable given the feature
  is fully opt-in — no existing export behavior changes.

---

## Decision Log Summary

| ADR | Decision                                          | Status                      |
| --- | ------------------------------------------------- | --------------------------- |
| 001 | Compose over `useWebMCP`, don't fork              | Accepted                    |
| 002 | Framework-agnostic `ConsentBroker` class          | Accepted                    |
| 003 | Dual-layer annotation mapping                     | Accepted                    |
| 004 | `isTrusted` guard on consent card                 | Accepted (with caveats)     |
| 005 | `hasNativeConsentGate()` detection stub           | Accepted (stub)             |
| 006 | WebAuthn presence verification + rate-limiting    | Accepted                    |
| 007 | Cross-tab attention cues (title blink, favicon)   | Accepted                    |
| 008 | Session preapproval for reversible tools only     | Accepted                    |
| 009 | Origin field is registering page, not real caller | Accepted (known limitation) |
| 010 | Consent layer in `react-webmcp`, demo in `apps/`  | Accepted                    |
