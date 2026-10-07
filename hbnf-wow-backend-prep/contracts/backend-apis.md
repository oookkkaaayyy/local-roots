# WOW backend preparation contracts (offline only)

This package is implementation preparation, not production wiring. It adds no network endpoint, database migration, device write, or deployment. Integrate only after the primary Phase 2 worker closes and the coordinator freezes the shared interface. The existing owner/auth/session store remains the production source of identity and revocation; do not create a competing control plane.

## Trusted-friends Guest V1 (supersedes the earlier ticket/capability draft)

- Join flow: static QR opens the same-origin `/guest/{cartId}` page. QR contains only that route and cart identifier; no ticket or credential. No email, account creation, visible login, Supabase anonymous Auth, custom JWT, or direct database authority.
- Feature flag and owner switch are both required and default OFF. Owner ON/OFF lives in the existing owner-authorized settings surface. OFF makes the backend reject every guest request immediately and expires that cart's guest sessions so a later ON starts fresh.
- `GET /api/cart/{cartId}/guest/session` checks current state without creating a session. When enabled but disconnected, the page calls `POST /api/cart/{cartId}/guest/session`; that creates/reuses a session in the existing Cart session store and sets a same-origin HttpOnly, Secure, SameSite=Strict cookie. Default lifetime is two hours; configurable up to four hours. Reconnect reuses the same unexpired session and never extends its expiry. No localStorage/sessionStorage bearer token.
- `POST /api/cart/{cartId}/guest/actions` accepts only actions represented in the Guest UI (`vibe`, `open_mode`, `game_action`), validates action payloads, and dispatches through existing Cart mutation handlers. It does not accept arbitrary WLED/device, administrative, release, network, or firmware commands. Apply per-session 20-actions/minute throttling and a 400 ms repeated-action debounce.
- Owner actions and safety override retain the existing serialization and authority boundary. Check owner override before guest dispatch, and have the host dispatcher serialize guest writes against owner writes so an in-flight guest update cannot overwrite an owner action.
- `hbnf-wow-backend-prep/backend/guest_v1.py` is a dependency-injected policy adapter; it does not implement a session store, auth, HTTP server, or device transport. The host provides adapters for its existing session store, owner-mode state, and cart-action dispatcher. The reference rate limiter is process-local and suitable only when the existing backend is single-instance; otherwise use its native shared throttle.
- Supabase is not required for this use case unless the existing backend is itself Supabase-hosted and requires Supabase internally. Guest browsers do not receive database access.

## AUX UV control

`hbnf-wow-backend-prep/backend/aux_uv_policy.py` is a pure policy adapter. It maps OFF, MANUAL, FOLLOW_MATRIX, and VIBE_REACTIVE to WLED JSON segment updates, applies a configurable brightness cap and per-tick ramp, and emits OFF when software is disabled or capability hardware is unavailable. Candidate SP803E PWM channels are board-documented GPIO25/26/27; GPIO25 is the existing AUX code's UV-main candidate and 26 UV-short. The current accepted WLED config remains the GPIO16 addressable bus only. Do not choose WLED output type/segment IDs or enable a candidate until offline config readback plus board revision and fail-dark boot behavior are verified. Owner override precedes automatic modes. Matrix brightness/Vibe envelopes are inputs from existing control interfaces; no secondary runtime or protocol is introduced.

## Text/Vibe presentation

`text_presentation.json` describes three optional treatments using the existing text layer, segment/preset, and transition primitives. Treatments change entry/exit and background treatment only; the text geometry stays stable during hold. This document is a menu for owner evaluation, not a selected design or a frozen implementation. Unknown/unapproved treatment falls back to the existing functional treatment. No new font renderer is proposed.

## QR target

`{cart_origin}/guest/{cartId}` is the target contract. `cart_origin` must resolve to the same origin that serves the Cart Guest API. The actual local hostname/origin remains a deployment value and is deliberately not guessed in this branch.
