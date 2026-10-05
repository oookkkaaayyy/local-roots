# Packet20 bounded fix candidate

## Evidence

Fresh seq21 Packet20 measured all 28 effect kernels once. Median kernel_ms_avg was 70.24025 ms, compared with 11.8685 ms palette, 2.8835 ms audio, 0.135 ms AUX preparation/send, and 6.85675 ms unaccounted. Parametric_Water was the worst case at 167.353 ms kernel and 205.045 ms frame, with 4 FPS median. Timing, heap, RSSI, AUX, runtime identity, and snapshot evidence are in the Packet20 Drive archive recorded in config/HBNF_CONTROL_STATE.json.

The hotspot is the shared ANIMartRIX::render_value() math path. Parametric_Water() calls it repeatedly for different noise layers at the same animation.angle for each pixel. render_value() recomputes both cosf(angle) and sinf(angle) on each call. Kernel time dominates the other measured stages across the inventory.

## Candidate change

animartrix-render-value-trig-cache.patch adds a one-entry cache keyed by the exact 32-bit angle representation. Consecutive layers with identical angle bits reuse the same sine/cosine pair. Signed zero remains distinct. The values used by coordinate conversion and Perlin noise remain the same; only repeated math calls are skipped. The patch is applied after the existing clock correction and is pinned by SHA-256 in the build workflow and artifact provenance.

This is one bounded class-level candidate. The optimization benefit, concurrency assumptions, frame-tail behavior, observer effect, and visual equivalence still require the qualified build and hardware run. Foundation qualification remains closed until its full objective acceptance matrix passes.
