# HBNF — READ THIS FIRST

This file is the standing operating contract for HBNF cart work. It exists so the user does not have to repeat the same quality/efficiency request in every session.

## Default behavior
- Continue making safe, meaningful progress whenever hardware is unavailable.
- Do not stop at planning when source, tests, packaging, documentation, or release hardening can still be completed.
- Do not require the user to restate "maximize quality, minimize troubleshooting, keep moving" each time.
- Preserve the accepted live Matrix/AUX/Opal state until a complete candidate is ready.
- Never deploy, flash, merge, change router/network settings, or mutate live hardware without explicit go-live authorization.
- Prefer one coordinated release over serial infrastructure-only or throwaway firmware cycles.
- Reuse proven HBNF/WLED/OpenWrt implementations and existing project history before inventing new architecture.
- Turn every discovered failure mode into a durable regression check, package correction, or runbook step.
- When physical access is the only remaining blocker, stop with a bounded, pre-validated acceptance procedure rather than another research loop.

## Required implementation discipline
1. Reconcile source identity to the accepted live baseline before production release.
2. Build in an isolated branch.
3. Add/extend automated regression gates for every changed behavior.
4. Package every required file; do not rely on undocumented live patches.
5. Keep rollback to the accepted baseline available.
6. Validate all non-hardware requirements before asking for physical interaction.
7. Make the first physical session a single controlled preflight → install → reboot → health → visual acceptance sequence.
8. Record durable state in AKS and in this repository before stopping.

## Current accepted baseline
- Release: hbnf-matrix-v1-1-current-20260930
- Firmware SHA-256: 0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61
- Matrix: 192.168.77.10 / 70:4b:ca:5b:34:5c
- AUX: 192.168.77.11 / 8c:94:df:55:c3:4c
- Opal: 192.168.77.1
- WLED: 16.0.1
- Audio V1.1 is accepted and non-blocking.

## Current release branch
- hbnf-coordinated-release-20261001
- Draft PR #46
- Production deployment from this branch is prohibited until explicit go-live authorization and all release gates pass.
- Do not assume the current staged controller source is the exact live /hbnf source. Exact accepted V1.1 source identity still requires reconciliation.
- The staged feature module is iOS-12-safe by current static checks, but older controller files in this branch still contain optional chaining/nullish coalescing and crypto.randomUUID; full-controller iOS 12 compatibility is therefore an explicit production blocker, not an assumed pass.

## User-interaction standard
When user action is actually required, provide:
- exact device
- exact power/network prerequisites
- exact action
- exact expected result
- exact stop/rollback condition

Do not send broad troubleshooting trees when one direct test can determine the next step.
