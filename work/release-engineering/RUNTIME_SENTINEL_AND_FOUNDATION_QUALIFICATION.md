# HBNF Runtime Sentinel + Foundation Qualification

STATUS: SOURCE-INDEPENDENT TOOLING IMPLEMENTED / FIRMWARE TELEMETRY INTEGRATION PENDING.

## Purpose
Prevent recurrence of the failure pattern where a build appears acceptable until prolonged human use reveals jerkiness, starvation, memory deterioration, or another runtime defect.

## System design

### 1. Cheap permanent firmware counters
The corrected firmware must expose the canonical metrics in:
- config/HBNF_RUNTIME_TELEMETRY_CONTRACT.json

Production mode must use rolling counters/timers only. No per-frame JSON, serial logging, dynamic allocation, or expensive heap tracing.

Deep tracing stays off unless explicitly enabled for diagnosis.

### 2. Automated qualification runner
scripts/hbnf_runtime_qualify.py:
- can poll a JSON endpoint unattended;
- can analyze captured JSONL;
- records frame-time tails, FPS, heap/fragmentation, AUX health and restarts;
- compares a candidate against a frozen qualified baseline;
- fails closed until comparison thresholds are explicitly frozen.

This converts extended observation from human watching into an unattended machine gate.

### 3. Baseline profile
After the current FPS defect is actually fixed:
1. run the exact corrected candidate through controlled representative kernels/variants;
2. run foundation promotion soak;
3. freeze its runtime profile;
4. approve comparison thresholds;
5. bind profile + policy to the golden release capsule.

No later Cart 2.0 candidate is promoted without comparison to this baseline.

### 4. Qualification cadence
- each integration step: 5-minute automated smoke;
- major integration milestone: 30-minute unattended soak;
- foundation promotion: 90-minute unattended soak;
- final release candidate: 90-minute unattended soak.

Human does not need to watch these runs. Human physical acceptance occurs after the machine gates pass.

### 5. Early anomaly detection
During a run, the final implementation should retain rolling windows so severe regression can stop qualification early instead of wasting the entire soak.

Examples:
- sustained FPS collapse;
- p99/max frame-time spike;
- restart;
- AUX projection age/stall;
- minimum-free-heap or largest-block deterioration.

Absolute early-stop values must be derived/frozen after the corrected foundation is measured; do not invent them from the defective release.

### 6. Lightweight field flight recorder
After qualification, the cart should retain a small rolling health history on the Opal or another non-render-critical component:
- sample every ~30 seconds;
- compact metrics only;
- RAM/tmpfs ring buffer, not high-frequency flash writes;
- preserve a short pre/post anomaly window;
- no cloud dependency required.

This makes a future defect diagnosable from the period BEFORE the user notices it.

## Why this is preferable
- catches tail jitter that average FPS misses;
- catches memory fragmentation that free-heap-only telemetry misses;
- keeps expensive diagnostics out of the normal render loop;
- compares candidate vs known-good baseline;
- makes integration regressions attributable to the immediately preceding change;
- does not require a human to stare at the cart for 90 minutes.

## Pending source-bound work
Once the current FPS-fix task returns:
- map exact telemetry fields/endpoints;
- add missing permanent cheap counters to corrected source;
- measure instrumentation overhead;
- freeze baseline profile and policy;
- add Opal ring-buffer collector against the actual endpoint;
- wire runtime qualification into the release gate.

Do not rebase Cart 2.0 implementation onto the corrected source until this qualification passes.


## 7. Complete retained-kernel sweep — mandatory foundation evidence
The current release-06 evidence isolated RGB_Blobs5 as a dominant kernel cost, but also showed material palette/common-path time. The corrected candidate must therefore be swept across ALL 28 retained kernels before foundation promotion.

Use:
- config/HBNF_KERNEL_SWEEP_MANIFEST_TEMPLATE.json
- scripts/hbnf_runtime_qualify.py for each bounded kernel capture
- scripts/hbnf_kernel_sweep_report.py to enforce complete coverage, rank slow kernels, and summarize shared-stage cost

Foundation fails if:
- fewer than 28 unique retained kernels are measured;
- any required kernel/variant identity is missing;
- any kernel violates the frozen performance envelope;
- a shared hot path remains materially expensive and unexplained;
- instrumentation overhead is not characterized.

Do not serially wait for a human to discover the next slow effect. If multiple failures share one primitive/common path, treat that as one optimization class.

## 8. Common-path audit
The foundation receipt includes a direct common_path_performance_audit_passed check.

Audit at minimum:
- palette/color work;
- audio/modulation;
- scheduler/variant;
- overlay;
- AUX preparation/send;
- unaccounted remainder.

A nonzero stage cost is not itself a defect. Correct it only when measured evidence shows that it materially prevents the qualified performance envelope or exhibits pathological scaling/redundancy.

## 9. Current active repair boundary
Do not mutate or duplicate the active release-07 repair task from this staging lane.
Release 07 remains an external current-repair candidate until its exact final identity/evidence is returned and ingested.
