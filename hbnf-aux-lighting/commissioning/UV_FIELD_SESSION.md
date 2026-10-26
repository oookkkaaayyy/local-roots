# HBNF Cart UV integration — current handoff (2026-10-26)

## Current status

- **Physical integration review: PASS**, as owner-confirmed from the dedicated UV physical-integration coordinator. Do not reopen that review, repeat hardware research, or ask the owner to locate or resend its report.
- The removable module is assembled and staged off-Cart. It remains disconnected from AUX and unpowered; no working Cart hardware was changed. The owner reports the unpowered meter checks are complete but supplied no numerical readings or receipt. Powered output, channel current, temperature, live PWM behavior, combined-load operation, and device acceptance remain for one combined field session.
- **Installed AUX baseline: V7, owner-confirmed current.** The owner confirms V7 was installed and nothing has been installed since. The exact retained V7 image is `HBNF_AUX_V7_KNOWN_IMAGE.bin`, SHA-256 `c44298bb4b80a0e3d36d094f8270a1959708997571784803592e257ecdef054a`, source `e78fc74c9470b0bafaf43ca6a2823f60f1a4b51e`, Actions run `40276725561`. Do not reopen baseline recovery.
- RIM/Cart is intended for PWM3/GPIO25 and SHORT/Bar for PWM2/GPIO26. The reported parts are a TOBSUN EA50-5V converter, two USB-A female adapters, shared fused 5V positive with inline 5A fuse, lever connectors, and a three-port ground junction with AUX ground reserved. These remain owner-reported connection details; the strips are not attached to AUX.

## Software already prepared

- UV firmware source commit `23c1d37f3db0d03421312ab986f61f92c3abe11d` adds local Matrix audio following. Fresh audio scales each strip by its own selected cap; stale audio falls back to that cap; zero cap and the firmware output gate remain dark. The local UV-enabled firmware is `HBNF_SP803E_AUX_R3_UV_ENABLED_STALE_AUDIO_FALLBACK_23c1d37_REVIEW_ONLY.bin`, SHA-256 `a4bdbd4f1e8f11e59c40627e7b291f230b2b1e112ebf144dc03a9585a6758d43`. Its clean build reproduced byte-for-byte; it has not been installed.
- Opal/PWA source commit `a7f8fcb399d07bf0757d966ca940ce3dc02a9b0c` adds a shared main-page UV slider, independent Cart and Bar fine-tuning, explicit Apply manual override / Follow Matrix / UV off actions, and an authenticated local UV route. Opening the page sends no UV command.
- A follow-up source change is closing the Opal route's readiness-policy gap: it shares the AUX hardware profile and checks the same runtime and commissioning gates before any WLED write. The candidate profile is default-off, records owner-reported assembly details separately, and leaves operational measurements/gates unverified. The package will remain non-installable until those gates are satisfied in the combined field session.
- The prior deterministic Opal v1.0.7 package remains at [v1.0.7](</Users/andrew/Documents/Codex/HBNF-OPAL-UV-GATEWAY-V1.0.7-20261026/hbnf-owner-local-control-v1.0.7.zip>), SHA-256 `11d5b5e2cd37067c1a3280bff1bbec70de60e79aded110401be7d2b21ed64255`. It is superseded for future use by the source work in progress and must not be installed.
- Source/route and deterministic package checks are being updated for v1.0.8. These checks establish code/package properties only, not live Opal, network-isolation, or device acceptance.

## Specific software work still possible offline

The source change now brings the Opal UV route under the same hardware profile and runtime/commissioning gates as `aux_control.ts`. Remaining source work is to finish focused tests and bind the full package to the exact resulting commit. A populated/accepted hardware profile and live gateway/network checks remain field gates; profile records and unit tests cannot substitute for them.

The Opal package also records that unpaired clients on the shared Cart Wi-Fi can reach WLED's unauthenticated API directly. Router/device network controls need a real negative access check on the Cart network; gateway authentication by itself does not block that path. This is separate from V7 recovery and does not invalidate the owner-accepted physical integration PASS.

## One combined field acceptance session

After the software gate is closed and Cart/Opal are present:

1. Use the retained V7 image as the rollback and record the exact install transaction; the owner-confirmed V7 baseline is not a recovery investigation.
2. Confirm the 5V rail and channel behavior at low output: Cart/RIM only, then Bar/SHORT only; record voltage, current, temperature, channel mapping, and device readback. Confirm underglow still works.
3. Exercise independent caps, shared slider, Follow Matrix with fresh and stale audio, manual levels without Matrix audio, and explicit zero/off. Confirm no unexpected channel activation and restore both strips to off at closeout.
4. Verify the gateway's unpaired-client boundary on the actual Cart network and confirm reconnect/readback.

Keep the release fail-closed until its named software, network, and device checks pass. Do not repeat the accepted physical-design review or ask for additional owner preparation while Cart and Opal are away.
