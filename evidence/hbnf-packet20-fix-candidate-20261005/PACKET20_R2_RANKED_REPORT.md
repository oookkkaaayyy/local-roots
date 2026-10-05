# Packet20 r2 full 28-kernel result and paired comparison

## Run result

- Candidate: `hbnf-matrix-packet20-timing-hook-v1-20261005-r2`
- Candidate BIN SHA-256: `42f2ed58c3b89af95926ee0cf5824a575df9dcf75c7fbb8ead9d6eaff427ee07` (1,463,664 bytes).
- Sweep: PASS, 28/28, one run; renderer snapshot restore PASS with exact state equality.
- Recovery: exact Release07 PASS, SHA-256 `8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab`; transaction seq24 ledger write succeeded without readback.
- Current lifecycle remains `DIAGNOSTIC_ACTIVE`; Foundation is not qualified.
- The firmware restore adapter validated `restoreVerified=true`; the firmware source sets that flag only from `packet20Same(saved,verify)`. The exact snapshot ID/hash comparison passed. The full raw post-restore `/json/state` response was not retained in this run; the adapter now saves it before validation in future runs.

## Ranked worst first

| Rank | Kernel | Effect | r2 kernel ms | r2 frame ms | FPS median | Heap end | RSSI dBm | r1 kernel ms | Delta ms | Delta % |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Water | 228 | 160.451 | 198.391 | 4.0 | 128284 | -48.0 | 92.157 | 68.294 | 74.1% |
| 2 | SM5 | 246 | 124.874 | 149.440 | 6.0 | 128284 | -48.0 | 94.552 | 30.322 | 32.1% |
| 3 | Scaledemo1 | 242 | 121.382 | 148.711 | 6.0 | 127560 | -47.0 | 57.224 | 64.159 | 112.1% |
| 4 | Parametric_Water | 222 | 119.743 | 142.608 | 6.0 | 128284 | -48.0 | 167.353 | -47.610 | -28.4% |
| 5 | Complex_Kaleido_4 | 226 | 108.187 | 136.631 | 6.0 | 128284 | -48.0 | 81.724 | 26.463 | 32.4% |
| 6 | Big_Caleido | 221 | 98.542 | 120.378 | 7.0 | 128284 | -48.0 | 85.646 | 12.896 | 15.1% |
| 7 | Rotating_Blob | 236 | 97.805 | 121.215 | 7.0 | 128264 | -48.0 | 98.702 | -0.897 | -0.9% |
| 8 | Complex_Kaleido_3 | 220 | 93.454 | 115.463 | 8.0 | 128284 | -48.0 | 81.150 | 12.304 | 15.2% |
| 9 | Caleido2 | 240 | 92.495 | 117.719 | 8.0 | 128284 | -48.0 | 75.315 | 17.180 | 22.8% |
| 10 | Caleido3 | 233 | 90.273 | 112.636 | 8.0 | 128272 | -47.5 | 76.379 | 13.894 | 18.2% |
| 11 | Complex_Kaleido | 244 | 88.753 | 113.966 | 8.0 | 128284 | -47.0 | 76.288 | 12.465 | 16.3% |
| 12 | Module_Experiment10 | 247 | 87.447 | 112.700 | 8.0 | 128260 | -47.0 | 111.331 | -23.884 | -21.5% |
| 13 | RGB_Blobs4 | 229 | 79.253 | 102.150 | 9.0 | 128292 | -48.0 | 70.138 | 9.115 | 13.0% |
| 14 | Polar_Waves | 224 | 78.688 | 100.152 | 9.0 | 128300 | -47.0 | 67.838 | 10.850 | 16.0% |
| 15 | RGB_Blobs5 | 223 | 78.621 | 101.309 | 9.0 | 128292 | -48.0 | 70.343 | 8.278 | 11.8% |
| 16 | RGB_Blobs3 | 245 | 78.620 | 103.785 | 9.0 | 127836 | -47.5 | 70.109 | 8.511 | 12.1% |
| 17 | Chasing_Spirals | 235 | 77.802 | 102.334 | 9.0 | 128284 | -48.0 | 64.482 | 13.320 | 20.7% |
| 18 | Yves | 241 | 77.365 | 100.424 | 9.0 | 128284 | -48.0 | 76.034 | 1.331 | 1.8% |
| 19 | Distance_Experiment | 238 | 76.389 | 106.410 | 8.0 | 128264 | -48.0 | 56.612 | 19.777 | 34.9% |
| 20 | Spiralus2 | 231 | 72.932 | 94.308 | 9.0 | 127888 | -47.0 | 65.547 | 7.385 | 11.3% |
| 21 | Lava1 | 239 | 67.395 | 92.901 | 10.0 | 128284 | -48.0 | 65.207 | 2.188 | 3.4% |
| 22 | Complex_Kaleido_6 | 227 | 61.555 | 82.825 | 11.0 | 127568 | -47.5 | 55.669 | 5.886 | 10.6% |
| 23 | Center_Field | 237 | 54.226 | 79.817 | 11.0 | 128284 | -48.0 | 55.622 | -1.396 | -2.5% |
| 24 | Waves | 234 | 50.728 | 74.561 | 12.0 | 128280 | -48.0 | 54.055 | -3.327 | -6.2% |
| 25 | Hot_Blob | 232 | 50.407 | 70.833 | 13.0 | 128280 | -48.0 | 74.757 | -24.350 | -32.6% |
| 26 | Zoom | 243 | 46.842 | 71.676 | 12.0 | 128284 | -48.0 | 41.600 | 5.242 | 12.6% |
| 27 | Zoom2 | 225 | 44.375 | 65.951 | 14.0 | 128268 | -47.0 | 40.760 | 3.615 | 8.9% |
| 28 | Complex_Kaleido_5 | 230 | 39.510 | 60.843 | 15.0 | 128300 | -48.0 | 43.275 | -3.764 | -8.7% |

## Grouped diagnosis

- ANIMartRIX rendering remains the dominant stage: median kernel 78.654 ms; palette 12.487 ms; audio 3.485 ms; AUX prepare/send 0.144 ms; unaccounted 6.793 ms.
- The same-run baseline r1 medians were kernel 70.240 ms, frame 93.016 ms, FPS 10.0; r2 medians were frame 103.059 ms and FPS 9.0. This single paired sweep is not sufficient to separate run-to-run load variation from broad candidate impact.
- Largest targeted improvements: Parametric_Water -28.4%, Hot_Blob -32.6%, Module_Experiment10 -21.5% kernel time. These are consistent with reduced repeated polar trigonometry in the hot class.
- Largest slow r2 kernels: Water, SM5, Scaledemo1, Parametric_Water, Complex_Kaleido_4. R2 is not promoted as a qualified performance fix because the run lacks tail/heap fragmentation gates and aggregate median frame/FPS did not improve versus r1.
- No Matrix restart/reset was observed during the sweep; exact renderer state was restored and Release07 recovery completed. The historical Matrix power-cycle evidence remains intentionally excluded.

## Evidence

- `live-transaction/live-sweep/ALL_KERNEL_SWEEP_REPORT.json` — complete ranked machine report.
- `PACKET20_R2_RANKED_28.json` and `PACKET20_R2_PAIRED_28.csv` — full ranking and per-kernel paired metrics.
- `live-transaction/live-sweep/RESTORE_RECEIPT.json` and `POST_RESTORE_STATE.json` — exact renderer-state restoration.
- `live-transaction/TRANSACTION_RESULT.json` — candidate install, sweep, and seq24 recovery outcome.
