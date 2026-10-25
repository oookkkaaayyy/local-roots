# UV integration field session

## Current decision: keep both UV channels off

The installed UV load is documented as **5V USB**. The SP803E and its WS2811 underglow path are documented as **12V**. The existing runbook forbids connecting the UV load to SP803E 12V VCC/PWM, and keeps GPIO25/26/27 unused. No verified separate 5V switching interface, fuse rating, driver model/rating, supply identity, or UV output mapping is in the repository. Do not connect, configure, energize, or send UV commands until those facts are verified.

## Existing source paths (read-only audit)

- The Matrix PWA's Main/Short sliders use `POST hbnf-aux-control` with `action: "uv_policy"`, per-channel brightness, and fresh Matrix/WOW samples when a follow mode is selected. The endpoint can use the existing AUX MQTT request path only when the server-side 5V hardware profile is completed and verified, `HBNF_UV_ENABLED=true`, the global AUX gate is enabled, and wiring/power/GPIO/current/segment commissioning flags pass. The checked-in profile is deliberately incomplete (`verified:false`, no driver/fuse/current/channel facts) and the UV gate defaults false, so requests currently return HTTP 409, `mutationIssued:false`, zero output, and never publish.
- The older buttons call `POST hbnf-aux-control` with `action: "uv"` and `mode: "full" | "main" | "short" | "off"`. They now use the same server-side profile and gates and cannot bypass them. Their dry-run payload describes WLED segment 1 as Main and segment 2 as Short, while segment 0 is underglow. These remain software assumptions, not field-verified wiring.
- The prepared Watch API maps `uv_main`/`uv_short` to that same guarded AUX action. It is not a separate UV transport.
- Policy modes are Manual, Follow Matrix, Follow WOW audio, and Off. Main/Short levels are independent; follow modes share the sampled response envelope. This logic does not establish an electrical output path.

## One physical proof needed before enabling the profile

With power **off** and UV disconnected, provide one clear photo of the assembled UV power/control path, framed so all of these are readable in the same image:

1. UV strip/module label and its input-voltage/current markings.
2. Exact 5V supply label and its output rating.
3. Separate **galvanically isolated** switching driver/module label, 5V output and 3.3V controller-input compatibility, total and per-channel current ratings, and both channel terminals.
4. Inline fuse and its rating.
5. Both channel wires from the driver to Main and Short, readable wire-gauge/current rating if marked, and the controller/control-wire connection.

If the wiring or labels cannot all be seen in one image, the path is not yet verified. Keep both UV loads disconnected. This is the only owner evidence requested before the server-side profile can be bound to a real output route. The photo can establish visible parts and routing; ratings, galvanic isolation, or wire ampacity not legible from it remain unverified and must not be inferred. No production setting, AUX enable, or UV enable has been changed.

The success response reports MQTT QoS 1 broker acceptance only (`deviceReadback:false`). It does not claim physical output acknowledgment; the field procedure must verify actual per-channel load behavior/readback before accepting the UV channel gates.

## Known Cart/AUX baseline

- Existing AUX underglow: SP803E, GPIO16, WLED segment 0, 12V WS2811; commissioning current cap is at most 900 mA and its boot default is off.
- UV candidates in source only: Main GPIO25 / WLED segment 1; Short GPIO26 / WLED segment 2; GPIO27 remains spare. None is configured or physically verified for the 5V UV strip.
- AUX enable and mixed-load acceptance remain false. Do not change them for this session.
- Matrix audio is documented as master; AUX receives AudioReactive UDP Sound Sync on port 11988. That synchronizes the existing AUX engine but does not itself provide safe 5V UV switching.

## After the path is verified and a guarded software route exists

Do not use UV commands until the power-off wiring proof is reviewed and the source profile is bound to the verified driver/channel mapping. Retain an exact rollback and prove the command acknowledgment/readback contract offline. Then conduct one supervised session:

1. Confirm both channels command OFF; verify no UV illumination/current at idle and on AUX cold boot/reboot. Verify underglow remains on its separate 12V path.
2. Enable only Main at the lowest supported nonzero level; verify the named Main load, output acknowledgment, supply voltage, measured current, and temperature. Turn it OFF and confirm readback.
3. Repeat for Short with Main OFF; then confirm independent slider changes affect only their named channel.
4. Set both OFF, reboot AUX, and confirm both remain OFF before enabling either.
5. Select Follow Matrix and verify each channel tracks the live brightness sample while respecting its own slider cap; select Follow WOW audio and verify both follow the existing Matrix audio envelope without changing the Matrix/AUX audio master or underglow behavior.
6. Interrupt the sample/network and confirm truthful stale/offline feedback and fail-dark UV outputs. Restore the connection, verify fresh readback and OFF state, then finish with both channels OFF.

Stop immediately for unexpected current, voltage, heating, cross-channel activation, missing/stale acknowledgment, or any state not confirmed OFF. Do not alter router configuration or flash Matrix firmware as part of UV commissioning.
