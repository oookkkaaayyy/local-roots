# HBNF Aux Commissioning — guarded underglow-first path

This directory commissions the Rogue Iron cart SP803E safely from stock WLED through the proven HBNF AUX firmware and the real 12V WS2811 underglow.

## Current hardware truth

- SP803E: ESP32, 5–24V controller.
- Underglow: 12V WS2811, DATA on GPIO16.
- Owner's 2026-10-25 hardware report identifies both current UV loads as iNextStation 5V USB-A strips: RIM/Main about 6–6.6 ft and SHORT about 12–13 in (a shortened strip). They remain standalone on power banks and are not connected to the SP803E or the off-Cart switching module. Voltage/model are owner-reported; current draw and channel mapping are unmeasured.
- Do not infer that the SP803E PWM outputs are a safe driver for either UV load. Verify each load's actual rating and switching path, including boot/restart OFF behavior, before use.
- GPIO25/26/27 remain unused until the exact channel mapping and electrical path are verified.

## Owner PWA baseline (separate from AUX firmware)

The latest direct Opal readback recorded for this work is Owner PWA **v1.0.13**, with all 17 served assets matching its saved manifest (GitHub #116 comment 6394889462). The pasted SSH transcript showing v1.0.12 is an older snapshot and is superseded; v1.0.12 is retained as the rollback package, not the current installed version. This PR changes AUX firmware/source and did not change the Owner PWA. Recheck the PWA version only after a later PWA installation or a newer direct runtime readback.

## Preferred entry point

Double-click `COMMISSION_HBNF_AUX.command`.

The launcher:
1. verifies the frozen package and target identity;
2. talks to local WLED devices without system/environment HTTP proxies;
3. saves a WLED configuration/state/preset snapshot before any permitted change (this is not a firmware image or rollback);
4. allows one AUX-only firmware attempt after the packaged run receipt matches the candidate, the exact V6 rollback is present, and a fresh device read matches the installed V6 identity;
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
- Firmware SHA-256: `178c070defcd080ce2acd3ef83acb9a8b31d2aebd4fa1ec1ad37fafd44191d0d`
- Firmware bytes: 1,348,784

The build workflow emits a source-bound review package and publishes the exact ZIP plus a separate hash pointer on a private branch named `hbnf-aux-r3-artifact-run-<run ID>-attempt-<attempt>`. Download both files from the same branch, extract the ZIP, replace the extracted `ARTIFACT_POINTER.json` with the separate branch copy, and keep the ZIP beside the extracted files. The installer verifies the sidecar hash, ZIP integrity, and every extracted file against the ZIP. A complete candidate package also carries the exact recovered V6 image and its recovery manifest. The original rollback artifact, manifest, and extracted firmware are retained in the private Drive recovery folder; their ZIP and firmware hashes were checked, the ZIP passed integrity validation, and the embedded firmware exactly matches the recorded installed V6 hash. The candidate remains **REVIEW ONLY** until the package and sidecar are retrieved from the named run branch and pre-install checks pass. The embedded receipt alone cannot prove where the ZIP came from. The installer saves one local pre-install settings/state snapshot with owner-only file permissions; it is not a firmware rollback.

To assemble the complete candidate-and-rollback ZIP from the exact build artifact, place the candidate files, `HBNF_SP803E_AUX_V6_ROLLBACK.bin`, and the exact `AUX_V6_RECOVERY_MANIFEST.json` in one temporary directory. Run `generate_release_admission.py` with the candidate firmware/metrics, the rollback image, manifest, and original verified workflow ZIP; then run `build_commissioning_distribution.py` on that directory. The generator verifies that the original ZIP contains the exact rollback bytes and matching installed-build identity. The generated admission stays `REVIEW_ONLY`; only the commissioning guard can allow the single OTA attempt, after the package has been obtained from the named Actions run and the live V6 device checks pass. Do not use `--no-backup` for a firmware install.

## Safety boundary

UV readiness remains closed until each load's voltage/current, switching path, channel mapping, protection, and physical OFF behavior are verified. It also requires the existing UV-specific Main, Short, full-load, thermal, and mixed-load commissioning checks; passing only the underglow setup no longer opens UV control. Both reported 5V strip ratings are recorded in source, but their currents and supply limits remain unmeasured. The SP803E manual documents direct wiring with the strip positive on VCC and says input voltage should match the strip. It does not establish whether the exact board's PWM FETs can safely sink an externally powered 5V strip while the controller runs at 12V. No public board schematic/topology confirmation was found; compatibility remains UNKNOWN. Amazon's current listing for proposed buck ASIN B0F1F71F2B identifies the 5V/5A (25W) option; the 10A option has a different ASIN, and the installed unit's continuous rating is not independently confirmed. Keep the proposed path disconnected until the exact return/common-ground behavior, ratings, backfeed behavior, and power budget are verified.
