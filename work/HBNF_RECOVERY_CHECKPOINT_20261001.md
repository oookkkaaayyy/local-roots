# HBNF recovery checkpoint — 2026-10-01 evening PDT

## Goal and authorization
Finish the coordinated release before Andrew begins the physical rollout. Minimize Andrew's keyboard work. Source/build/test/package work is authorized; production deploy, merge, firmware flash, router changes and live reinstall remain unauthorized. Preserve accepted Audio V1.1.

## Recovered identity
- Repository: oookkkaaayyy/local-roots
- PR: https://github.com/oookkkaaayyy/local-roots/pull/46
- Branch: hbnf-coordinated-release-20261001
- Recovery input commit: 2aa4879f6a75e99c1ba8838c24eb3de2266d6a7f
- Accepted release: hbnf-matrix-v1-1-current-20260930
- Accepted firmware SHA-256: 0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61
- Corrected updater target: 1.2.4-1; real target IPK has NOT been produced.

## Completed and verified in this recovery
Recovered 44 relevant files at the pinned commit. Ran five Node checks: canonical palette projection, coordinated backend staging, coordinated controller contract, iOS12 static audit, and release readiness. All pass their source-level checks; release readiness explicitly reports PRODUCTION_READY=NO. Python compilation passes.

The updater rebuilder regression initially FAILED: exact multiline patch expected tabs while its own fixture used spaces. Corrected matching to tolerate indentation only, require each source line exactly, and require one match. Added root-owned deterministic archive metadata and fail-closed archive extraction for links/special files/traversal. Regression now passes with both tab/space fixtures, identical repeated build bytes, rejection of changed source, rejection of wrong base SHA without overwriting an existing output, root ownership, and unsafe archive rejection.

Fixed iOS12 audit to fail whenever unsupported source syntax/API is detected, even while the production gate is false. This remains a static audit, not an actual iPad browser acceptance claim.

## Evidence limits
GitHub Actions list for this branch returned zero runs. The only observed head check is Cloudflare Pages preview success. Website preview success is NOT coordinated-release CI, firmware compilation, or device acceptance.
No Deno or Lua/BusyBox interpreter is available in this execution environment; backend type checking and live Lua/BusyBox behavior were not verified here.
Public exact 1.2.3 IPK download timed out at the network proxy. Drive title searches and Library exact-title search did not resolve the base package or V1.1 source. Those search results do not prove the files do not exist.
This environment has no access to Andrew's Mac filesystem, local Codex task-control tool, cart LAN or production signer. No hardware commands were run.

## Actual remaining dependencies
1. Exact Audio V1.1 source reconciliation using the Mac build workspace below. Do not infer firmware source from PR #46.
2. Implement palette/overlay/UI/build-identity contract on that proven firmware lineage.
3. Real firmware compilation plus existing visual/audio regressions and new contract tests.
4. Rebuild corrected updater from checksum-verified actual 1.2.3 IPK; inspect actual Lua and security behavior. Synthetic fixture success is not a real IPK or opkg acceptance.
5. Sign candidate in place with the existing production signer; never copy private key into repository/Drive/chat/Opal.
6. Publish only with explicit authorization, then one controlled OTA/health/backend-cutover/physical acceptance session.
7. Separate unresolved HBNF-Cart SSID cold-start test.

## Exact Mac sources
- V1.1 output: /Users/andrew/Documents/Codex/2026-09-30/files-pasted-by-the-user-hbnf/outputs/HBNF_AUDIO_EXPRESSION_V1_1
- Accepted BIN: that directory/HBNF_AUDIO_EXPRESSION_V1_1_candidate.bin
- Read REPORT.md and SHA256SUMS before source edits.
- V1 predecessor source.patch: ../HBNF_AUDIO_EXPRESSION_V1/source.patch
- Rollback source tree: /Users/andrew/Documents/Codex/2026-09-30/this-is-the-highest-priority-next/work/hbnf-visual-audio-repair/integration-copy
- PlatformIO environment: hbnf_matrix_wled16_max
- Production public-key DER fingerprint: fa6a5f782607ef2ac3123ac9f7912f4cb2e7d5d0a23f6ef5112510075097f41d
- Mac public key: /Users/andrew/.config/hbnf-ota-signing/release-public.pem

## Production invariants
Current captured canonical fence already active at epoch 2; desired state captured revision 117. Do not reseed/reactivate. Preserve existing paired-device/no-login behavior. Do not overwrite canonical owner with legacy backend. Palette never overwrites brightness. Overlay expiry returns CURRENT base state, not a stale snapshot. Matrix remains audio/visual master and AUX DDP follower. No new FFT or animation-clock redesign.

## One handoff to local Mac Codex (copy this paragraph)
Continue PR #46 in oookkkaaayyy/local-roots, branch hbnf-coordinated-release-20261001. Fetch latest branch and read work/HBNF_RECOVERY_CHECKPOINT_20261001.md first, then work/HBNF_READ_THIS_FIRST.md and work/HBNF_CODEX_FIRMWARE_RECONCILIATION_PROMPT.md. Finish source reconciliation, real updater rebuild and coordinated firmware build/tests without flashing/deploying/merging or modifying router/live hardware. Read tools/hbnf-source-identity-preflight.py output and the exact V1.1 REPORT/SHA manifest; artifact discovery alone is not source-lineage proof. Use the existing Mac workspace and checksum-verified base IPK; do not ask Andrew for successive Terminal diagnostics. Preserve signer private material in place. Save each bounded stage's source/test/artifact identity before proceeding. Stop with one candidate/report and exact remaining blocker only when genuinely unable to continue. Do not generate another updater-only firmware release. Do not mark a production gate true based on static fixtures or a website preview. If the real IPK source differs, preserve the fail-closed rebuilder and inspect the exact source before adapting the patch. Return candidate BIN/hash, corrected real IPK/hash, tests and source lineage; explicitly state NO FLASH / NO DEPLOY.
