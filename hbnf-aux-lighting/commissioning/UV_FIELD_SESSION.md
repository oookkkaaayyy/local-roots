# UV integration field session

## Current decision: keep both UV channels off

The installed UV load is documented as **5V USB**. The SP803E and its WS2811 underglow path are documented as **12V**. The existing runbook forbids connecting the UV load to SP803E 12V VCC/PWM, and keeps GPIO25/26/27 unused. No verified separate 5V switching interface, fuse rating, driver model/rating, supply identity, or UV output mapping is in the repository. Do not connect, configure, energize, or send UV commands until those facts are verified.

## Existing source paths (read-only audit)

- The Matrix PWA's Main/Short sliders use `POST hbnf-aux-control` with `action: "uv_policy"`, per-channel brightness, and fresh Matrix/WOW samples when a follow mode is selected. The endpoint can use the existing AUX MQTT request path only when the server-side 5V hardware profile is completed and verified, `HBNF_UV_ENABLED=true`, the global AUX gate is enabled, and wiring/power/GPIO/current/segment commissioning flags pass. The checked-in profile is deliberately incomplete (`verified:false`, no driver/fuse/current/channel facts) and the UV gate defaults false, so requests currently return HTTP 409, `mutationIssued:false`, zero output, and never publish.
- The older buttons call `POST hbnf-aux-control` with `action: "uv"` and `mode: "full" | "main" | "short" | "off"`. They now use the same server-side profile and gates and cannot bypass them. Their dry-run payload describes WLED segment 1 as Main and segment 2 as Short, while segment 0 is underglow. These remain software assumptions, not field-verified wiring.
- The prepared Watch API maps `uv_main`/`uv_short` to that same guarded AUX action. It is not a separate UV transport.
- Policy modes are Manual, Follow Matrix, Follow WOW audio, and Off. Main/Short levels are independent; follow modes share the sampled response envelope. This logic does not establish an electrical output path.

## One owner-supervised physical verification

The owner reports that the hardware is assembled and is ready to verify it in place. That is enough to schedule one short supervised session; it is not proof that the electrical path, pin mapping, fail-dark behavior, or UV exposure is safe. No photo is required.

With power off and both UV loads disconnected, the owner and operator compare the assembled path with its existing part records and verify in place:

1. The UV strip's input voltage/current and the actual 5V supply rating.
2. The exact switching module and its isolation, 5V output, 3.3V-compatible control input, total/per-channel current limits, fuse, and wire ratings against the strip load.
3. That the 5V UV supply is separate from the SP803E's 12V supply, with no path that can backfeed 12V into the strip or 5V into the controller supply.
4. The installed SP803E revision, WLED output allocation, and which physical output drives each UV channel. GPIO25/Main and GPIO26/Short with WLED segments 1/2 are source candidates only; the candidate contract currently has no verified segment IDs. Confirm actual mapping from the installed device before binding any profile.
5. The strip wavelength and placement/exposure review from its existing product record or measurement. Do not energize an unidentified UV source or any exposed UVC source.

Record the exact part identities, ratings, wiring/output mapping, and pass/fail observations in the existing commissioning record. If a value cannot be verified from the actual part markings, its manufacturer data, or a measurement, keep both loads disconnected and the UV profile/gates off. Do not infer galvanic isolation, current capacity, pin mapping, or UV safety from the fact that the assembly is complete. No production setting, AUX enable, or UV enable has been changed.

The success response reports MQTT QoS 1 broker acceptance only (`deviceReadback:false`). It does not claim physical output acknowledgment; the field procedure must verify actual per-channel load behavior/readback before accepting the UV channel gates.

## Known Cart/AUX baseline

- Existing AUX underglow: SP803E, GPIO16, WLED segment 0, 12V WS2811; commissioning current cap is at most 900 mA and its boot default is off.
- UV candidates in source only: Main GPIO25 / WLED segment 1; Short GPIO26 / WLED segment 2; GPIO27 remains spare. None is configured or physically verified for the 5V UV strip.
- AUX enable and mixed-load acceptance remain false. Do not change them for this session.
- Matrix audio is documented as master; AUX receives AudioReactive UDP Sound Sync on port 11988. That synchronizes the existing AUX engine but does not itself provide safe 5V UV switching.

## One consolidated low-output commissioning session

Only continue after the in-person checks above pass, the UV server profile is bound to the measured hardware and actual output mapping, an exact source-bound package/rollback is retained, and real device readback is available. The checked-in candidate currently satisfies none of the hardware-profile gates and stays preview-only.

1. Confirm both channels OFF at idle and through AUX cold boot/reboot; confirm the separate 12V underglow still works.
2. At the lowest controlled output, test Main alone; verify the physical channel, supply voltage/current/temperature, and device readback. Turn it OFF, confirm readback, then repeat for Short alone.
3. Check independent slider levels, then Follow Matrix and Follow WOW audio with each channel's own brightness cap.
4. Interrupt the source/network and verify stale/offline feedback and both UV outputs fail dark. Restore it, confirm fresh readback, and finish with both channels OFF.

Stop immediately for unexpected current, voltage, heating, cross-channel activation, missing/stale acknowledgment, or any state not confirmed OFF. Do not alter router configuration or flash Matrix firmware as part of UV commissioning.
