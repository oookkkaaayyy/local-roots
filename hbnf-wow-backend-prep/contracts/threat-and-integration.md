# Threat cases and deferred integration manifest

## Abuse cases covered by policy

- QR photographed or forwarded: short ticket TTL + single-use atomic consume, cart binding, scoped capabilities, revoke all active sessions at owner action. Production session check is server-side on each mutation.
- Guess/replay/cross-cart capability: high-entropy random ticket, digest at rest, explicit cart binding, expiry, one-use ticket consumption; failed/expired tickets deny by default.
- Guest probes admin/release/device/network endpoints: default-deny scope allowlist; no such capability scopes exist.
- Guest spams Vibe/moment/game endpoints: per-session and per-route request window, total-use/session lifetime bounds, plus edge/WAF IP route limits; body size/content limits before persistence.
- Guest submits arbitrary text as device command or another guest's text: `moment.submit` is its own permission; input is data only and must pass existing content constraints/owner publication policy; never execute text as API/action.
- Owner issues revoke while guest remains connected: per-mutation current store/version lookup; revocation fails closed immediately; no stale capability cache.
- Owner changes Vibe or triggers safety override while a guest request races: existing owner authority serializes/applies last-writer priority; guest policy rejects when owner override is active.
- Supabase anonymous user abuses `authenticated` RLS role: inspect/adjust existing RLS to require `is_anonymous` and exact server-issued cart grants; service-role keys stay server-only. Anonymous Auth alone is not authorization.
- UV segment misidentification or output absent: hardware availability/config readiness remains false until readback/commissioning; output policy resolves to OFF. Never guess segment IDs or pin assignment.
- UV owner cap raised or Vibe input spikes: clamp to configured max, bounded envelope, monotonic ramp; owner override remains cap-constrained and OFF remains immediate.
- WLED/API or AUX unavailable: no retry loop or fallback protocol; report unavailable and stay OFF until the existing controller health path reports ready.
- Text too long/clips, unstable hold, or uncontrolled animation: keep existing functional text geometry, bounds-check content with the existing renderer, hold glyphs stable, revert to prior state on exit; default to current functional treatment until owner review.

## Minimal later integration manifest

No shared files are modified in this branch. Once the main Phase 2 worker closes and existing interfaces are frozen, the coordinator should make a separate reviewed integration change:

1. Existing guest UI/session routes (identify exact current owners from the closed Phase 2 tree): add a disabled-by-default owner toggle and owner-only issue/revoke actions. QR carries only a short-lived one-use ticket, never admin credentials.
2. Existing Supabase Auth/session flow: guest opens QR, uses `signInAnonymously()`, and exchanges the ticket with its JWT. Store anonymous user ID + cart ID + explicit scopes + expiry in existing session storage. Add RLS regression coverage for `is_anonymous`; make every guest mutation re-check current grant/revocation server-side.
3. Existing Cart mutation endpoints: require only the corresponding `vibe.select`, `moment.submit`, or `game.join` scope; keep owner actions/safety path and release/device administration independent and superior.
4. Existing AUX backend owner (`hbnf-aux-lighting/backend/aux_control.ts` on staging): use `aux_uv_policy` only for pure setpoint calculation; adapt the output patch through its established device-control route after exact WLED output/segment IDs and physical MOSFET/load stage are verified. Preserve existing feature/commissioning gates; no new transport.
5. Existing text/Vibe integration owner: bind an owner-selected treatment ID to the current text and Vibe APIs. Do not add presets to the current release candidate until owner review approves one and the active text fixtures/runtime smokes pass.
6. Keep `HBNF_CONTROL_STATE.json` and lifecycle unchanged. Integration consumes these as implementation evidence only; it is not a new lifecycle transition.

Merge-risk assessment: low for this branch's additive, isolated Python/config/docs only. Integration risk becomes moderate if it changes Supabase RLS/session semantics or WLED output topology, and high if it edits the active Phase 2 UI/renderer/control routes before that worker closes. Therefore those shared-file changes are explicitly deferred.
