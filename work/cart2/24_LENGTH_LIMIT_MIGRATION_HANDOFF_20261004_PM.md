# HBNF Cart 2.0 — Length-Limit Migration Handoff — 2026-10-04 PM

Authoritative cross-chat handoff is the Google Drive document:

- **AKS — HBNF CART 2.0 — LENGTH-LIMIT HANDOFF — 2026-10-04 PM**
- Drive ID: `1XmyqVCwQIcaEmfdbx4ZaF6S-BuoVfUVgBGpWA2UShfU`

Read that first together with:
- Cart2 CURRENT FILE AUTHORITY: `1GwvPv_nihqoIj83WsO6VcvyujRkt8HnnULvLv717OHc`
- Artifact Registry: `18VsUYIYr62fYVaEqynM1kbMmfQpei-3H3rBgrw8S96k`

## Current state

- lifecycle: `DIAGNOSTIC_ACTIVE`
- foundation: `FOUNDATION_UNQUALIFIED — PERFORMANCE_OPEN`
- Packet20: zero valid live kernel samples
- current live forward firmware: Release07, SHA `8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab`
- exact Packet20 source SHA: `529e1bf718c3770b7d4ba6408178e9d3e7a4ed1d223b9bbf9071b68e75eed74b`
- local PlatformIO/LDF path: CLOSED

## Cloud runs

1. `37229698261`: missing WLED ESP32 dependency closure (`AsyncTCP.h`).
2. `37230743394`: first repair verified; missing declared Animartrix dependency.
3. `37231477686`: both earlier repairs verified; failed on missing historical `animation_clock_*` members in pristine upstream ANIMartRIX.

Run3 decisive evidence:
`evidence/hbnf-phase2-migration-20261003/packet20-cloud-run3-failure-20261004.json`

## User-supplied source.patch recovered the missing build input

Raw exact file:
- Drive `1uzBe-bVdQhmw2KaOO6eSQfGIelDXNda5`
- 17,244 bytes
- SHA-256 `aca7b2fa6fe45ce992e162d91447351487e854279de373e691cf02615c149b04`

Full patch is older than Release07. **Never apply it wholesale.**

Full reconciliation:
`evidence/hbnf-phase2-migration-20261003/packet20-source-patch-reconciliation-20261004.json`

Only newly required hunk:
- vendor Animartrix monotonic/slew-limited animation clock
- Drive `184_dgUkzJ1raV2K0qC9YdcuP1JOzSeoQ`
- SHA-256 `f38d260d0f1f50644f24166fa92377d48ac0ffbe292b57f8ec5db39579af10c4`
- GitHub path `.hbnf-packet20-cloud/source/animartrix-clock.patch`
- blob `1f4b1833b23845595b423e2b07cb6caa502abad8`

Pinned pristine Animartrix:
- commit `81eb09b91c8c9c8c01f8ea442787f8127d56c72f`
- `ANIMartRIX.h` Git blob `db640748175cfdd70dc103fc23c830e646fa5ab6`

## Current clean-build preparation

Packet20 temp branch:
`hbnf-packet20-safe-point-cloud-20261004`

Workflow now:
- verifies exact source/overlay;
- restores WLED ESP32 closure;
- declares exact Animartrix revision;
- materializes dependencies before compile;
- verifies exactly one pristine header and exact upstream blob;
- verifies exact vendor patch SHA;
- applies only vendor clock patch fail-closed;
- verifies four clock fields + non-const oscillator signatures;
- preserves pristine header + patch + patched header in artifact;
- records patch/upstream/patched-header provenance;
- compiles once.

Latest workflow-prep commit known at migration:
`71e49b85de75031edf1081d7a60fd49acff5c3b6`

No TRIGGER update was made by the source.patch recovery work.

## Challenger correction

Read:
`work/cart2/PACKET20_CHALLENGER_REVIEW_20261004.md`

Core rule: the three cloud failures were one incomplete clean-room closure problem revealed in layers. Do not continue one-compiler-error-per-paid-run. Reconcile closure offline before another run; if the next run reveals another missing source/build input, stop and do a full closure audit before spending again.

Solved-problems ledger now includes `HBNF-WATCH-016` for omitted patched third-party dependency closure.

## Cost authorization

Latest user instruction:
- up to **$5 total external cost** for genuinely necessary continuation work;
- minimize actual spend;
- cost itself should not be an artificial blocker;
- pause before any single action materially above historical estimates;
- do not loop merely because budget remains.

Historical Packet20 cloud runs are ~1–1.5 minutes with a 20-minute hard cap.

## Next technical action

1. Read the Drive handoff.
2. Verify current Packet20 temp-branch HEAD and unchanged trigger.
3. Verify exact patch/workflow/provenance guard state.
4. If the current user authorization is sufficient under the execution-governance rules, trigger exactly one reconciled build.
5. On success: validate → Drive release capsule → registry → live updater high-water → legal diagnostic/recovery pair.
6. On failure: preserve evidence; if another missing build input appears, do not immediately rerun.

## Device note

One intentional Matrix power cycle during backend prep is excluded from diagnostic evidence. Do not investigate that expected reset.

## Hard no-reopen list

No UART, serial flash, router/LuCI archaeology, local PlatformIO/Python/LDF/SCons repair, power/brownout archaeology without new direct evidence, or wholesale old source.patch application.
