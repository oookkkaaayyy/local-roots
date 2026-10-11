#!/usr/bin/env python3
"""Prove the compositor diagnostic is bound into existing timing telemetry."""
from pathlib import Path
import hashlib
import json

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
receipt_path = ROOT / "evidence/cart2-r6-compositor-timing-diagnostic-20261011/BUILD_RECEIPT.json"
receipt = json.loads(receipt_path.read_text())
binding_path = ROOT / "firmware/phase2/integration-r6-compositor-timing/SOURCE_BINDING.json"
binding = json.loads(binding_path.read_text())
analysis_path = ROOT / "evidence/cart2-r6-compositor-timing-diagnostic-20261011/COMPOSITOR_TIMING_OFFLINE_ANALYSIS.json"
analysis = json.loads(analysis_path.read_text())
assert analysis["candidate"]["source_commit"] == receipt["source_commit"]
assert analysis["source_binding"]["measured_source_tree_sha256"] == receipt["runtime_source_tree_sha256"] == binding["runtime_source_tree_sha256"]
assert analysis["source_binding"]["source_sha256"]["usermod_hbnf_foundation_v1.cpp"] == binding["runtime_files_sha256"]["usermod_hbnf_foundation_v1.cpp"]
assert analysis["source_binding"]["later_failed_candidate"]["directly_measured_by_this_artifact"] is False
artifact = ROOT / "evidence/cart2-r6-compositor-timing-diagnostic-20261011/artifact" / f"{release}.bin"
binary = artifact.read_bytes()
assert hashlib.sha256(binary).hexdigest() == receipt["artifact"]["sha256"]
assert binary.count(release.encode()) == 3
assert b"hbnf-cart2-phase2-offline-wow-r6-compositor-hoist-20261011" not in binary
assert receipt["status"] == "OFFLINE_BUILD_VERIFIED__NOT_LIVE_QUALIFIED__NOT_ACCEPTED"
print("PASS: compositor timing runs only during tail capture, separates the exclusive kernel residual, and preserves the frozen gate metric")
