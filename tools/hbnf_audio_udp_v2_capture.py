#!/usr/bin/env python3
"""Capture WLED AudioReactive UDP Sound Sync v2 feature packets only.

The capture stores no PCM/audio recording. It binds one multicast listener and
records sampleSmth, samplePeak and the sixteen FFT bytes with source/timestamps.
It never contacts or changes WLED configuration.
"""
from __future__ import annotations

import argparse
import json
import socket
import struct
import time
from datetime import datetime, timezone
from pathlib import Path

GROUP = "239.0.0.1"
PORT = 11988
HEADER = b"00002\0"
PACKET_SIZE = 44


def parse_packet(packet: bytes) -> dict:
    if len(packet) != PACKET_SIZE:
        raise ValueError(f"expected {PACKET_SIZE} bytes, got {len(packet)}")
    if packet[:6] != HEADER:
        raise ValueError("not WLED AudioReactive UDP Sound Sync v2")
    return {
        "sample_raw": struct.unpack_from("<f", packet, 8)[0],
        "sample_smth": struct.unpack_from("<f", packet, 12)[0],
        "sample_peak": packet[16] != 0,
        "fft_result": list(packet[18:34]),
        "fft_magnitude": struct.unpack_from("<f", packet, 36)[0],
        "fft_major_peak": struct.unpack_from("<f", packet, 40)[0],
    }


def capture(path: Path, seconds: float, *, matrix_ip: str, release_id: str,
            firmware_sha256: str, matrix_mac: str, group: str = GROUP,
            port: int = PORT, iface_ip: str = "0.0.0.0") -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("", port))
    membership = socket.inet_aton(group) + socket.inet_aton(iface_ip)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, membership)
    sock.settimeout(1.0)
    deadline = time.monotonic() + seconds
    count = 0
    try:
        with path.open("w", encoding="utf-8") as out:
            metadata = {
                "record_type": "capture_metadata",
                "schema": "hbnf-audioreactive-udp-v2-capture-v1",
                "captured_at_utc": datetime.now(timezone.utc).isoformat(),
                "transport": "WLED AudioReactive UDP Sound Sync v2 multicast",
                "multicast_group": group,
                "port": port,
                "expected_source_ip": matrix_ip,
                "expected_source_mac": matrix_mac,
                "release_id": release_id,
                "firmware_sha256": firmware_sha256,
                "duration_seconds": seconds,
                "sample_fields": ["sample_raw", "sample_smth", "sample_peak", "fft_result[16]", "fft_magnitude", "fft_major_peak"],
                "audio_recording": False,
            }
            out.write(json.dumps(metadata, separators=(",", ":")) + "\n")
            while time.monotonic() < deadline:
                try:
                    packet, (src_ip, src_port) = sock.recvfrom(256)
                except TimeoutError:
                    continue
                received_at = datetime.now(timezone.utc).isoformat()
                if src_ip != matrix_ip:
                    out.write(json.dumps({"record_type":"rejected_packet","source_ip":src_ip,
                                          "source_port":src_port,"bytes":len(packet),
                                          "reason":"unexpected source IP","received_at_utc":received_at},
                                         separators=(",", ":")) + "\n")
                    continue
                try:
                    features = parse_packet(packet)
                except ValueError as exc:
                    out.write(json.dumps({"record_type": "rejected_packet", "source_ip": src_ip,
                                          "source_port": src_port, "bytes": len(packet),
                                          "reason": str(exc), "received_at_utc": received_at},
                                         separators=(",", ":")) + "\n")
                    continue
                count += 1
                out.write(json.dumps({"record_type": "sample", "sequence": count,
                                      "received_at_utc": received_at,
                                      "monotonic_seconds": time.monotonic(),
                                      "source_ip": src_ip, "source_port": src_port,
                                      **features}, separators=(",", ":")) + "\n")
                if count % 100 == 0:
                    out.flush()
            out.flush()
    finally:
        sock.close()
    return count


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--seconds", type=float, default=120)
    ap.add_argument("--matrix-ip", required=True)
    ap.add_argument("--matrix-mac", required=True)
    ap.add_argument("--release-id", required=True)
    ap.add_argument("--firmware-sha256", required=True)
    ap.add_argument("--iface-ip", default="0.0.0.0")
    args = ap.parse_args()
    n = capture(args.out, args.seconds, matrix_ip=args.matrix_ip,
                matrix_mac=args.matrix_mac, release_id=args.release_id,
                firmware_sha256=args.firmware_sha256, iface_ip=args.iface_ip)
    print(json.dumps({"result": "PASS" if n else "NO_PACKETS", "samples": n,
                      "out": str(args.out)}))
    return 0 if n else 2


if __name__ == "__main__":
    raise SystemExit(main())
