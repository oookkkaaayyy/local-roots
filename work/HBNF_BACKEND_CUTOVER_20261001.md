# HBNF Coordinated Backend Cutover — Exact Two-Function Plan

Use only after the new Matrix firmware candidate has passed signed OTA reboot/health.

## Do not touch
Leave these exact live functions unchanged:
- hbnf-cart-reconcile v11 · 4f400b2ee1d733f07a90baa231c843990802a3a72aedb507e6963a78685a1d93
- hbnf-aux-adapter v8 · 85e8b8c18ee0cf4c31d5fd854d8cc0d41cc7e75fccc538c8271a866d78466fd8
- hbnf-matrix-control v172 · f49d087a3a6a77b2167d9892817f3dfcf36960cdb42fbb93e835f3c130c80aa7

Do not reseed cart_desired_state.
Do not reactivate or replace the already-active epoch-2 fence.

## Function 1 — hbnf-cart-control
Current live base:
- version 16
- verify_jwt=false
- EZBR 3e4816988a9ac0b33f5b660ccefedf27e0249c7e7f5e11b1a8622a3c59fbd80d
- exact rollback source: evidence/live-production-20261001/hbnf-cart-control/

Candidate:
- staging/coordinated-backend/hbnf-cart-control/index.ts
- staging/coordinated-backend/hbnf-cart-control/live.ts
- staging/coordinated-backend/hbnf-cart-control/deno.json
- keep verify_jwt=false because v16 implements the existing paired-device/custom-auth contract

Intended delta only:
- read-only live_status using the exact current chooseLive implementation
- OVERLAY_START / OVERLAY_EXPIRE canonical desired-state intents
- coordinated capability advertisement
- all existing pairing/TUNE/PALETTE behavior preserved

## Function 2 — hbnf-matrix-adapter-foundation
Current live base:
- version 2
- verify_jwt=true
- EZBR 4925765bdad4726e3eda85d1d781813c783c64d2d425f0aafe572bf918fbcdb1
- exact rollback source: evidence/live-production-20261001/hbnf-matrix-adapter-foundation/

Candidate:
- staging/coordinated-backend/hbnf-matrix-adapter-foundation/index.ts
- keep verify_jwt=true

Intended delta only:
- validate/normalize canonical paletteId into the HBNF firmware contract
- validate/normalize active canonical overlay into the HBNF firmware contract
- preserve Matrix segment0 fx142 and Companion segment1 start512 stop534 fx142
- preserve Matrix/AUX brightness contract and source-coupled AudioReactive behavior

## Cutover order
1. Verify live function versions/hashes still equal the bases above.
2. Verify Matrix candidate is healthy and /hbnf/build.json advertises canonical-palette-v1 + canonical-overlay-v1.
3. Deploy hbnf-matrix-adapter-foundation candidate first.
   - This is safe only after firmware understands the new optional HBNF fields.
4. Deploy hbnf-cart-control candidate second.
   - Existing controls remain available; capability advertisement unlocks the new palette/overlay UI only now.
5. Read canonical status; verify desired revision was not reset and fence remains epoch2 active.
6. Run one non-destructive live_status read.
7. Reload local /hbnf and confirm new feature controls unlock.
8. Continue the consolidated physical acceptance sequence.

## Rollback
If either backend deployment fails its immediate contract check:
1. Do not mutate desired state to compensate.
2. Redeploy the exact captured live source for the failed function using the original verify_jwt setting.
3. Verify the restored function EZBR/source behavior and current canonical status.
4. Leave the accepted/healthy Matrix firmware in place unless the failure proves a firmware contract defect.
5. If a firmware contract defect is proven, use the signed updater rollback path to accepted Audio V1.1.

No broad backend rollback is required when only one changed function fails.
