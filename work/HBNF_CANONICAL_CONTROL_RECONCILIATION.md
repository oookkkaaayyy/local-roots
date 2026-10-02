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
