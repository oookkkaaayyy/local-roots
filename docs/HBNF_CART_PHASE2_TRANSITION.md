# HBNF Cart Phase 1 → Phase 2 transition

## Naming

- **Phase 1** = the canonical cart foundation plus the permanent private iPhone controller currently being finalized elsewhere.
- **Phase 2** = the dedicated Opal LAN, safe Matrix/AUX network migration, ESP32 game bridge, Stadia + touchscreen games, isolated guest-phone game controls, iPad role, UV integration review, and final integrated acceptance.

## Hard boundary

Phase 2 must not repair, replace, roll back, redeploy, or guess at Phase 1.

Phase 2 starts only from a machine-readable `PHASE1_FINAL_HANDOFF.json` captured after Phase 1 is actually finished. The launcher refuses to proceed until every required Phase 1 exit criterion is true.

## Phase 1 exit criteria

Before Phase 2 can start:

1. Canonical cart remains physically accepted: active fence, Matrix+AUX on the same desired revision/fence epoch, normal OFF/ON/NEXT/brightness behavior intact.
2. Permanent controller is on `https://hbnightflyers.com/...`; no temporary Supabase-storage/function URL is the normal field entry point.
3. One-time private pairing works.
4. Normal subsequent use does not require email or magic-link login.
5. Persistent paired access is verified and targets roughly 180 days.
6. An unpaired device is rejected.
7. No auth/session token remains in the visible URL after pairing.
8. Home Screen install/icon is verified.
9. The deployed controller/backend source is frozen in GitHub and exact production Edge Function versions/hashes are recorded.
10. `hbnf_internal.cart_device_sessions` and `hbnf_internal.cart_pair_tokens` have RLS enabled with the intended access model.
11. Temporary/test pairing tokens are either consumed, expired, or intentionally revoked.
12. iPad mini 2 compatibility with the final Phase 1 controller is explicitly decided.

## Why the iPad design changed

The prior Phase 2 package had a separate iPad authentication/UI deployment. That is now retired from the transition plan.

If the final Phase 1 field controller works on the iPad mini 2, Phase 2 will pair the iPad through the same permanent controller system. This avoids two cart-control frontends and two authentication systems. If iOS 12 compatibility fails, Phase 2 keeps the iPad as a local game controller and only then introduces a compatibility-specific cart page.

## Phase 2 invariants

- Phase 2 does not mutate Supabase production control/auth during normal rollout.
- Matrix remains visual master; AUX remains follower.
- Existing legacy WLED Wi-Fi profiles are preserved until HBNF-Cart cold-boot validation passes.
- Guest phones join isolated `HBNF-Play`, not the trusted `HBNF-Cart` LAN.
- Games use temporary DDP visual ownership only and must surrender immediately to canonical OFF/current state.
- UV never blocks the rest of Phase 2 and stays fail-dark/global-OFF dominated.

The current `config/PHASE1_FINAL_HANDOFF.json` is intentionally a **blocking placeholder**, not a declaration that Phase 1 is ready.
