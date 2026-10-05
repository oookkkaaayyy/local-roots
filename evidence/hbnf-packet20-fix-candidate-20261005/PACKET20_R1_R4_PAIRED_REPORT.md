# Packet20 R1 vs R4 paired result

Candidate: hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4

## Aggregate

| Metric | R1 | R4 | Change |
|---|---:|---:|---:|
| Median FPS | 10.0 | 42.0 | +320.0% |
| Median whole-frame time | 93.016 ms | 18.423 ms | −80.2% |
| Median kernel time | 70.240 ms | 8.329 ms | −88.1% |
| Median paired per-kernel speedup | — | — | 89.3% |
| Kernels improved / regressed | — | — | 28 / 0 |

Frame p90/p95/p99 are unavailable because diagnostic telemetry stores sampled frame averages, not per-frame distributions.

Worst five R1: Parametric_Water, Module_Experiment10, Rotating_Blob, SM5, Water.
Worst five R4: Spiralus2, RGB_Blobs4, Complex_Kaleido_4, Water, Complex_Kaleido_3.

## All kernels

| Effect ID | Kernel | R1 kernel ms | R4 kernel ms | Speedup | R1 frame ms | R4 frame ms | R1 FPS | R4 FPS |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 220 | Complex_Kaleido_3 | 81.150 | 14.380 | 82.3% | 102.527 | 24.237 | 9 | 34 |
| 221 | Big_Caleido | 85.646 | 10.647 | 87.6% | 107.232 | 20.602 | 8 | 39 |
| 222 | Parametric_Water | 167.353 | 12.494 | 92.5% | 205.045 | 21.925 | 4 | 36 |
| 223 | RGB_Blobs5 | 70.343 | 8.527 | 87.9% | 92.393 | 18.834 | 10 | 42 |
| 224 | Polar_Waves | 67.838 | 10.718 | 84.2% | 89.324 | 21.686 | 10 | 39 |
| 225 | Zoom2 | 40.760 | 3.586 | 91.2% | 62.246 | 13.587 | 15 | 42 |
| 226 | Complex_Kaleido_4 | 81.724 | 16.107 | 80.3% | 103.396 | 26.184 | 9 | 32 |
| 227 | Complex_Kaleido_6 | 55.669 | 4.660 | 91.6% | 77.129 | 15.082 | 12 | 42 |
| 228 | Water | 92.157 | 14.163 | 84.6% | 113.694 | 25.138 | 8 | 35 |
| 229 | RGB_Blobs4 | 70.138 | 16.449 | 76.5% | 91.889 | 26.928 | 10 | 32 |
| 230 | Complex_Kaleido_5 | 43.275 | 3.985 | 90.8% | 64.424 | 13.922 | 14 | 42 |
| 231 | Spiralus2 | 65.547 | 13.699 | 79.1% | 87.194 | 27.724 | 10 | 32 |
| 232 | Hot_Blob | 74.757 | 8.027 | 89.3% | 95.036 | 18.901 | 9 | 42 |
| 233 | Caleido3 | 76.379 | 8.131 | 89.4% | 98.070 | 17.987 | 9 | 42 |
| 234 | Waves | 54.055 | 4.446 | 91.8% | 77.425 | 14.282 | 12 | 42 |
| 235 | Chasing_Spirals | 64.482 | 4.991 | 92.3% | 88.198 | 14.915 | 10 | 42 |
| 236 | Rotating_Blob | 98.702 | 8.954 | 90.9% | 120.511 | 19.051 | 7 | 42 |
| 237 | Center_Field | 55.622 | 4.140 | 92.6% | 78.449 | 14.206 | 12 | 42 |
| 238 | Distance_Experiment | 56.612 | 5.896 | 89.6% | 79.462 | 15.727 | 11 | 42 |
| 239 | Lava1 | 65.207 | 7.345 | 88.7% | 88.046 | 17.018 | 10 | 42 |
| 240 | Caleido2 | 75.315 | 7.915 | 89.5% | 99.429 | 18.084 | 9 | 42 |
| 241 | Yves | 76.034 | 7.199 | 90.5% | 98.794 | 17.667 | 9 | 42 |
| 242 | Scaledemo1 | 57.224 | 6.121 | 89.3% | 80.348 | 15.425 | 11 | 42 |
| 243 | Zoom | 41.600 | 2.740 | 93.4% | 67.216 | 12.593 | 13 | 42 |
| 244 | Complex_Kaleido | 76.288 | 8.880 | 88.4% | 100.666 | 18.494 | 9 | 42 |
| 245 | RGB_Blobs3 | 70.109 | 8.572 | 87.8% | 93.638 | 18.352 | 10 | 42 |
| 246 | SM5 | 94.552 | 11.213 | 88.1% | 118.728 | 22.309 | 7 | 39 |
| 247 | Module_Experiment10 | 111.331 | 13.507 | 87.9% | 136.139 | 22.939 | 6 | 35 |

## Shared-stage medians across kernels

| Stage | R1 ms | R4 ms |
|---|---:|---:|
| Kernel | 70.240 | 8.329 |
| Palette | 11.869 | 0.374 |
| Audio | 2.883 | 1.240 |
| AUX | 0.135 | 0.122 |
| Unaccounted | 6.857 | 6.665 |

## Visual and runtime evidence

Golden replay compared 57,344 pixels; 57,342 were exact (99.996512%). Mean absolute channel error 0.00013929; p95 0; max 12. The two differing samples were single red-channel excursions in Parametric_Water across the four offline test states.

Live telemetry passed 28/28 kernels with no restart-count change. Median sampled free heap was 128420 bytes on R1 and 127350 on R4. AUX DDP remained live. Exact Release07 recovery passed.

R4 is a broad material performance improvement. Foundation remains unqualified: true frame tails, heap low-watermark/largest block, observer effect, control/audio feature regression, and unattended soak have not yet been qualified.
