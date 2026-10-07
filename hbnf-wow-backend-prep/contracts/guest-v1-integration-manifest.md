# Guest V1 bounded integration manifest

Status: prepared offline; do not merge into the active Phase 2 branch until its coordinator closes the current candidate and freezes the exact guest route/session/action interfaces.

## Isolated implementation in this branch

- `backend/guest_v1.py`: dependency-injected gate/session/action policy; no auth provider, custom JWT, persistence engine, HTTP server, or device transport.
- `web/guest-v1.html` + `web/guest-v1.js`: static QR destination page. No sign-in UI, no persisted bearer token, and no controls active while Guest Mode is OFF.
- `contracts/backend-apis.md`: exact same-origin routes, cookie semantics, limits, and QR URL template.
- `tests/test_guest_v1.py`: deterministic host tests for default-off, owner mode, expiry, reconnect, cart binding, owner precedence, action allowlist, throttle and debounce.

## Minimal later merge steps

1. Add a `/guest/{cartId}` static route that serves these isolated files from the Cart's existing same-origin application host. Generate the owner-visible QR as `{cart_origin}/guest/{cartId}`; use the existing configured local Cart origin, never a guessed hostname.
2. Add one owner-authorized Guest Mode ON/OFF setting to the existing owner settings surface. Its default is OFF. When switched OFF, persist the OFF state first, then expire guest sessions in the existing session store; all request paths also consult the live flag, making the OFF state immediate.
3. Add `GET /api/cart/{cartId}/guest/session` (read-only status) and `POST /api/cart/{cartId}/guest/session` (create/reuse) on the existing backend. Use its existing server-side session store and set an HttpOnly, Secure, SameSite=Strict cookie. Never return a reusable session ID in JSON or JavaScript. Reject wrong-cart, expired, or mode-OFF requests.
4. Add `POST /api/cart/{cartId}/guest/actions`; translate only the action names/data exposed by this page into the existing Cart control/game handlers. Keep device, release, firmware, network and administrative endpoints outside the guest dispatcher. Apply the existing owner/safety serializer so owner writes win races.
5. Bind the `ExistingSessionStore` and `ExistingCartBackend` protocols in `guest_v1.py` to current interfaces. If the existing host has a shared request limiter, use it; otherwise this per-process throttle is adequate only for a single backend instance.
6. Add route-level tests using the actual application test client for cookie attributes, mode-OFF rejection, no direct database access, and owner-vs-guest write ordering. Run affected UI/backend smoke tests after the main candidate closes. No Supabase Auth/RLS changes are required for browser guests unless the current backend architecture proves it needs Supabase internally.

## Ownership and release boundary

Current Phase 2 `app/src/App.tsx` is a Supabase-configured React shell with no `/guest/{cartId}` route. This branch intentionally does not edit it, the existing guest controller, or current Phase 2 endpoint files. The later integration owner should select whether the new page replaces or adapts the current staged guest page only after reviewing the durable Phase 2 candidate.

The isolated module has no effect until the host constructs it with `enabled=True`, and the existing per-cart Guest Mode flag is also true. Keep both false in candidate release configuration until owner enablement is deliberately exposed.
