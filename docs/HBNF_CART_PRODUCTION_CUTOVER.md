# HBNF Cart production cutover

This package separates additive schema creation from production activation. The migration is not a deployment switch.

## 1. Preflight and backup

Before any production change, save the current hbnf-matrix-control v171, hbnf-aux-control v14, and hbnf-cart-orchestrator v5 source snapshots and verify their SHA-256 values against `hbnf-cart-release/rollback/CURRENT_LIVE_CONTROL_BASELINE.json`. Record a read-only status snapshot of the known-good cart and both devices. Do not infer brightness from a preset or from an old default.

The exact matched Matrix/AUX images, deterministic firmware rollback pair, current control rollback sources, and UI source are carried in this package. Check all hashes before writing.

## 2. Apply only the additive migration

Apply `supabase/migrations/20260926080000_hbnf_cart_core_production.sql` using the approved migration runner. It creates private `hbnf_internal` tables and one service-role-only revision RPC. It creates an inactive fence row, but no desired-state row, user allowlist row, readiness approval, or device projection. It performs no network request and does not call a controller. Do not run the staging-only migration in production.

Verify that the fence is present and `active=false`, desired state/readiness are absent, public/anon/authenticated have no table/function access, and the RPC is not callable as anon/authenticated. Stop on any discrepancy.

## 3. Deploy backend while fenced

Deploy the packaged `hbnf-cart-control` and `hbnf-cart-reconcile` sources with their pinned `deno.json` files. Verify versions/source hashes and Auth/operator allowlist behavior. Configure and verify the already-approved Matrix/AUX adapter endpoints and their secret-backed tokens; never print token values. Keep UI traffic on the known-good control path until the UI is ready. The new command RPC refuses all writes while the fence is inactive.

## 4. Seed state and profiles (still inactive)

Capture a reviewed revision-0 JSON bootstrap snapshot from the current known-good cart and read back the current sticky Matrix and AUX brightness values independently. Include both values in `devices.matrix` and `devices.aux`, each with `brightnessLocked: true`. The initializer refuses defaults, mismatched brightness, changed existing state, a different release identity, inactive/missing operator access, or an active fence.

Set the environment inputs required by `scripts/hbnf-cart-cutover-init.sh` and run it from the package root. It only inserts absent bootstrap rows and verifies exact equality; it does not activate the fence.

## 5. Prepare and atomically activate only after all lanes are ready

With the matched firmware installed and hash/reconnect readiness independently verified, deploy the unified UI while the new fence remains inactive. Verify backend auth/status while fenced, both device firmware hashes, UI routing, independent brightness values, and the pure canonical Matrix/AUX projection using `scripts/hbnf-cart-projection-preflight.mjs`; this preview does not contact devices. Record evidence in `cart_cutover_readiness` using `scripts/hbnf-cart-production-readiness.sql`, with every readiness flag true only after its corresponding check passes.

After activation, verify that real Matrix and AUX acknowledgements share the activated cart revision/fence before allowing ordinary control. Only then execute `scripts/hbnf-cart-production-activate.sql` with the same release/artifact/firmware identity. It locks the fence, checks all five readiness flags and revision-0 seeded state, and atomically increments the fence epoch while activating that one release. If any check fails, the transaction aborts without activation.

## 6. Deterministic rollback

If a critical verification fails after activation, first set the new fence inactive in a single transaction. Then restore v171/v14/v5 from the packaged source snapshots and verify their pinned hashes; restore the prior UI and rollback Matrix/AUX firmware from the package; confirm the old endpoints are healthy. Leave the additive `hbnf_internal` schema and inactive state in place—do not drop tables or delete evidence. Never roll back by deploying a partial Matrix-only or AUX-only version.
