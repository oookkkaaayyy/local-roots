# Foundation Offline Resume Plan — 2026-10-05

Status: PREPARED OFFLINE ONLY. The cart is away. No device, LAN, SSH, OTA, soak, or live-mutation action is authorized by this checkpoint. `config/HBNF_CONTROL_STATE.json` remains `live_mutation_authorized=false`; seq33/34 remain unallocated.

## Frozen inputs currently staged

- Foundation-metrics candidate: `hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1`
- Candidate BIN: `/Users/andrew/Downloads/HBNF-Foundation-Crash-Recovery-20261005/artifact/firmware.bin`
- Candidate SHA-256 / size: `6285f1fde93edf74038e718dee519df5340ec27a9c18bef6075562b272894338` / `1,488,768` bytes
- Candidate source commit: `b18b162ec4b4f9173b1de892957ff8b834fe2b50`; artifact transfer commit: `52f2252d680bcb67273929916b5f444d8fb9cda4`; transferred BIN hash independently matched.
- Exact Release07 recovery BIN: `/Users/andrew/Downloads/HBNF-Foundation-Crash-Recovery-20261005/artifact/release07.bin`
- Release07 SHA-256 / size: `8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab` / `1,458,624` bytes. Durable Drive artifact ID: `12S4GPHMvryTIXKjtXsTyeatmfPzRWiTo`.
- Exact 28-entry inventory: `config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json`.
- Foundation adapter: `config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_20261005.json`; explicit absolute inventory path; outer timeout is 240s, exceeding the 226s maximum ordinary snapshot composition by 14s. Restore composition is bounded at 175s.

## Next live session, only after Andrew explicitly resumes

1. Before touching the device, resolve the still-null Foundation performance/stop thresholds only from the project’s accepted baseline/threshold authority, and produce the qualified Foundation baseline profile. Run `hbnf_foundation_threshold_freeze.py --validate-inputs-only` on those files. The integrated runner refuses to proceed without them; do not install the candidate and discover this prerequisite late.
2. After explicit resume and cart return to the trusted LAN, perform one guarded read-only preflight that verifies Matrix MAC/identity, exact Release07 runtime identity/health, AUX continuity, candidate and recovery local hashes/sizes, host disk headroom, and control state. Do not begin if any check is ambiguous. Do not repeat historical completed preflights or reread updater high-water except where the current guarded transaction explicitly requires it.
3. Freeze a new bounded guarded transaction through the repository control plane; seq33/34 are prospective only and may be allocated only by that guard after resume. Keep mutation closed outside that transaction.
4. Install the exact candidate once using the proven direct-LAN OTA path. Verify runtime release identity and candidate build identity before diagnostic mode.
5. Run observer-effect comparison, then the exact 28-kernel foundation sweep, inside one diagnostic boot and one renderer-safe snapshot. Preserve raw telemetry, profile outputs, and the exact pre-state.
6. The integrated runner revalidates the `FROZEN` policy and baseline, writes `PRE_SOAK_SWEEP_MANIFEST.json` from the measured full sweep, and creates a hash receipt binding that measurement to the frozen policy/baseline. It enters soak only if this succeeds. It never chooses thresholds or backfills them after seeing soak results.
7. The same invocation runs the state-changing soak (`--contract foundation --soak-seconds 5400 --soak-interval-seconds 8`) before its single exact renderer restore. Source-bound Packet20 commands permit only one diagnostic session/snapshot per boot: `begin` rejects while `packet20SavedValid` remains true after restore. The integrated path cycles all 28 kernels, durably appends every sample, enforces exact kernel/release identity, uptime/restart continuity, and a maximum 15s sample gap, then restores from the original snapshot. Do not restore and try to begin a second diagnostic session on that boot.
8. Run offline JSONL soak audit and frozen-policy qualification against the saved sweep/soak evidence. Run read-only feature/control, audio, hosted/local, DDP/AUX, reconnect checks in bounded windows that do not compromise diagnostic soak or renderer state. A required reboot/reconnect test is a separate explicitly bounded recovery event, followed by Release07 recovery/verification; do not hide it inside the continuous soak.
9. On any stop condition, preserve raw failure and restore evidence first, then execute the exact signed Release07 recovery seq34 once. Verify exact runtime release and health, close mutation, and preserve evidence. No partial sweep resumes.
10. Package explicit evidence files using `scripts/hbnf_foundation_evidence_pack.py`; its manifest records byte count and SHA-256 for every included file and rejects traversal/symlinks. Validate the exact Release07 recovery receipt and local BIN with `scripts/hbnf_foundation_recovery_audit.py`. Use the existing platform capsule checker/golden-release validator for the final evidence; do not declare a capsule valid while any required provenance or objective gate is absent.

## Integrated runner use (prepared, not executed)

```sh
python3 scripts/hbnf_live_kernel_sweep.py \
  --adapter config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_20261005.json \
  --inventory "$(pwd)/config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json" \
  --outdir evidence/hbnf-foundation-qualification-20261005/seq33 \
  --contract foundation \
  --threshold-policy /absolute/path/to/authorized-frozen-policy.json \
  --threshold-baseline /absolute/path/to/qualified-foundation-baseline.json \
  --soak-seconds 5400 \
  --soak-interval-seconds 8
```

This invocation intentionally does not allocate sequence numbers, install firmware, initiate a device connection, or authorize a transaction. It must be run only after explicit resume and a valid control-plane transaction. Foundation numerical thresholds must be frozen and recorded before its soak phase.

## Offline validation status

- Candidate and Release07 staged BINs match their durable SHA-256 authorities and exact recorded sizes.
- Timeout, JSON/error reporting, disk reserve, atomic restore evidence, and state-changing soak cadence have unit coverage.
- `scripts/hbnf_foundation_soak_audit.py` consumes local JSONL only and does not access devices.
- Threshold-freeze tooling refuses the current null policy template; it can only bind a fully populated `FROZEN` policy to baseline and full-sweep hashes.
- Recovery audit passed against the durable seq32 receipt and the exact local Release07 BIN. Evidence packager passed manifest-hash, traversal, and symlink tests.
- Existing runtime qualification and platform capsule checks remain fail-closed until a valid frozen policy and exact run evidence exist.
