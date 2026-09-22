# HBNF SP803E AUX R3 — Codex commissioning runbook

Use this only after the SP803E, WS2811 underglow and the two UV loads are physically wired/powered and the user is physically available for unavoidable power/USB actions.

## Authority / target

- Do not modify or reflash the Matrix as part of aux commissioning.
- Matrix target: `hbnf-wow-r3-max-2026-09-21-v3`, engine `r3-wow-max`, witness `registry28-fixed-v3`, effects 220–247.
- Aux target: `hbnf-wow-aux-r3-2026-09-22-v1`, engine `aux-r3-wow-1d`, witness `registry28-fixed-1d-v1`.
- Aux firmware artifact must match the SHA recorded in `FINAL_METRICS.txt`.
- Visual master = Matrix. Audio master = Matrix.
- Underglow follows Matrix effect/speed/intensity/palette/colors/timebase. Its brightness is deliberately independent.
- UV main/short remain independent and unselected from visual sync.

## Hardware facts already re-verified

SP803E is ESP32-based, 5–24V, WLED-compatible, has USB-C serial auto-download, SPI DATA on IO16, PWM outputs IO25/26/27, and analog mic IO36. The selected underglow is 12V WS2811, 300 LEDs / 100 addressable pixels per 5 m roll; the cart run is approximately 6 ft, so final logical pixel count must be taken from the actual cut/config rather than guessed.

Primary references:
- https://manuals.plus/m/245a23d46a144f5dd57191af3805c7707991341e12e98462820509516550101f
- https://manuals.plus/shenzhen/sp803e-wi-fi-music-led-controller-manual
- https://github.com/wled/WLED/issues/5596

## Safe workflow

1. **Read-only discovery first.** Double-click `COMMISSION_HBNF_AUX.command` (preferred) or run:
   `python3 commission_operator.py --matrix 192.168.68.89 --backup`
   This verifies the frozen package, discovers WLED nodes, creates a timestamped aux backup when the target is unambiguous, and emits the exact next action. It does not mutate either controller.

2. Identify the SP803E unambiguously. If multiple non-Matrix WLED nodes appear, inspect IP/MAC/device info and do not guess.

3. Back up the SP803E before firmware/config changes:
   - `/json/cfg`
   - `/json/state`
   - `/presets.json`
   - current firmware/device info
   Store under a timestamped HBNF aux backup directory.

4. Verify the actual underglow logical pixel count from the installed/cut strip or existing SP803E bus config. Do not infer 36 vs 37 pixels from “~6 ft”.

5. Install the exact proven aux firmware. Prefer WLED OTA when the stock SP803E is healthy and reachable. If USB recovery is needed, use the SP803E USB-C serial auto-download path; preserve a backup and verify ESP32/4MB identity before writing.

6. After reboot, independently verify:
   - `HBNFAUX.release = hbnf-wow-aux-r3-2026-09-22-v1`
   - `engine = aux-r3-wow-1d`
   - `buildWitness = registry28-fixed-1d-v1`
   - `projection = fold2-1d-v1`
   - `fxRegistered=28`, `fxFailed=0`, `modeCount=248`, `fxFirst=220`, `fxLast=247`
   - `/json/eff[220:248]` matches the 28 Matrix scene names exactly.

7. Once the actual logical pixel count **and real strip color order** are known, generate the review-only hardware plan:
   `python3 generate_aux_hardware_plan.py --pixels <ACTUAL_LOGICAL_PIXELS> --order <GRB|RGB|BRG|RBG|BGR|GBR> --out HBNF_AUX_HARDWARE_PLAN.json`
   The generator is pinned to the exact WLED 16.0.1 config schema used by this firmware and sets `mutationIssued=false`. Review it before any `/json/cfg` or `/json/state` write; do not guess the color order.

   Configure physical outputs from the reviewed plan:
   - addressable WS2811 underglow: IO16, Segment 0, selected
   - UV main: single-color PWM IO25, unselected
   - UV short: single-color PWM IO26, unselected
   - IO27 remains spare
   - initial addressable underglow current limit <=900 mA
   Keep UV power budgeting separate from WLED's addressable-strip current estimator.

8. Configure sync with the guarded helper:
   `python3 local_commission.py --matrix 192.168.68.89 --aux <AUX_IP> --prepare-sync`
   This must refuse if exact Matrix/Aux runtime identity is not already proven.

