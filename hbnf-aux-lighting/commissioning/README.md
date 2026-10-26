# HBNF AUX Commissioning — current UV release path

This directory commissions the Rogue Iron cart SP803E safely from stock WLED through the proven HBNF AUX firmware and the real 12V WS2811 underglow.

## Current hardware and baseline

- SP803E: ESP32, 5–24V controller.
- Underglow: 12V WS2811, DATA on GPIO16.
- The owner-confirmed physical integration review is PASS. The removable UV module is assembled and staged off-Cart, but disconnected and unpowered. The owner reports the unpowered meter checks complete. Loaded voltage/current, temperature, PWM response, combined-load behavior, and device readback remain for one combined field session. Do not repeat conceptual design review or assembly work.
- The owner confirms AUX V7 is installed and no later firmware was installed. Its exact recovery image is retained here as `HBNF_SP803E_AUX_V7_ROLLBACK.bin` (1,348,624 bytes; SHA-256 `c44298bb4b80a0e3d36d094f8270a1959708997571784803592e257ecdef054a`) with `AUX_V7_RECOVERY_MANIFEST.json`, and in the verified continuation bundle. V6 is historical, not the current rollback.
- RIM/Cart and SHORT/Bar are intended for GPIO25 and GPIO26 respectively. Keep outputs and commissioning gates closed until the combined field session records actual operating limits and readbacks.

## Owner PWA baseline (separate from AUX firmware)

The latest recorded direct Opal readback is Owner PWA **v1.0.13**, with all 17 served assets reported matching its saved manifest (GitHub comment 6394889462). The exact v1.0.13 rollback is retained beside Owner PWA v1.0.14. The v1.0.14 ZIP SHA-256 is `6c393c5dde6dc78ea16823922c0c2717ccc4ae88dd5fa9e4047efb2e71044a17`; source inputs and package contents are independently checked in `UV_FIELD_SESSION.md`. It is staged, not installed. Its installer requires a fresh exact preflight of all 21 expected files and a durable transaction rollback readback; historical 17/17 served-file evidence is not a substitute for that current device check.

## Preferred entry point

Double-click `COMMISSION_HBNF_AUX.command`.

The launcher:
1. verifies the frozen package and target identity;
2. talks to local WLED devices without system/environment HTTP proxies;
3. saves a WLED configuration/state/preset snapshot before any permitted change (this is not a firmware image or rollback);
4. allows one AUX-only firmware attempt after the packaged run receipt matches the candidate, the exact V7 rollback is present, and a fresh device read matches the owner-confirmed current V7 release/build witness; output-capable UV candidates also require fresh same-target evidence that an unpaired Cart-Wi-Fi client cannot reach WLED `/json/info`;
5. allows AUX-only hardware phases when Matrix is offline; firmware OTA requires a separately admitted exact rollback;
6. calibrates the real WS2811 color order at low current;
7. applies a one-bus GPIO16 underglow plan with rollback and fail-dark boot;
8. requires Matrix only for Matrix→AUX visual/audio sync;
9. records underglow physical acceptance separately from the still-pending UV architecture.

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
- **Candidate (not installed):** Actions run `40399701154`, attempt 1; source commit `4c0962628237b4c6c355d313ab9683414eba9961`; commissioning ZIP SHA-256 `9dd7fb0aeee7506ffe115e5c0f1558b7830aded86f7737152c9d35ef2e8d83e4` (2,061,469 bytes); firmware SHA-256 `94afbf7af2dd672952e95978841cf28ff49bb10c6d209fd852fe651c66f7ab29` (1,348,736 bytes). The ZIP and external hash pointer are retained together on private branch `hbnf-aux-r3-artifact-run-40399701154-attempt-1`; the package carries the exact V7 rollback image and manifest.

Exact-source compile, clean rebuild, commissioning checks, package verification, and independent ZIP/readback checks passed. Release disposition remains **REVIEW_ONLY** until fresh same-target preflight passes and an unpaired Cart-Wi-Fi client is confirmed unable to reach WLED `/json/info`. Do not install before those gates pass. Opal and database activation remain closed until powered channel and physical acceptance pass. Follow `UV_FIELD_SESSION.md` for the controlled install and receipt steps. The installer’s local settings/state snapshot is not a firmware rollback.

The build workflow adds the retained V7 rollback image and manifest from the exact source commit, verifies both against the recorded V7 identity and hash, and binds them into the candidate package. No expired V6 Actions artifact is needed. Admission is `REVIEW_ONLY` because the network isolation observation and fresh target preflight are field checks, not because the V7 baseline or rollback is missing. Do not use `--no-backup` for a firmware install.

## Safety boundary

The physical integration review for the staged module is accepted; do not repeat the conceptual compatibility review or assembly checks. A UV output-capable firmware image can be installed only after the direct-WLED network boundary passes its separate field check. Its Owner/Opal/database activation gates remain closed until one field session verifies loaded voltage/current, thermal behavior, PWM response, both channels and their mapping, combined load, and physical OFF behavior, then records device readback and release receipt. The module remains disconnected and unpowered until that session. These are commissioning acceptance gates, not a reason to reopen the accepted design review.
