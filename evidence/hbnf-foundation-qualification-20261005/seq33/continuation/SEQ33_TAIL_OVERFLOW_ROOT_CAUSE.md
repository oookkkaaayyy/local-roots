# Seq33 frame-tail overflow analysis

## Determined cause

The seq33 attempt stopped in the host adapter before kernel profile 0. The adapter rejects any `foundationTelemetry.frameTailOverflow=true` (`scripts/hbnf_foundation_live_adapter.py`, current branch line 188). Firmware sets this flag if **any one of eight metric histograms** has a sample in its last bin. The bins are 512 × 100 µs, so the final bin begins at 51.1 ms and the represented range ends at 51.2 ms. This flag is therefore a coarse saturation indicator, not a signal that p50/p95/p99 are necessarily saturated.

The same telemetry response preserved exact `frameMsMax=12559.93 ms`, while its frame percentiles were p50 20.35 ms, p95 23.25 ms, and p99 36.65 ms across 746 samples. This is consistent with one extreme interval: 12,559.93 / 746 = 16.84 ms contribution to the mean per sample. The recovered Release07 response also showed `frameTailOverflow=true` with exact max 63.073 ms, proving the 51.2 ms ceiling is too low even for the baseline's observed tail.

## Interpretation and limit

This is both a telemetry-range defect and a real measured outlier. Firmware keeps `frameMsMax` separately from the histogram, so the 12.55993 s maximum was not created by histogram clamping. The exact source measures cycle-counter elapsed time from the start of the HBNF render callback through `BusManager::show()`. The 12.56 s value therefore indicates an actual long render-to-show interval (visible output could remain stale), but the available data cannot attribute it to renderer computation versus task scheduling or another blocking operation. No restart/reset is shown by the captured run. Do not call this a restore failure or dismiss it as telemetry corruption.

The p50/p95/p99 values are below the histogram ceiling and likely remain representative for this sample, but the response does not expose per-metric overflow counts, so that cannot be proven for every metric. The adapter appropriately failed closed; no kernel profile or soak is valid from this attempt. Renderer restore is independently proven by raw `restoreVerified=true` and `packet20Same=true`, and exact Release07 seq34 recovery is verified.

## Safest next qualification preparation

Before any new live authorization, prepare an instrumentation-only derivative that records per-metric overflow counts/quantile saturation (or uses a range that includes the measured maximum), preserves the exact max, and exposes enough context to localize long render intervals. Do not simply disable the overflow check. Freeze an objective max/tail policy before execution; a repeated multi-second interval must remain a Foundation failure. No device mutation, new sequence allocation, or soak is authorized by this analysis.

## Evidence and source identity

- Firmware source: remote branch `hbnf-packet20-foundation-metrics-20261005`, commit `b18b162ec4b4f9173b1de892957ff8b834fe2b50`, file `.hbnf-packet20-cloud/source/usermod_hbnf_foundation_v1.cpp`; SHA-256 `f0350177d671f44577d2bfd40780b498662f57d08e5a4078be738c995da8f67a`, Git blob `93115b565f793f22cbe334e4b96924f9bea3fb15`.
- Stop telemetry: `STOP_BEFORE_SEQ34_READONLY.json`, SHA-256 `ffc96c97fc41c1b991ed0fb05a1d7fe04b210b731b0164c99cc73220d47c610f`.
- Host abort (0 profiles): `SWEEP_ABORT.json`, SHA-256 `d24344119693697bd7a6780b51060c683b1e06ffd4e6ee82e348ea2e61da29ac`.
- Release07 post-recovery telemetry: `seq34-recovery/POST_OTA_READONLY.json`, SHA-256 `2688feae12221a17f5cf2440f10f43036eb27f95ee5e5c94e9b1116d819f0a59`.
- Exact renderer restore: `POST_RESTORE_RAW_STATE.json`; Release07 recovery: `seq34-recovery/RECOVERY_RECEIPT.json`.
