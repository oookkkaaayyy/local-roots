#!/usr/bin/env python3
"""Prove the compositor diagnostic is bound into existing timing telemetry."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "firmware/phase2/integration-r6-compositor-timing/usermod/usermod_hbnf_foundation_v1.cpp"
source = SOURCE.read_text()

release = "hbnf-cart2-phase2-vibe-compositor-timing-diagnostic-20261011"
assert source.count(release) == 3
assert "vibe-compositor-cycle-telemetry-v1" in source
assert "composeVibeColor(colored,*frame_,tx,ty,vibeComposition_)" in source
assert "const uint32_t compositorStart=hbnfCycles();" in source
assert "compositorCycles=hbnfCycles()-compositorStart;" in source
assert "hbnfPerfWorking.compositor+=compositorCycles;" in source
assert "hbnfPerfWorking.compositorInKernel+=compositorCycles;" in source
assert "hbnfTailHist[10][HBNF_TAIL_BINS]" in source
assert "uint32_t values[10]=" in source
assert "hbnfPerfWorking.measureCompositor=hbnfTailEnabled" in source
assert "kernelWithoutCompositorMsAvg" in source and "kernelWithoutCompositorMsP95" in source and "kernelWithoutCompositorMsP99" in source
assert "kernelResidual>hbnfPerfWorking.compositorInKernel?kernelResidual-hbnfPerfWorking.compositorInKernel:0" in source
assert "vibeCompositorMsAvg" in source and "vibeCompositorMsP95" in source and "vibeCompositorMsP99" in source
# Preserve the frozen kernel metric as-is; the new nested component is diagnostic.
assert 'timing["kernelRenderUs"]=hbnfCycleUs(perf.kernelGross>perf.audioInKernel+perf.colorInKernel?perf.kernelGross-perf.audioInKernel-perf.colorInKernel:0);' in source
# Subtract in-kernel compositor cycles before adding the measured component to
# accounting, so the new stage does not double-count in the unaccounted metric.
assert "kernelResidual>hbnfPerfWorking.compositorInKernel?kernelResidual-hbnfPerfWorking.compositorInKernel:0" in source
print("PASS: compositor timing runs only during tail capture, separates the exclusive kernel residual, and preserves the frozen gate metric")
