# HBNF Cart 2.0 — Crash Resume Handoff — 2026-10-05

## Resume authority
- Branch: `hbnf-cart2-ready-to-implement-staging-20261001`
- Expected HEAD at handoff creation: `49a48559aaeba53b75eef0018e2036d0ae32b899`
- Lifecycle: `DIAGNOSTIC_ACTIVE`
- Seq19 diagnostic remains installed; Release07 is not yet verified restored.
- Do not resume the old seq19 diagnostic sweep.

## What the crashed worker completed
The zero-traffic Cloudflare rehearsal completed and decisive evidence was uploaded to Drive before the Mac restart.

Durable evidence folder:
https://drive.google.com/drive/folders/1LwC5lYDwFT_bEJo9cVxDMTcJe-IF6BYr

Key files:
- ZERO_TRAFFIC_REHEARSAL.json — Drive 1ZJOseh2J4ls9dGlF_SOH5DHAH9djd4xp
- PRELIVE_PROOF.json — Drive 1BLZuPicWwL8_eNlPeJPhKXqEsFzyGoc2
- PRELIVE_CHECK.json — Drive 1V-7mHZQT_XVYPGuDBE2VKVXY1BwFvjFv
- RUN_BLOCKED.json — Drive 15Uc-TWPqEMXsAgj9glQKqD2MykW4hKZW
- CAPSULE.json — Drive 1V28vrogL7JOhCieKs-ANVJTKoQwMVHyl

## Proven rehearsal result
Stable version `29bdcc12-17ce-4feb-bb9e-e83cec5e1567` was held at 100%; candidate `e4d31b2b-a9c1-4797-b5df-b8ad0121df6d` was placed at 0% and targeted with `Cloudflare-Workers-Version-Overrides` from Opal.

The candidate DID NOT serve seq20 `latest.json` or `latest.json.sig`.
Observed response remained exact stable seq19:
- manifest SHA `2bd86e011ff4e862bc0b8a5c9f490a8a8e2cdb5bf5abb1bb39156424341a6fce`
- signature SHA `405faf1c60d8eacc91481fc21e258709105b3a84234c88f0f69f9893ed9a36d1`
- role `update`, sequence 19.

Root cause is proven: candidate static assets are asset-first (`raw_run_worker_first=false`, `serve_directly=true`). The updater paths match preserved static assets, so Worker code is bypassed even when the candidate version is selected by override.

Rollback rehearsal succeeded. After the test, exact stable VERSION `29bdcc12-17ce-4feb-bb9e-e83cec5e1567` was restored at 100% in new deployment `19558df7-0120-4147-894a-214d05ed4c17`.

No Opal updater execution and no Matrix/AUX mutation occurred.

## Exact next blocker
Do NOT reuse candidate `e4d31b2b-a9c1-4797-b5df-b8ad0121df6d` for recovery.

Create a replacement candidate from exact current stable Worker state using:
- `keep_assets=true`
- strict binding preservation
- selective `assets.run_worker_first` for ONLY:
  - `/firmware/matrix/stable/latest.json`
  - `/firmware/matrix/stable/latest.json.sig`
  or the narrowest verified equivalent.

Cloudflare officially supports selective `assets.run_worker_first` route patterns.

Rehearse the replacement at 0% with stable at 100%, target it with `Cloudflare-Workers-Version-Overrides`, and require:
- exact seq20 manifest SHA `7741978130173a84d3f96aa80dd31a4ab8f6657d4810bdf492bc170f653a61b3`
- exact recovery signature SHA `d197c58e21010f3a1eec09d47e8e5abc452246355a6ad4f36f40c16b93c98be3`
- role `recovery`, sequence 20
- Release07 BIN SHA `8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab`
- unchanged representative static assets/config
- exact stable VERSION rollback to 100%.

Only after PRELIVE_PROOF passes may exact seq20 Release07 recovery run.

## Current machine authority
Read:
- `config/HBNF_CONTROL_STATE.json`
- `platform/providers/cloudflare-workers.json`
- `platform/workflows/live-device-diagnostic.json`
- `platform/cart2-critical-path-v1.json`
- `AGENTS.md`

The computer restart is not evidence of any cloud/device mutation. Resume from the durable evidence above; do not redo the completed zero-traffic rehearsal.
