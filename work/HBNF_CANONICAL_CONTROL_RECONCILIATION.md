# HBNF Canonical Control Reconciliation

## Non-negotiable ownership
Production UI mutations must have one cart state owner. The coordinated controller must not POST directly to WLED state or call legacy hbnf-matrix-control for base-state mutations.

Canonical mutation path:
UI → hbnf-cart-control → desired state → reconciler → Matrix/AUX adapters → legacy lower-level drivers as internal adapter transport.

Read-only exceptions:
- local /json/pal palette-name discovery
- local /json/info identity/readiness
- legacy live_status read-only query until live-data is moved behind the canonical facade
- Opal signed update check/result

## Recovered canonical evidence
Historical matched-release commit:
f9edf096edd7ca0076985af28eace5ee50c67317

At that commit:
- hbnf-cart-control source blob ed2cc3c3645fc631056295d2f470aa9ae894f1f9
- hbnf-matrix-adapter source blob 4fdb299156c2ef09856c8a4348eb42b90a7c5ed1
- cart-control supports SCENE and PALETTE canonical command types
- Matrix adapter validates paletteId in the projection but historically does not actuate paletteId
- Matrix adapter internally delegates visual actuation to hbnf-matrix-control

Known historical deployed hashes:
- hbnf-cart-control EZBR c75098100a76e4b342ec9c6b95167bba5cc332eb347c55a929a1bc567244d075
- hbnf-matrix-adapter EZBR f864e18b93e52ec67f5a7276615eac0c27e71d9467721afa773b6b815e531c8e

Later no-login/paired-device cart-control source must be recovered before any canonical backend deployment. Current known function identity from project records:
- hbnf-cart-control v9 function id 95df7773-e888-48c9-84b3-ceb517c901c7
- local recovery workspace /Users/andrew/Documents/Codex/2026-09-27/hbnf-foundation-v1-consolidate-to-one/local-roots
- branch recorded for that workspace: hbnf-foundation-v1-live-fixes-20260928

Do not redeploy the older authenticated v1 source over the later no-login/paired-device backend.

## Coordinated controller correction already staged
- hbnf-cart.js exposes window.HBNFCanonical.command(type,payload).
- Show and palette mutations in hbnf-cart-features.mjs now use that canonical bridge.
- Direct POST /json/state mutation was removed from the feature module.
- Legacy hbnf-matrix-control is restricted there to read-only live_status.
- Text/scoreboard/ace-pot mutation buttons fail closed until a canonical overlay bridge is recovered/implemented.

## Palette actuator gap and staged solution
The historical canonical reducer already owns paletteId. The historical Matrix adapter failed to project it.

Pure projection contract now staged:
hbnf-cart-core/domain/palette-projection.mjs

Supported new canonical palette IDs:
- wled-<0..255> → preserve current effect/speed/intensity; change only WLED palette
- solid-<RRGGBB> → preserve current effect/speed/intensity; use palette 0 + primary color

Historical symbolic IDs hbnf-balanced/copper/ocean are recognized as legacy only; no invented mapping is allowed.

Before deployment, the recovered current Matrix adapter must import/equivalently implement this contract, freshly confirm the lower effect action, and read back palette/color. Adapter failure must remain visible as desired/observed divergence rather than silently mutating desired state.

## Overlay gap
Manual text, scoreboard, and ace-pot overlays must not call legacy Matrix control directly from the browser.

Required final path:
UI → canonical overlay facade/lease → Matrix adapter → existing lower overlay renderer.

Overlay expiry must recompute from CURRENT canonical state, not restore a pre-overlay stale snapshot.

Until the exact current no-login canonical backend source is recovered and this route is implemented, overlay buttons remain disabled in staged UI.

## Production gate
Do not mark singleCanonicalWriterReconciled, canonicalPaletteAdapterReconciled, or canonicalOverlayBridgeReconciled true until exact current backend source is recovered, source tests pass, and deployment identity is verified.


## 2026-10-01 exact live recovery update
Current production backend source is no longer inferred from history. It was read directly from Supabase and captured under:
`evidence/live-production-20261001/`

Current exact production versions:
- hbnf-cart-control v16 · EZBR 3e4816988a9ac0b33f5b660ccefedf27e0249c7e7f5e11b1a8622a3c59fbd80d
- hbnf-cart-reconcile v11 · EZBR 4f400b2ee1d733f07a90baa231c843990802a3a72aedb507e6963a78685a1d93
- hbnf-matrix-adapter-foundation v2 · EZBR 4925765bdad4726e3eda85d1d781813c783c64d2d425f0aafe572bf918fbcdb1
- hbnf-aux-adapter v8 · EZBR 85e8b8c18ee0cf4c31d5fd854d8cc0d41cc7e75fccc538c8271a866d78466fd8
- hbnf-matrix-control v172 · EZBR f49d087a3a6a77b2167d9892817f3dfcf36960cdb42fbb93e835f3c130c80aa7

The live reconciler is already on the Foundation architecture:
- Matrix is the only cloud-actuated visual device.
- AUX is recorded as Matrix-owned DDP proxy state.
- hbnf-cart-reconcile invokes hbnf-matrix-adapter-foundation.
- The Foundation adapter sends fx 142 on Matrix segment 0 and Companion segment 1 (512–533).
- The live cart-control already supports PALETTE desired state and TUNE; the live Foundation adapter does not yet project paletteId.
- The live reconciler already passes active overlay intent from canonical state, but live cart-control cannot yet create overlay intents and the live Foundation adapter does not yet project them.

Therefore the smallest coordinated backend delta is now fixed:
1. hbnf-cart-control v16 base → add canonical OVERLAY_START/OVERLAY_EXPIRE + capability advertisement.
2. hbnf-matrix-adapter-foundation v2 base → pass normalized palette + overlay contract to firmware.
3. Keep hbnf-cart-reconcile v11 unchanged.
4. Keep hbnf-aux-adapter v8 unchanged.
5. Keep hbnf-matrix-control v172 unchanged as legacy/internal/read-only support only; the new UI does not use it for base-state mutation.

Candidate sources are staged under:
`staging/coordinated-backend/`

Production deployment remains blocked until the accepted V1.1 firmware source is recovered and implements `work/HBNF_FIRMWARE_COORDINATED_CONTRACT.md`.
