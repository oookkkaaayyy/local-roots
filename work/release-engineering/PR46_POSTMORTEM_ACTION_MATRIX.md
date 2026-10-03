# PR #46 Postmortem — Action Matrix

Source authority:
- PR46_BUILD_POSTMORTEM_20261002.md
- PR46_FOLLOWUP_ACTIONS_20261002.json

This matrix turns the postmortem into release-engineering gates. It does not touch the active PR #46 defect task.

## MUST before next firmware update

1. RELEASE-04 GOLDEN CAPSULE
- Populate exact accepted source/build/toolchain/dependency/generated-input/artifact/rollback/install evidence.
- Fresh checkout must resolve every referenced file/hash without chat history.

2. PHYSICAL ACCEPTANCE LEDGER
- Install/identity/health evidence is separate from physical feature acceptance.
- Required rows: palette, overlay lifecycle, Motion, Audio Response, brightness, existing controls, AUX/DDP, iPad.
- No aggregate "accepted" state while a required row is NOT_VERIFIED.

3. SIGNED RELEASE TRANSACTION PREFLIGHT
Validate before publication:
- accepted base
- high-water sequence
- update/recovery roles
- active pointers
- signatures
- content-addressed URLs
- artifact hash/size
- embedded candidate/build identity
- rollback identity

4. BUILD-IDENTITY ROUTE TEST
- /hbnf/build.json must return JSON, never the /hbnf HTML page.
- Candidate, release ID, base release and base hash must agree across firmware marker, JSON response and signed manifest.
- Route precedence/duplication is a release gate.

5. DEPENDENCY CLOSURE ENFORCEMENT
- Capture package/compiler/library versions, selected origins/hashes, duplicate-resolution choices, esp_dmx provenance, symlink containment and local materialization.
- Reject Documents/FileProvider inputs, missing files and paths escaping the local workspace before PlatformIO starts.

6. GENERATED INPUT MANIFEST
- Declare all generated UI headers and the four WEB_BUILD_TIME locations as DETERMINISTIC_GENERATED or CANONICAL_FROZEN_INPUT.
- Hash inputs/outputs before/after build.
- Any unmapped binary-difference range fails.

7. BOUNDED LDF TRACE
- After 2 minutes without measurable progress: capture PID/CWD/open-file/syscall evidence for <=60 seconds.
- Permit one targeted fix and one retry.
- Never escalate to broad scans/clones/clean/reinstall/file-by-file replacement without new evidence.

8. SOLVED-PROBLEM PROMOTION
Add validated entries/one-shot diagnostics for:
- FileProvider/LDF
- frozen UI headers
- local esp_dmx
- route shadowing
- rpcd/ubus
- updater HMAC
- accepted-base/role/pointer/sequence drift
- content addressing
- AUX preflight loss
- nonfatal curl timeout classification

## SHOULD before Cart 2.0
- real clean-room build with network disabled after dependency materialization
- separate firmware/updater/backend/router identity manifests with compatibility edges
- actual rebuilt updater IPK validation on representative old OpenWrt runtime
- retain SSID cold-start as separate explicit gate
- generate status/report/SHA/manifests from one authoritative release-state object

## NICE
- generated release dashboard
- Opal job/log parsers
- ESP binary-difference classifier
- elapsed-time budget report

## Current defect overlay — release 04 low/jittery FPS
Observed field evidence:
- accepted release: hbnf-matrix-coordinated-v1-20261002-04
- FPS approximately 7 at ~172 seconds after cold boot
- free heap approximately 97220
- Wi-Fi RSSI strong
- CPU 240 MHz
- low/jittery behavior therefore exists essentially from cold boot, not only after one hour

Current active diagnosis/fix remains outside this staging lane.

Do not mark release 04 fully accepted until:
- low-FPS root cause is identified;
- fix is integrated into the accepted baseline;
- frame pacing is revalidated;
- physical visual/audio acceptance is re-run;
- the final fix is added to solved-problems/regression enforcement.

## Completion rule
This matrix is complete only when every MUST item is either:
- PASS with linked evidence; or
- BLOCKED with exact evidence requirement.

Difficulty does not authorize deletion or deferral.
