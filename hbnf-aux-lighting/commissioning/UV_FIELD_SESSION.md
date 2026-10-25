# UV integration field session

## Current decision: keep both UV channels off

The current hardware handoff documents Main/rim UV as **12V YGS-Tech 395–405nm**. The Short UV load's exact voltage/current and channel mapping remain unresolved; earlier records conflict. The SP803E and underglow path are 12V, but that alone does not prove its PWM outputs safe for either UV load. No verified switching path, fuse rating, driver model/rating, or UV output mapping is established in source. The fail-closed readiness check now requires separate load/supply voltage matches and per-channel supply, fuse, wire, and switch ratings; the unknown Short channel cannot pass. Do not connect, configure, energize, or send UV commands until those facts are verified.

## Existing source paths (read-only audit)

- The Matrix PWA's Main/Short sliders use `POST hbnf-aux-control` with `action: "uv_policy"` and per-channel brightness. The endpoint can publish only when a correctly voltage-matched per-load hardware profile is completed and verified, `HBNF_UV_ENABLED=true`, the global AUX gate is enabled, and wiring/power/GPIO/current/segment commissioning flags pass. The checked-in profile is deliberately incomplete (`verified:false`, no driver/fuse/current/channel facts) and the UV gate defaults false, so requests currently return HTTP 409, `mutationIssued:false`, zero output, and never publish.
- The compact Cart Control PWA exposes only independent Main/Short manual levels and Off through its paired-owner Cart endpoint. There is no supported fresh audio envelope in the Cart/AUX command contract today: Matrix AudioReactive UDP synchronizes the existing AUX renderer, but neither the PWA nor `hbnf-aux-control` receives a verified per-frame music level. `VIBE_REACTIVE` is therefore not exposed by this UI or proxy. Do not pass browser-supplied/stale brightness or vibe values as a substitute. Manual command code is source-prepared, while all output remains locked until the in-place checks and server-side profile/gates are accepted.
- The older buttons call `POST hbnf-aux-control` with `action: "uv"` and `mode: "full" | "main" | "short" | "off"`. They now use the same server-side profile and gates and cannot bypass them. Their dry-run payload describes WLED segment 1 as Main and segment 2 as Short, while segment 0 is underglow. These remain software assumptions, not field-verified wiring.
- The prepared Watch API maps `uv_main`/`uv_short` to that same guarded AUX action. It is not a separate UV transport.
- Policy modes are Manual, Follow Matrix, Follow WOW audio, and Off. Main/Short levels are independent; follow modes share the sampled response envelope. This logic does not establish an electrical output path.

## One owner-supervised physical verification

The owner reports that the hardware is assembled and is ready to verify it in place. That is enough to schedule one short supervised session; it is not proof that the electrical path, pin mapping, fail-dark behavior, or UV exposure is safe. No photo is required.

With power off and both UV loads disconnected, the owner and operator compare the assembled path with its existing part records and verify in place:

1. Each UV load's input voltage/current and its matching supply channel rating.
2. The exact switching module and its isolation, 5V output, 3.3V-compatible control input, total/per-channel current limits, fuse, and wire ratings against the strip load.
3. Whether the channels share or separate supply rails; verify there is no backfeed between any UV rail and the SP803E/controller supply.
4. The installed SP803E revision, WLED output allocation, and which physical output drives each UV channel. GPIO25/Main and GPIO26/Short with WLED segments 1/2 are source candidates only; the candidate contract currently has no verified segment IDs. Confirm actual mapping from the installed device before binding any profile.
5. The strip wavelength and placement/exposure review from its existing product record or measurement. Do not energize an unidentified UV source or any exposed UVC source.

Record the exact part identities, ratings, wiring/output mapping, and pass/fail observations in the existing commissioning record. If a value cannot be verified from the actual part markings, its manufacturer data, or a measurement, keep both loads disconnected and the UV profile/gates off. Do not infer galvanic isolation, current capacity, pin mapping, or UV safety from the fact that the assembly is complete. No production setting, AUX enable, or UV enable has been changed.

The success response reports MQTT QoS 1 broker acceptance only (`deviceReadback:false`). It does not claim physical output acknowledgment; the field procedure must verify actual per-channel load behavior/readback before accepting the UV channel gates. The server also requires the existing UV-specific `uv_main_verified`, `uv_short_verified`, `uv_full_verified`, `thermal_verified`, and `mixed_load_verified` fields; the underglow-only commissioning flags cannot unlock UV by themselves.

