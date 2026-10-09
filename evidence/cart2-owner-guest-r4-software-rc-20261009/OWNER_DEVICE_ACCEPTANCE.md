# Owner/Guest R4 software candidate — acceptance sequence

Candidate: `hbnf-cart2-owner-guest-r4-software-rc1-20261009`
Static package: `HBNF_CART_OWNER_UX_R4_GUEST_ROUTE_R2_20261008.zip` (exact SHA-256 is in `SOFTWARE_RC_MANIFEST.json`).
Firmware baseline: exact Foundation R4 SHA-256 `338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743a2f3d8c`.

This is an offline candidate. Do not deploy it until the backend/device acknowledgement contract is resolved and the release authority permits deployment.

## Required release order

1. Snapshot the currently served Owner and Guest static assets, active `hbnf-cart-control` and reconciliation/adapter versions, Guest Mode state, and rollback deployment IDs.
2. Validate the exact staged backend sources against current deployed database schema and R4 adapter compatibility. Require revision-bound device evidence before labeling a command applied; MQTT submission/liveness alone is not application confirmation.
3. Deploy the approved backend and static package through the existing release path, with Guest Mode explicitly read back as OFF. Do not change Matrix/AUX firmware or settings.
4. On the intended owner iPad, load the Owner URL, verify the new app version, and confirm existing pairing remains valid. Check brightness controls at the top and confirm command wording distinguishes accepted, submitted, failed, and device-confirmed states.
5. With a safe, designated practice scorecard only, read one round, perform one authorized score edit, and confirm authoritative readback and stale-write protection. Do not edit a real round for a smoke test.
6. Open the Guest URL. Verify Guest Mode is OFF and controls are unavailable. If a separately authorized owner session enables Guest Mode for testing, verify one bounded guest action and then close Guest Mode; otherwise leave this test deferred.
7. Verify the Home Screen app relaunches, network-loss messaging does not claim local control, and reconnect refreshes canonical state. No claim of offline control mutation is made.
8. Record owner-device results and rollback identity. Do not mark T4/T5 or full Cart 2.0 accepted from package or host tests alone.

## Acceptance gates still open

- Live backend acknowledgement compatibility and actual revision-bound application.
- Production deployment and exact rollback readback.
- Owner iPad/iPhone Home Screen operation and paired control/scoring smoke.
- Guest physical-device smoke, with Guest Mode returned to OFF.
- Vibe/audio, Text/Moments, synchronized AUX and full Cart 2.0 runtime qualification remain separate product gates.
