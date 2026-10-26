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

## Proven firmware

- Release: `hbnf-wow-aux-r3-2026-10-25-uv-follow-v1`
- Engine/witness: `aux-r3-wow-1d` / `registry28-tempo-lock-1d-v7-network-no-starve-uv-follow`
- Projection: `fold2-1d-v1`
- Effects: fixed IDs 220–247
- Current V7 baseline SHA-256: `c44298bb4b80a0e3d36d094f8270a1959708997571784803592e257ecdef054a` (1,348,624 bytes). This is the owner-confirmed installed firmware and exact rollback image; do not treat the historical “Proven firmware” block below as the UV candidate.

The latest output-capable candidate is Actions run `40399701154`, source commit `4c0962628237b4c6c355d313ab9683414eba9961`; commissioning ZIP SHA-256 `9dd7fb0aeee7506ffe115e5c0f1558b7830aded86f7737152c9d35ef2e8d83e4`; firmware SHA-256 `94afbf7af2dd672952e95978841cf28ff49bb10c6d209fd852fe651c66f7ab29` (1,348,736 bytes). The exact package and external hash pointer are retained on private branch `hbnf-aux-r3-artifact-run-40399701154-attempt-1`. The package includes the exact owner-confirmed V7 rollback. Exact-source compile, clean rebuild, commissioning checks, package verification, and independent ZIP/readback checks passed. It remains **REVIEW_ONLY** until fresh same-target preflight and an unpaired Cart-Wi-Fi client cannot reach WLED `/json/info`. The Opal and database activation gates stay closed until powered channel and physical acceptance passes. Follow `UV_FIELD_SESSION.md` for the install steps and exact hashes. The embedded receipt alone cannot prove where the ZIP came from; keep the named run branch pointer beside the ZIP. The installer saves one local pre-install settings/state snapshot with owner-only file permissions; it is not a firmware rollback.

The build workflow adds the retained V7 rollback image and manifest from the exact source commit, verifies both against the recorded V7 identity and hash, and binds them into the candidate package. No expired V6 Actions artifact is needed. Admission is `REVIEW_ONLY` because the network isolation observation and fresh target preflight are field checks, not because the V7 baseline or rollback is missing. Do not use `--no-backup` for a firmware install.

## Safety boundary

The physical integration review for the staged module is accepted; do not repeat the conceptual compatibility review or assembly checks. A UV output-capable firmware image can be installed only after the direct-WLED network boundary passes its separate field check. Its Owner/Opal/database activation gates remain closed until one field session verifies loaded voltage/current, thermal behavior, PWM response, both channels and their mapping, combined load, and physical OFF behavior, then records device readback and release receipt. The module remains disconnected and unpowered until that session. These are commissioning acceptance gates, not a reason to reopen the accepted design review.
