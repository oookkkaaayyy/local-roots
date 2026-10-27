# HBNF AUX Commissioning — current UV release path

This directory commissions the Rogue Iron cart SP803E safely from stock WLED through the proven HBNF AUX firmware and the real 12V WS2811 underglow.

## Current hardware and baseline

- SP803E: ESP32, 5–24V controller.
- Underglow: 12V WS2811, DATA on GPIO16.
- The owner-confirmed physical integration review is PASS. The removable UV module is assembled and staged off-Cart, but disconnected and unpowered. The owner reports the unpowered meter checks complete. Loaded voltage/current, temperature, PWM response, combined-load behavior, and device readback remain for one combined field session. Do not repeat conceptual design review or assembly work.
- The owner confirms AUX V7 is installed and no later firmware was installed. Its exact recovery image is retained here as `HBNF_SP803E_AUX_V7_ROLLBACK.bin` (1,348,624 bytes; SHA-256 `c44298bb4b80a0e3d36d094f8270a1959708997571784803592e257ecdef054a`) with `AUX_V7_RECOVERY_MANIFEST.json`, and in the verified continuation bundle. V6 is historical, not the current rollback.
- **Owner-accepted network exposure:** unpaired clients on shared Cart Wi-Fi may access Matrix/AUX WLED JSON APIs without authentication. Raw API requests bypass Owner/Guest PWA visibility and command limits and may directly set supported WLED states/effects, including firmware-supported UV outputs. The Owner gateway authenticates only traffic sent through its HTTPS endpoints; it does not protect direct WLED access. This exposure has not been probed or blocked, and an isolation test is not a release-admission requirement by owner decision. No router/network changes are included.
- RIM/Cart and SHORT/Bar are intended for GPIO25 and GPIO26 respectively. Keep outputs and commissioning gates closed until the combined field session records actual operating limits and readbacks.

## Owner PWA baseline (separate from AUX firmware)

The latest recorded direct Opal readback is Owner PWA **v1.0.13**, with all 17 served assets reported matching its saved manifest (GitHub comment 6394889462). The exact v1.0.13 rollback is retained beside Owner PWA v1.0.14. The v1.0.14 ZIP SHA-256 is `6c393c5dde6dc78ea16823922c0c2717ccc4ae88dd5fa9e4047efb2e71044a17`; source inputs and package contents are independently checked in `UV_FIELD_SESSION.md`. It is staged, not installed. Its installer requires a fresh exact preflight of all 21 expected files and a durable transaction rollback readback; historical 17/17 served-file evidence is not a substitute for that current device check.

## Preferred entry point

Double-click `COMMISSION_HBNF_AUX.command`.

The launcher:
1. verifies the frozen package and target identity;
2. talks to local WLED devices without system/environment HTTP proxies;
3. saves a WLED configuration/state/preset snapshot before any permitted change (this is not a firmware image or rollback);
4. allows one AUX-only firmware attempt after the packaged run receipt matches the candidate, the exact V7 rollback is present, and a fresh device read matches the owner-confirmed current V7 release/build witness; the shared-Wi-Fi direct WLED exposure is source-recorded as owner-accepted, not tested or blocked;
5. allows AUX-only hardware phases when Matrix is offline; firmware OTA requires a separately admitted exact rollback;
6. calibrates the real WS2811 color order at low current;
7. applies a one-bus GPIO16 underglow plan with rollback and fail-dark boot;
8. requires Matrix only for Matrix→AUX visual/audio sync;
9. records underglow physical acceptance separately from the still-pending UV architecture.

The later UV-output configuration script now preserves the existing presets, saves the active underglow state with both UV outputs off in one unused WLED slot, selects that slot for boot, and verifies it after a second restart while the UV module is disconnected. Its rollback removes only the newly added slot and restores the old boot selection. `commission_guard.py --phase uv-field-preflight --aux 192.168.77.11` is read-only and requires that persisted safe-startup preset; it never energizes outputs or opens the UV gates. Neither operation has been run on Cart as part of this source change.

## Release receipt (mandatory after any future firmware install)

`RELEASE_RECEIPT.template.json` is incomplete by design. The build creates a candidate-bound copy with the exact Git commit, workflow run, toolchain, pinned input hashes, and firmware filename/size/SHA-256. It cannot be treated as an installation receipt.

After a future install, complete `RELEASE_RECEIPT.json` using actual pre-install and post-install firmware readbacks. Include the exact rollback image, its durable location, and a downloaded copy; the validator hashes both copies against the installed pre-state. Upload the completed receipt to the durable evidence location, download it again to `durable_receipt_readback_path`, and keep that byte-identical readback with the evidence files. Do not include credentials or secrets.

Validate from the evidence directory with:

```sh
python3 commission_guard.py --phase validate-release-receipt --release-receipt RELEASE_RECEIPT.json
```

Exit 0 means the receipt, candidate, installed-before image, exact rollback, post-install image/readback, and durable readbacks match. The Desktop commission report is diagnostic output only; an HTTP OTA response or WLED identity check alone is not release success. `physical_uv: NOT_CHECKED` remains explicitly not accepted.

## Current baseline and staged output-capable candidate

- **Installed baseline (owner-confirmed):** AUX V7 image `HBNF_SP803E_AUX_V7_ROLLBACK.bin`, 1,348,624 bytes, SHA-256 `c44298bb4b80a0e3d36d094f8270a1959708997571784803592e257ecdef054a`. This exact image is the firmware rollback; the owner reports that no later firmware has been installed.
- **Candidate (not installed):** the latest source-bound Actions package is identified by its exact run, source, package, and firmware hashes in `UV_FIELD_SESSION.md`. The prior run 40399701154 remains historical and is not the current package candidate.

The current exact-source compile, clean rebuild, commissioning checks, package verification, and independent ZIP/readback results are recorded in `UV_FIELD_SESSION.md`. Release disposition remains **REVIEW_ONLY** until fresh same-target V7 identity/baseline checks and release admission pass. Direct WLED exposure is explicitly owner-accepted; no isolation observation is claimed or required. The exact V7 firmware rollback, install transaction, and durable receipt remain mandatory. Opal/database activation and physical UV acceptance stay closed until powered channel checks pass. Follow `UV_FIELD_SESSION.md` for the current candidate identity and controlled install/receipt steps.

The build workflow adds the retained V7 rollback image and manifest from the exact source commit, verifies both against the recorded V7 identity and hash, and binds them into the candidate package. No expired V6 Actions artifact is needed. Admission is `REVIEW_ONLY` pending the fresh target preflight and install transaction; the owner-accepted direct WLED exposure is encoded in the source-bound admission. Do not use `--no-backup` for a firmware install.

## Safety boundary

The physical integration review for the staged module is accepted; do not repeat the conceptual compatibility review or assembly checks. A UV output-capable firmware image can be installed only after the direct-WLED network boundary passes its separate field check. Its Owner/Opal/database activation gates remain closed until one field session verifies loaded voltage/current, thermal behavior, PWM response, both channels and their mapping, combined load, and physical OFF behavior, then records device readback and release receipt. The module remains disconnected and unpowered until that session. These are commissioning acceptance gates, not a reason to reopen the accepted design review.
