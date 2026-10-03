# HBNF Phase 2 Migration Input — 2026-10-03

Status: **FOUNDATION_UNQUALIFIED — PERFORMANCE_OPEN**

Current live firmware is `hbnf-matrix-coordinated-v1-20261002-07`, SHA-256 `8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab`. Install/device health passed. Performance acceptance failed at about 11.53 FPS / 85.3 ms average frame while Parametric_Water (kernel 2) consumed about 68.9 ms/frame.

## Critical migration interpretation

- Release 07 is the latest forward installed state, **not** the qualified Phase 2 foundation.
- RGB_Blobs5 was the dominant release-06 sampled kernel; release07 targeted it.
- Release07 acceptance sampled a different kernel, Parametric_Water, which was itself pathological.
- Therefore do not infer that the RGB_Blobs5 optimization failed; infer that the overall renderer still contains at least one additional slow retained kernel.
- Latest release07 palette/color time was only ~0.47 ms in this sample, so the older hypothesis that palette/color is the next universal bottleneck is not currently supported.
- The next performance step is the already-designed all-28-kernel automated sweep plus shared-primitive/common-path grouping, not serial human discovery.

## Hard continuity constraints

- Forward fixes only; rollback remains recovery, not the solution.
- Preserve all coordinated functionality.
- Measure before patching.
- Do not reopen router/cloud/backend investigation unless telemetry implicates it.
- Install health != performance acceptance != physical feature acceptance.
- Do not reinstall releases 05/06/07 merely to reconstruct history.
- Reuse the recovered PlatformIO 6.1.17 environment by absolute path.
- HBNF-Cart SSID cold-start reliability remains a separate open loop.

## Source identity caveat

The GitHub repair branch currently points to `0c01d0c7f065264e2b9fd8127f1c48cc96a73b56`, but the final release07 artifact's exact source commit remains **UNVERIFIED** because the local Files-On-Demand worktree's git metadata timed out. Do not silently equate branch HEAD with artifact source identity.

See the adjacent machine-readable migration input for exact identities, paths, timings, and blockers.
