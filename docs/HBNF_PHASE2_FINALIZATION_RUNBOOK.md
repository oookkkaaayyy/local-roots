# HBNF Phase 2 finalization runbook

After Phase 1 is genuinely final:

1. Re-audit live Supabase + GitHub and create the exact final handoff JSON.
2. Generate one random bridge device token outside GitHub.
3. Put only its SHA-256 in the handoff.
4. Create a dedicated `HBNF Phase 2 bridge` device session through the existing service-role-only device-session path.
5. Target 1825 days (5 years), avoiding a six-month maintenance surprise for local QR controls.
6. Build with `PHASE1_HANDOFF_FILE`, `BRIDGE_CART_TOKEN_FILE`, and `HBNF_PHASE2_REQUIRE_FINAL=1`.
7. Builder verifies token SHA against the handoff before packaging.
8. Plaintext token exists only in the final local Phase 2 package. Never commit it and never write it to AKS.
9. Independently extract and retest that exact tarball.
10. Deliver one file; run only `START_HBNF_PHASE2.command`.

Bridge API contract: `hbnf-cart-control`, `x-hbnf-device`, status/command, expectedRevision with HTTP 409 on stale revision, plus OFF/ON/NEXT/AUTO/BRIGHTNESS/VIBE/VIBE_AUTO/SPEED.

Physical validation still requires the real Opal/cart/ESP32/phones for migration, cold boot, captive-portal behavior, touchscreen latency, integrated game/cart behavior, and UV electrical work.
