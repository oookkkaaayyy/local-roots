# Paste-Ready Codex Prompt — HBNF Coordinated Firmware Reconciliation

You are working locally on Andrew's Mac. This is a READ/BUILD task first, not a flash/deploy task.

## Non-negotiable starting point
Use the exact accepted Audio V1.1 lineage identified by:
- accepted candidate SHA-256: 0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61
- accepted release: hbnf-matrix-v1-1-current-20260930
- accepted HBNF candidate: hbnf-integrated-rc-visual-audio-continuity-2026-09-30
- WLED 16.0.1
- PlatformIO environment: hbnf_matrix_wled16_max

First read:
- work/HBNF_FIRMWARE_COORDINATED_CONTRACT.md
- work/HBNF_SOURCE_IDENTITY_RECOVERY.md
- config/HBNF_COORDINATED_RELEASE_GATES.json
- config/HBNF_COORDINATED_CANDIDATE_MANIFEST.json
- evidence/live-production-20261001/MANIFEST.json
- staging/coordinated-backend/hbnf-matrix-adapter-foundation/index.ts

Also read the local source-identity output at:
/tmp/HBNF_LOCAL_PREFLIGHT.json

## Stop before editing if source identity is not proven
Require:
- accepted V1.1 BIN exists and hashes exactly to 0aeb668e...
- rollback BIN exists and hashes exactly to 32802f...
- source-identity collector identifies the build/source tree used for V1.1
- current HBNF usermod/local UI source is present
Do not guess a lineage.

## Preserve accepted behavior
Do not redesign the visual/audio engine.
Do not create a second FFT.
Do not change the continuous animation clock.
Do not reset oscillator phase/time from audio.
Do not change the accepted 28-effect show behavior except where required for the new control contract.
Do not change Matrix/AUX geometry:
- Matrix 512 LEDs
- Companion id1 start512 stop534
- fx142
Do not change network configuration.
Do not flash hardware.

## Implement exactly these coordinated additions
### 1. HBNF canonical palette contract
Accept optional HBNF.palette from the existing JSON state path.

Supported forms:
- {"mode":"wled","index":0..255}
- {"mode":"solid","rgb":[R,G,B]}
- {"mode":"legacy","id":"hbnf-balanced|copper|ocean"}

Rules:
- palette/color changes color source only
- do not alter animation phase, global tempo, Motion, Audio Response, Matrix brightness, AUX brightness, effect scheduling, or DDP geometry
- apply the same color direction to Matrix and AUX
- legacy mode preserves accepted current color behavior; do not invent mappings

### 2. HBNF canonical overlay contract
Accept optional HBNF.overlay.

Text:
{"id":"...","kind":"text","ttlMs":8000,"text":"...","color":"#RRGGBB"}

Scoreboard:
{"id":"...","kind":"scoreboard","ttlMs":22000,"label":"...","entries":["NAME -2","NAME E"]}

Rules:
- new id starts timer
- same id is idempotent and MUST NOT restart timer
- Matrix-only exclusive overlay on opaque black Matrix background
- AUX continues current base visual/color/brightness
- base Matrix animation clock keeps running underneath
- base-state updates received during overlay immediately update CURRENT hidden base state
- expiry renders CURRENT base, never a stale pre-overlay snapshot
- OFF clears overlay immediately
- replacement id preempts cleanly
- invalid overlay fails closed to base rendering; no reboot/crash
- text max 63 characters
- scoreboard max 12 entries

Reuse the proven existing 32×16 text/scoreboard rendering ideas where practical, but adapt them to the local V1.1 firmware so the cloud browser does not directly own device state.

### 3. /hbnf coordinated local UI
Reconcile the staged coordinated controller into the exact local UI source:
- hbnf-final-controller/hbnf-cart.html
- hbnf-final-controller/hbnf-cart.js
- hbnf-final-controller/hbnf-cart-semantic.mjs
- hbnf-final-controller/hbnf-cart-ui-v6.css
- hbnf-final-controller/hbnf-cart-ui-v6.mjs
- hbnf-final-controller/hbnf-cart-features.mjs

Requirements:
- iPad mini 2 / iOS 12 safe
- no direct browser POST /json/state for base-state mutation
- base show/palette/color writes use canonical cart backend
- live data uses canonical cart backend live_status
- local /json/pal and /json/info remain read-only helpers
- existing no-login paired-device behavior stays intact
- Motion and Audio Response stay intact

### 4. Build identity endpoint
Add read-only /hbnf/build.json per work/HBNF_FIRMWARE_COORDINATED_CONTRACT.md.
It must state:
- schema hbnf-build-v1
- candidate id
- basedOnReleaseId hbnf-matrix-v1-1-current-20260930
- basedOnFirmwareSha256 0aeb668e...
- WLED 16.0.1
- features canonical-palette-v1, canonical-overlay-v1, coordinated-ui-v1

## Tests before producing candidate
Run all existing V1.1 visual/audio tests plus new tests for:
- palette does not alter brightness/motion/audio/phase
- solid color does not alter brightness/motion/audio/phase
- overlay idempotency
- overlay replacement
- overlay OFF preemption
- overlay expiry restores CURRENT changed-under-overlay base state
- AUX remains base visual during Matrix overlay
- malformed overlay/palette fails closed
- /hbnf/build.json exact baseline lineage
- full iOS-12 static/browser syntax constraints
- complete controller package presence
- existing Motion / Audio Response / reconnect contracts

Run PlatformIO build for hbnf_matrix_wled16_max.
DO NOT FLASH.

## Output
Create one candidate output directory with:
- firmware candidate BIN
- SHA256SUMS
- REPORT.md
- exact source diff/patch from accepted V1.1 source
- build environment/commit/worktree identity
- test results
- /hbnf UI payload/source
- rollback reference to accepted V1.1 BIN
- no private keys/tokens

The report must explicitly say whether every acceptance invariant passed.

When finished, return only:
1. PASS or BLOCKED
2. exact candidate BIN path
3. candidate SHA-256
4. source root + Git identity if applicable
5. tests run/pass counts
6. any blocker
7. confirm: NO FLASH / NO DEPLOY occurred
