#!/usr/bin/env python3
"""Replay the pinned passive Matrix capture through production Vibe16/AudioExpression."""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_SHA256 = "712dd275bd260ebec2c60c17ed9413bf8d6cd0c58b2121c913916b0944f7e951"
EXPECTED_SOURCE_IP = "192.168.77.10"
EXPECTED_FIRMWARE_SHA256 = "338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
DEFAULT_TRACE = ROOT / "evidence/hbnf-phase2-audioreactive-20261007/real_audio_capture.jsonl"
HOST_TEST = ROOT / "tests/hbnf_audio_expression_real_trace_host.cpp"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--trace", type=Path, default=DEFAULT_TRACE)
    args = parser.parse_args()
    raw = args.trace.read_bytes()
    actual_sha = hashlib.sha256(raw).hexdigest()
    if actual_sha != EXPECTED_SHA256:
        raise SystemExit(f"trace SHA mismatch: expected {EXPECTED_SHA256}, got {actual_sha}")

    records = [json.loads(line) for line in raw.splitlines()]
    metadata = records[0]
    if metadata.get("schema") != "hbnf-audioreactive-udp-v2-capture-v1":
        raise SystemExit("unexpected trace schema")
    if metadata.get("expected_source_ip") != EXPECTED_SOURCE_IP:
        raise SystemExit("unexpected capture source IP")
    if metadata.get("firmware_sha256") != EXPECTED_FIRMWARE_SHA256:
        raise SystemExit("unexpected capture firmware identity")
    if metadata.get("audio_recording") is not False:
        raise SystemExit("capture must remain feature-only, without recorded PCM")

    samples = [record for record in records[1:] if record.get("record_type") == "sample"]
    samples.sort(key=lambda record: record["sequence"])
    if not samples or any(sample.get("source_ip") != EXPECTED_SOURCE_IP for sample in samples):
        raise SystemExit("empty trace or unexpected packet source")
    if any(samples[i]["sequence"] >= samples[i + 1]["sequence"] for i in range(len(samples) - 1)):
        raise SystemExit("sample sequence is not strictly increasing")

    # Sound Sync v2 has no sender timestamp and this capture arrived in OS-buffer
    # bursts. Match the existing trace replay's uniform capture-span time model.
    span = samples[-1]["monotonic_seconds"] - samples[0]["monotonic_seconds"]
    dt = max(0.001, min(0.25, span / max(1, len(samples) - 1)))
    stream = []
    for sample in samples:
        bins = sample["fft_result"]
        if len(bins) != 16 or any(not isinstance(value, int) or not 0 <= value <= 255 for value in bins):
            raise SystemExit("invalid 16-bin FFT sample")
        fields = [*(str(value) for value in bins), repr(float(sample["sample_smth"])), repr(dt)]
        stream.append(" ".join(fields))

    with tempfile.TemporaryDirectory(prefix="hbnf-matrix-audio-trace-") as temp:
        executable = Path(temp) / "audio_expression_trace_host"
        subprocess.run([
            "g++", "-std=c++11", "-O2", "-Wall", "-Wextra", "-Werror",
            str(HOST_TEST), "-o", str(executable),
        ], check=True)
        result = subprocess.run([str(executable)], input="\n".join(stream) + "\n",
                                text=True, check=False, capture_output=True)
        if result.returncode:
            raise SystemExit(f"host trace replay failed ({result.returncode}): {result.stderr.strip()}")

    print(f"PASS trace_sha256={actual_sha} samples={len(samples)} dt_seconds={dt:.9f}")
    print(result.stdout, end="")
    print("NOTE: unlabelled ambient feature trace; no PCM or controlled high-dominant music; host replay only.")


if __name__ == "__main__":
    main()