## Known Cart/AUX baseline

- Existing AUX underglow: SP803E, GPIO16, WLED segment 0, 12V WS2811; commissioning current cap is at most 900 mA and its boot default is off.
- UV candidates in source only: Main GPIO25 / WLED segment 1; Short GPIO26 / WLED segment 2; GPIO27 remains spare. These mappings are not physically verified; Main's documented 12V rating and Short's unresolved rating require per-load matching checks.
- AUX enable and mixed-load acceptance remain false. Do not change them for this session.
- Matrix audio is documented as master; AUX receives AudioReactive UDP Sound Sync on port 11988. That synchronizes the existing AUX engine but does not itself provide a safe UV load path.

## Source-level Matrix audio reuse audit (2026-10-25)

The no-live-HTTP-sample finding does **not** make local rhythm follow infeasible. The existing AUX source path already receives Matrix AudioReactive UDP on port 11988. In the exact WLED 0.16.1 build source pinned by `.github/workflows/hbnf-sp803e-aux-r3-build.yml` (`29b389df1c1aaec6ff53aea742d17063b985906c`), valid packets copy `sampleSmth` into `volumeSmth`; the existing AUX ANIMartRIX audio bridge reads that same local AudioReactive usermod data. That makes local envelope reuse possible without browser polling, cloud sampling, another FFT, or per-frame network commands. The contracted receive configuration is Matrix SEND and AUX RECEIVE; AUX's GPIO36 mic remains disabled as a fallback.

One narrow source gap remains for safe fail-dark follow: WLED updates private `last_UDPTime` only after a valid UDP packet, but the current exported AudioReactive UMData array does not include that timestamp. The AUX build patch now exports it as UMData index 8 (`UMT_UINT32`), retaining the existing envelope at index 0. The pinned-build workflow runs `test_audio_sync_contract.py` against its exact reconstructed WLED source; this check proves the packet-to-envelope path, timestamp freshness source, existing local UMData consumer, and WLED's one-channel PWM bus implementation. A follow consumer must use a short, wrap-safe age check (fresh sample required) and emit zero immediately once stale. It must reuse the existing local usermod loop and must not add FFT or high-frequency network traffic.

This source proof does not establish output readiness. The current AUX runtime configuration is a single GPIO16 12V WS2811 bus; the documented 12V Main and unresolved Short load, switching path, GPIO25/26 assignment, and WLED PWM segments 1/2 remain unverified. The default-off hardware profile, `HBNF_UV_ENABLED` gate, and AUX commissioning gates remain in force. The patched AUX firmware binary compiled successfully twice and was byte-identical (SHA-256 `8dc96962bdbac9eecd93b75f60846193702328a41445a2fba2d88d8c5fd2ad8b`, 1,348,448 bytes); no installable commissioning package with matching rollback was assembled and no firmware was flashed. Before local follow can actuate anything, the field session must verify both loads' safe electrical ratings, channel-to-pin/segment mapping, stale-sync fail-dark behavior, and rollback. Until then this is a source-feasibility PASS and physical actuation NOT CHECKED; it is not a commissioned UV feature.

## One consolidated low-output commissioning session

Only continue after the in-person checks above pass, the UV server profile is bound to the measured hardware and actual output mapping, an exact source-bound package/rollback is retained, and real device readback is available. The checked-in candidate currently satisfies none of the hardware-profile gates and stays preview-only.

1. Confirm both channels OFF at idle and through AUX cold boot/reboot; confirm the 12V underglow still works.
2. At the lowest controlled output, test Main alone; verify the physical channel, supply voltage/current/temperature, and device readback. Turn it OFF, confirm readback, then repeat for Short alone.
3. Check independent slider levels, then Follow Matrix and Follow WOW audio with each channel's own brightness cap.
4. Interrupt the source/network and verify stale/offline feedback and both UV outputs fail dark. Restore it, confirm fresh readback, and finish with both channels OFF.

Stop immediately for unexpected current, voltage, heating, cross-channel activation, missing/stale acknowledgment, or any state not confirmed OFF. Do not alter router configuration or flash Matrix firmware as part of UV commissioning.
