# HBNF Cart UV commissioning update

This is a narrow source-bound update to three existing Opal Lua modules. It adds an authenticated first-output check and an explicit safe OFF path while preserving the existing profile gates on MANUAL and FOLLOW_MATRIX writes.

## Live sequence

1. Restore Opal gateway service availability and confirm the Opal is the intended GL-SFT1200. Do not infer this from the PWA page loading.
2. Re-read the exact 20-file installed gateway baseline. The package requires the recorded v1.0.14 hashes; if any differ, stop and prepare a new candidate against the actual state.
3. Retain the exact candidate ZIP and v1.0.14 rollback ZIP in the approved private vault, download both back, and compare exact size and SHA-256.
4. Create and durably read back the one-time admission manifest for this candidate, target, current baseline, recovery files, mutation route, and acceptance plan. The installer refuses to mutate without the matching PASS manifest.
5. Install the gateway update first and verify the recorded post-install readback. Install the paired Owner PWA v1.0.16 only after this gateway receipt passes.
6. On the Cart, use Test Cart and Test Bar separately. Each runs at the selected slider value for three seconds and must read both outputs off at the end. Also verify explicit UV off works while full activation remains locked. MANUAL and FOLLOW_MATRIX remain locked until the full hardware profile and commissioning gates pass.

The three-second timeout is enforced by the Opal request handler. If the Opal process, network, or AUX becomes unavailable during a pulse, the final output state can be unknown; check status and use the explicit UV off command before retrying. This package is not an AUX firmware watchdog and does not claim independent shutdown after Opal failure.

The existing Opal v1.0.14 record is owner-reported and is not a current filesystem readback. This candidate remains inadmissible until the fresh target preflight and one-time durable admission pass. No install or device change is authorized by this package alone.
