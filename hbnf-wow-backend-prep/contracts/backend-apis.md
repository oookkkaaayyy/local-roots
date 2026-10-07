# WOW backend preparation contracts (offline only)

This package is implementation preparation, not production wiring. It adds no network endpoint, database migration, device write, or deployment. Integrate only after the primary Phase 2 worker closes and the coordinator freezes the shared interface. The existing owner/auth/session store remains the production source of identity and revocation; do not create a competing control plane.

## Guest platform

- Preferred join flow: owner-authenticated `POST /api/cart/{cartId}/guest-join-tickets` creates a short-lived, single-use, owner-scoped ticket and a local URL/QR payload; enabled defaults false. A guest opens it and uses existing Supabase `signInAnonymously()` (no email/PII), then `POST /api/guest/join` presents the ticket with the anonymous Auth JWT. The existing server validates `is_anonymous`, atomically consumes the ticket, and stores the anonymous user ID + cart + capability scopes + expiry in existing session storage. Never put owner credentials/admin tokens or a durable guest token in QR data. `GET /api/guest/session` rechecks the bound record on reconnect; reconnect does not refresh expiry.
- `POST /api/guest/join` exchanges the capability for an established guest session; `GET /api/guest/session` revalidates capability, cart binding, expiry, and revocation on every reconnect. Reconnect does not refresh expiry.
- Guest mutation routes require a server-side capability check for the exact action scope: `vibe.select`, `moment.submit`, or `game.join`. Text/moment content is separately authorized and validated; it grants no authority to publish or execute device commands.
- Owner-authenticated `DELETE /api/cart/{cartId}/guest-sessions/{sessionId}` revokes immediately. Every guest action checks the authoritative store; owner actions and safety override are evaluated at the existing owner authority boundary and always win.
- Admin, release, device, network, and firmware actions are denied by absence from the allowlist, even if a malformed client requests them. Apply request/body bounds and rate limits at both session and IP/route boundaries.
- Production ticket storage must contain only a ticket digest, use atomic one-use consumption and immediate session revocation/version checks, and honor short bounded TTLs. Use the existing Supabase Auth JWT for guest identity; do not persist or invent a second production login session. Reference in-memory storage here is test-only and cannot provide cross-instance revocation.

## AUX UV control

`hbnf-wow-backend-prep/backend/aux_uv_policy.py` is a pure policy adapter. It maps OFF, MANUAL, FOLLOW_MATRIX, and VIBE_REACTIVE to WLED JSON segment updates, applies a configurable brightness cap and per-tick ramp, and emits OFF when software is disabled or capability hardware is unavailable. Segment IDs are injected after read-only WLED config inspection; they are not assumed here. Owner override precedes automatic modes. Matrix brightness/Vibe envelopes are inputs from existing control interfaces; no secondary runtime or protocol is introduced.

## Text/Vibe presentation

`text_presentation.json` describes three optional treatments using the existing text layer, segment/preset, and transition primitives. Treatments change entry/exit and background treatment only; the text geometry stays stable during hold. This document is a menu for owner evaluation, not a selected design or a frozen implementation. Unknown/unapproved treatment falls back to the existing functional treatment. No new font renderer is proposed.
