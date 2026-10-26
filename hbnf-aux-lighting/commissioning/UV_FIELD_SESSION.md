# HBNF Cart UV integration — current handoff (2026-10-26)

## Current status

- **Physical integration review: PASS**, as owner-confirmed from the dedicated UV physical-integration coordinator. Do not reopen that review, repeat hardware research, or ask the owner to locate or resend its report.
- The removable module is assembled and staged off-Cart. It remains disconnected from AUX and unpowered; no working Cart hardware was changed. The owner reports the unpowered meter checks are complete but supplied no numerical readings or receipt. Powered output, channel current, temperature, live PWM behavior, combined-load operation, and device acceptance remain for one combined field session.
- **Installed AUX baseline: V7, owner-confirmed current.** The owner confirms V7 was installed and nothing has been installed since. The exact retained V7 image is `HBNF_SP803E_AUX_V7_ROLLBACK.bin`, SHA-256 `c44298bb4b80a0e3d36d094f8270a1959708997571784803592e257ecdef054a`, source `e78fc74c9470b0bafaf43ca6a2823f60f1a4b51e`, Actions run `40276725561`. Do not reopen baseline recovery.
- RIM/Cart is intended for PWM3/GPIO25 and SHORT/Bar for PWM2/GPIO26. The reported parts are a TOBSUN EA50-5V converter, two USB-A female adapters, shared fused 5V positive with inline 5A fuse, lever connectors, and a three-port ground junction with AUX ground reserved. These remain owner-reported connection details; the strips are not attached to AUX.

## Software already prepared

- **Latest AUX build disposition (2026-10-26): do not install run 40373345832.** Its commissioning ZIP was built and verified from source `13214924cf62d2056ce54d0f7467c71bd85ea155`; ZIP SHA-256 `ef3a5b9ff471f67571ef0ea72c0514d06e65998b81a63c2c1879321875cd5e02`. The packaged `HBNF_SP803E_AUX_R3.bin` is 1,348,624 bytes and hashes to `c44298bb4b80a0e3d36d094f8270a1959708997571784803592e257ecdef054a`, byte-for-byte matching the retained V7 rollback image. The run passed compile/reproducibility/package checks, but this output is a duplicate of V7, has `UV_OUTPUTS_VERIFIED=NO`, and is marked `REVIEW_ONLY`; it adds no new firmware behavior. The verified ZIP is preserved on branch `hbnf-aux-r3-artifact-run-40373345832-attempt-1`. Do not mistake a green package workflow for a new or installable UV release.

- UV firmware source commit `23c1d37f3db0d03421312ab986f61f92c3abe11d` adds local Matrix audio following. Fresh audio scales each strip by its own selected cap; stale audio falls back to that cap; zero cap and the firmware output gate remain dark. The local UV-enabled firmware is `HBNF_SP803E_AUX_R3_UV_ENABLED_STALE_AUDIO_FALLBACK_23c1d37_REVIEW_ONLY.bin`, SHA-256 `a4bdbd4f1e8f11e59c40627e7b291f230b2b1e112ebf144dc03a9585a6758d43`. Its clean build reproduced byte-for-byte; it has not been installed.
- Opal/PWA source commit `a7f8fcb399d07bf0757d966ca940ce3dc02a9b0c` adds a shared main-page UV slider, independent Cart and Bar fine-tuning, explicit Apply manual override / Follow Matrix / UV off actions, and an authenticated local UV route. Opening the page sends no UV command.
- The Opal route's readiness-policy gap is closed in source commit `d0c86f623b7346f5ed376c9e2912136ea8a28bb9`: it shares the AUX hardware profile and checks the same runtime and commissioning gates before any WLED write. The candidate profile is default-off, records owner-reported assembly details separately, and leaves operational measurements/gates unverified.
- **Owner PWA v1.0.14 package is built and staged.** It is based on the exact v1.0.13 rollback (`60509839edb902f25546878094d0b39f7d8ce78ca54e99d23e66d84deb41155a`, 1,323,693 bytes), includes the source-bound read-only live preflight, and has package SHA-256 `6c393c5dde6dc78ea16823922c0c2717ccc4ae88dd5fa9e4047efb2e71044a17`. Its installer verifies the existing 21-file tree and retains that exact tree before swapping. This is the next independent software install slice; it changes the Opal PWA only and leaves AUX firmware, gateway service, network policy, and scoring unchanged. Historical evidence reports 17/17 served v1.0.13 assets matched the saved manifest; the installer's exact preflight handles the live filesystem immediately before installation.

- The Opal v1.0.8 gateway package SHA-256 is `cb1b4cb60ca72da668b391481b400c71288b7248d4a13cb767a32f0856f3145c`; it is retained in the current private PR branch, staged, and not installed. No gateway service, certificate, DNS, router, or firewall changes have been applied.
- The current Git branch also contains the exact live Supabase function v35 source and exact v34 rollback source under `evidence/live-production-20261026/`. The v35 function source hash is `377945d8c9c930420ac36febd304d2a4d5f632cbcc4c9e3467c8f440aaa04e73`.
- Focused UV UI/route checks passed 3/3, deterministic package checks passed 2/2, shell syntax and diff checks passed. These establish source/package properties only, not live Opal, network-isolation, or device acceptance.

## Remaining release gates

The source-level parity gap is closed. The owner-confirmed physical integration review is PASS; do not repeat it. The pairing-expiry contract is now live: migration `20261026160033_hbnf_cart_device_session_expiry` and Cart control v35 return the authoritative stored expiry after device-session validation. The exact v34 rollback source and v35 live source are retained under `evidence/live-production-20261026/`. Certificate/split-DNS setup and the live gateway/network checks remain separate field/setup items; the hardware profile intentionally remains default-off until powered channel acceptance.

The Opal package also records that unpaired clients on the shared Cart Wi-Fi can reach WLED's unauthenticated API directly. Router/device network controls need a real negative access check on the Cart network; gateway authentication by itself does not block that path. This is separate from V7 recovery and does not invalidate the owner-accepted physical integration PASS.

## One combined field acceptance session

After the software gate is closed and Cart/Opal are present:

1. Use the retained V7 image as the rollback and record the exact install transaction; the owner-confirmed V7 baseline is not a recovery investigation.
2. Confirm the 5V rail and channel behavior at low output: Cart/RIM only, then Bar/SHORT only; record voltage, current, temperature, channel mapping, and device readback. Confirm underglow still works.
3. Exercise independent caps, shared slider, Follow Matrix with fresh and stale audio, manual levels without Matrix audio, and explicit zero/off. Confirm no unexpected channel activation and restore both strips to off at closeout.
4. Verify the gateway's unpaired-client boundary on the actual Cart network and confirm reconnect/readback.

Keep the release fail-closed until its named software, network, and device checks pass. Do not repeat the accepted physical-design review or ask for additional owner preparation while Cart and Opal are away.