9. Verify persistent sync config after reboot:
   - Matrix WLED sync SEND group 1
   - Matrix AudioReactive sync SEND, UDP 11988
   - Aux WLED sync RECEIVE group 1
   - Aux receive colors/effects/palette = on
   - Aux receive brightness = **off**
   - Aux receive segment options/bounds = **off**
   - Aux AudioReactive sync RECEIVE, UDP 11988
   - Aux MQTT device topic = `hbnf/cart/aux1`

10. Physical acceptance order: power/polarity/common ground → GPIO/output identity → <=900mA underglow limit → segment isolation → audio UDP receive → visual sync → UV main → UV short → full UV → sustained thermal test → mixed-load test.

11. Only after each physical acceptance item passes, update `public.hbnf_aux_commissioning_state`. Database constraints intentionally prevent enabling early. Base aux enablement and mixed-load acceptance are separate gates.

12. Final unified-cart acceptance requires:
   - exact Matrix R3 online
   - exact Aux R3 MQTT witness online/trusted
   - underglow follows every Matrix look without copying Matrix brightness
   - UV remains independently controllable
   - GLOW LIVE mixed-load gate passed
   - Watch/cart endpoints return success
   - cold boot retest passes.

Do not use the user as a manual QA loop for software-verifiable items. Ask only for unavoidable physical wiring/power/visual/thermal observations.

## Current preferred operator

Use `COMMISSION_HBNF_AUX.command` / `commission_guard.py` rather than manually chaining the older helpers. The old helpers remain packaged for audit and rollback support.

The guarded operator now provides the full local commissioning journey:

1. Discover Matrix/AUX using exact runtime signatures across the Mac's actual active IPv4 network(s), including wider masks such as the home `192.168.68.0/22`.
2. Verify package and create fresh backups.
3. Install the exact AUX firmware only onto a proven ESP32 / 4 MB non-Matrix target.
4. Ask for the installed logical WS2811 group count.
5. Apply a temporary <=300 mA RGB calibration bus and infer the strip color order from the user's three observed colors.
6. Apply the final <=900 mA underglow + GPIO25/26 UV plan with rollback.
7. Configure and verify Matrix visual/audio SEND → AUX RECEIVE sync with rollback.
8. Persist accepted real-world observations in `HBNF_AUX_ACCEPTANCE_EVIDENCE.json`. Reruns skip accepted stages.
9. Guide UV-main, UV-short, full-UV, representative mixed-load/thermal acceptance, cold boot and actual hotspot acceptance.
10. Match AUX MQTT to the current Matrix broker only after local acceptance, so PWA/Watch/cart control can use the existing production path.
11. Prepare the AUX course/hotspot Wi-Fi profile using a password entered with hidden terminal input; the password is never written to the report/evidence file.
12. When `physicalGateReady=true`, send the one evidence JSON to ChatGPT. ChatGPT reviews it and opens the guarded Supabase acceptance gates; the local package does not contain a service-role secret or a bypass around database safety.
13. Rerun the same launcher once after gate import. It performs final read-only release-doctor / full-PWA / Watch-contract / AUX-runtime / cart dry-run verification. Already accepted physical tests are not repeated.

### Commissioning state boundary

The physical Supabase columns remain authoritative:
`hardware_wired`, `power_verified`, `gpio_verified`, `current_limit_verified`, `segments_verified`, `audio_input_verified`, `udp_sync_verified`, `underglow_sync_verified`, `uv_main_verified`, `uv_short_verified`, `uv_full_verified`, `thermal_verified`, `mixed_load_verified`, then `aux_enabled`.

Do not set them from source/CI evidence. Only import them after the corresponding real observation exists in the acceptance evidence file.

### MQTT boundary

Local Matrix→AUX UDP visual/audio sync is independent of MQTT. Unified cloud/PWA/Watch control is not. During this rollout, AUX is deliberately matched to the same broker currently used by Matrix so the two-node product works as one system.

The current Matrix broker is still `broker.emqx.io`; this is retained for functional parity during commissioning, not declared production-grade. Release-doctor must continue surfacing `mqtt_public_test_broker` until Matrix + AUX are migrated together to an authenticated broker.

### Remaining unavoidable human inputs

The optimized workflow should require only:
- initial one-time WLED-AP join if a brand-new SP803E is not on the LAN yet;
- installed WS2811 logical group count;
- the three observed colors during calibration;
- YES/no visual/electrical/thermal confirmations that software cannot measure;
- field Wi-Fi password only if AUX does not already contain the Matrix's field profile;
- physical power cycle and real hotspot switch for those acceptance gates.

Do not ask the user to edit JSON, run GPIO commands, select firmware files manually, or repeat passed tests.
