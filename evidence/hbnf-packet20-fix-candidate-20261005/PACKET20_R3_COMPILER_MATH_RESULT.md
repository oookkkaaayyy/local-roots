# Packet20 R3 compiler/math controlled A/B result

## Outcome

**No material improvement demonstrated.** The required compiler/math delta was built once with the pinned WLED 16.0.1 `Speed_Flags` and `-fsingle-precision-constant`, but the application exceeded the stock OTA partition: 1,696,369 bytes versus 1,572,864 allowed (123,505 bytes over). The candidate was rejected before promotion; there is no admissible R3 BIN, no device install, and no R3 sweep. Therefore no paired R1/R3 device metrics exist and the speed hypothesis remains unconfirmed.

## Aggregate metrics

| Metric | r1 baseline | r3 |
|---|---:|---:|
| Median kernel time | 70.24025 ms | Not measured (no admissible BIN) |
| Median whole-frame time | 93.01575 ms | Not measured (no admissible BIN) |
| Median FPS | 10 | Not measured (no admissible BIN) |

No per-kernel r3 results, tails, or improvement/regression counts are reported because no live trial occurred.

## Controlled delta verified

- Exact r1 renderer/source lineage and full successful clean-room dependency/vendor/generated-input closure were reused. Source identities: r1 usermod SHA-256 `175541d69b1838e8e0ccd0adf623f8b34793c20ad25e0b1b43c13ecb4d5639a9`; candidate source SHA-256 `e8f2b185a72aa880d6cb3cc07d4d6a774a69449e1184f49b6bd00d2f9cb8e1ee`.
- Exact WLED base: v16.0.1, source commit `29b389df1c1aaec6ff53aea742d17063b985906c`.
- Effective r1 flags used `-Os`; effective r3 flags removed `-Os` and applied WLED Speed_Flags: `-O2 -free -fipa-pta -fno-jump-tables -fno-tree-switch-conversion -freorder-blocks -Wwrite-strings -fstrict-volatile-bitfields`, plus `-fsingle-precision-constant`.
- r2 trig-cache patch absent; no source-level effect/math changes were introduced.
- Compiler flag proof and source/build closure are recorded in the R3 build capsule and run logs. The successful compile reached the linker and was rejected only by the existing image-size gate.

## Next class-level investigation

Offline source profiling is complete for the exact r1-bound ANIMartRIX header and exact 28-kernel inventory. Static source tracing estimates 45,056 `render_value()` calls per complete 28-kernel pass, each adding one `pnoise()` call, plus 280 oscillator-noise calls; per-kernel counts are in `r3-offline-profile/PACKET20_R3_STATIC_CALL_COUNTS.json`. All audited `render_value()` calls are inside the 32x16 pixel loops, while z is invariant across pixels for each effect layer.

The offline call-count and math audit is complete. A lower-z-plane `pnoise()` simplification for `fade(z) == 0` was explored as a host-only probe: sampled outputs were bitwise equal for 3,072 inputs and two balanced microbenchmark runs were promising (base/branch medians 17.77/8.66–8.76 ns per `pnoise()` call and 18.88–19.09/15.53–15.72 ns per `render_value()` call). This remains exploratory host-only evidence. The current repository control authority supersedes this ad-hoc prototype and selects the FastLED 3.10.4 optimized Animartrix architecture as the next class-level investigation: bounded fixed-point render/noise/trig primitives and effect variants backported into pinned WLED 16.0.1. That source audit/backport is selected in control state but is not yet integrated or qualified.

## Current device and lifecycle

- Matrix remains exact Release07: `hbnf-matrix-coordinated-v1-20261002-07`, SHA-256 `8e8db17786b178fc8f8cd2cdf8a21512681ec7158941ee49ea255509970b1bcab`.
- Lifecycle remains `FIX_CANDIDATE`; Foundation remains unqualified. Live mutation remains closed.
- R3 failure run: [GitHub Actions run 37347074583](https://github.com/oookkkaaayyy/local-roots/actions/runs/37347074583). Initial preflight parser false rejection, corrected before the single compilation: [run 37344887644](https://github.com/oookkkaaayyy/local-roots/actions/runs/37344887644).

## Evidence

- `r3-build-capsule.json` — input/source/build authority capsule.
- `r3-offline-profile/R3_RESULT.json` — machine-readable experiment result.
- `r3-offline-profile/PACKET20_R3_STATIC_CALL_COUNTS.json` — complete per-kernel source-level call counts.
- `r3-offline-profile/HOST_MICROBENCH_RESULTS.json` — two balanced host benchmark runs and limits.
- Exact bound header: `evidence/hbnf-packet20-fresh-20261005/source-bound-package/ANIMartRIX.patched.h`.
