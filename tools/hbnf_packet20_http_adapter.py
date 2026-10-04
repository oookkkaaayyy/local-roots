#!/usr/bin/env python3
"""Exact HTTP adapter for the HBNF Packet20 renderer-safe diagnostic firmware.

This tool is deliberately narrow. It translates the generic bounded sweep runner
contract into the Packet20 firmware's existing WLED JSON-state API.

It does NOT flash firmware, publish releases, touch the router, or retry a failed
Packet20 session. The firmware supports one volatile snapshot per boot. If a
snapshot already exists and has not been successfully restored, this adapter
fails closed and requires an intentional diagnostic reboot before another run.

The generic sweep runner calls snapshot twice:
1. once before the sweep;
2. once after restore to compare pre/post receipts.

Packet20 itself intentionally refuses a second snapshot while the first saved
snapshot remains valid. Therefore the second adapter "snapshot" call returns the
original immutable (snapshotId, snapshotHash) receipt only after firmware has
reported restoreVerified=true and diagnostic mode has ended. The in-firmware
packet20Same() check is the authoritative exact state-restore verification.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

EXPECTED_RELEASE_ID = "hbnf-matrix-coordinated-v1-20261002-07"
DEFAULT_MATRIX_URL = "http://192.168.77.10"
DEFAULT_AUX_URL = "http://192.168.77.11"
EFFECT_ID_FIRST = 220
KERNEL_NAMES = [
    "Complex_Kaleido_3",
    "Big_Caleido",
    "Parametric_Water",
    "RGB_Blobs5",
    "Polar_Waves",
    "Zoom2",
    "Complex_Kaleido_4",
    "Complex_Kaleido_6",
    "Water",
    "RGB_Blobs4",
    "Complex_Kaleido_5",
    "Spiralus2",
    "Hot_Blob",
    "Caleido3",
    "Waves",
    "Chasing_Spirals",
    "Rotating_Blob",
    "Center_Field",
    "Distance_Experiment",
    "Lava1",
    "Caleido2",
    "Yves",
    "Scaledemo1",
    "Zoom",
    "Complex_Kaleido",
    "RGB_Blobs3",
    "SM5",
    "Module_Experiment10",
]


class AdapterError(RuntimeError):
    pass


def _base(url: str) -> str:
    return str(url).rstrip("/")


def effect_to_kernel(effect_id: int) -> int:
    kernel = int(effect_id) - EFFECT_ID_FIRST
    if kernel < 0 or kernel >= len(KERNEL_NAMES):
        raise AdapterError(
            f"effect id {effect_id} is outside exact Packet20 range "
            f"{EFFECT_ID_FIRST}..{EFFECT_ID_FIRST + len(KERNEL_NAMES) - 1}"
        )
    return kernel


def kernel_name(kernel: int) -> str:
    if kernel < 0 or kernel >= len(KERNEL_NAMES):
        raise AdapterError(f"kernel index {kernel} is outside exact Packet20 range 0..27")
    return KERNEL_NAMES[kernel]


def _http_json(
    url: str,
    *,
    body: Optional[Dict[str, Any]] = None,
    timeout: float = 3.0,
) -> Dict[str, Any]:
    data = None
    headers = {
        "Accept": "application/json",
        "Cache-Control": "no-cache",
    }
    if body is not None:
        data = json.dumps(body, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise AdapterError(f"HTTP failure for {url}: {type(exc).__name__}: {exc}") from exc
    try:
        parsed = json.loads(raw)
    except Exception as exc:
        raise AdapterError(f"non-JSON response from {url}: {raw[:240]!r}") from exc
    if not isinstance(parsed, dict):
        raise AdapterError(f"JSON response from {url} is not an object")
    return parsed


def _get_state(matrix_url: str, timeout: float) -> Dict[str, Any]:
    return _http_json(f"{_base(matrix_url)}/json/state", timeout=timeout)


def _get_info(url: str, timeout: float) -> Dict[str, Any]:
    return _http_json(f"{_base(url)}/json/info", timeout=timeout)


def _post_packet20(matrix_url: str, op: str, timeout: float, **fields: Any) -> None:
    command: Dict[str, Any] = {"op": op}
    command.update(fields)
    _http_json(
        f"{_base(matrix_url)}/json/state",
        body={"HBNF": {"packet20Diagnostic": command}},
        timeout=timeout,
    )


def _hbnf(state: Dict[str, Any]) -> Dict[str, Any]:
    value = state.get("HBNF")
    if not isinstance(value, dict):
        raise AdapterError("Matrix /json/state is missing HBNF object")
    return value


def _p20(state: Dict[str, Any]) -> Dict[str, Any]:
    value = _hbnf(state).get("packet20Diagnostic")
    if not isinstance(value, dict):
        raise AdapterError(
            "Matrix firmware does not expose HBNF.packet20Diagnostic; "
            "wrong firmware or diagnostics not compiled"
        )
    return value


def _require_release(state: Dict[str, Any]) -> Dict[str, Any]:
    h = _hbnf(state)
    actual = str(h.get("candidate") or "")
    if actual != EXPECTED_RELEASE_ID:
        raise AdapterError(
            f"release identity mismatch: expected {EXPECTED_RELEASE_ID!r}, got {actual!r}"
        )
    return h


def _as_int(value: Any, label: str) -> int:
    if isinstance(value, bool):
        raise AdapterError(f"{label} is boolean, expected integer")
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise AdapterError(f"{label} is missing or not an integer: {value!r}") from exc


def _as_float(value: Any, label: str) -> float:
    if isinstance(value, bool):
        raise AdapterError(f"{label} is boolean, expected number")
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise AdapterError(f"{label} is missing or not numeric: {value!r}") from exc


def snapshot_receipt(state: Dict[str, Any]) -> Dict[str, int]:
    p20 = _p20(state)
    if not bool(p20.get("snapshotValid")):
        raise AdapterError("Packet20 snapshot is not valid")
    sid = _as_int(p20.get("snapshotId"), "packet20Diagnostic.snapshotId")
    shash = _as_int(p20.get("snapshotHash"), "packet20Diagnostic.snapshotHash")
    if sid <= 0 or shash <= 0:
        raise AdapterError(f"invalid Packet20 snapshot receipt id={sid} hash={shash}")
    return {"snapshotId": sid, "snapshotHash": shash}


def _wait_state(
    matrix_url: str,
    timeout_http: float,
    wait_seconds: float,
    predicate,
    description: str,
) -> Dict[str, Any]:
    deadline = time.monotonic() + wait_seconds
    last: Optional[Dict[str, Any]] = None
    while time.monotonic() < deadline:
        state = _get_state(matrix_url, timeout_http)
        _require_release(state)
        last = state
        if predicate(state):
            return state
        time.sleep(0.12)
    if last is None:
        raise AdapterError(f"timed out waiting for {description}; no state response")
    p20 = _p20(last)
    raise AdapterError(
        f"timed out waiting for {description}; "
        f"snapshotState={p20.get('snapshotState')!r} "
        f"enabled={p20.get('enabled')!r} "
        f"lastCommand={p20.get('lastCommand')!r} "
        f"lastCommandAccepted={p20.get('lastCommandAccepted')!r}"
    )


def command_snapshot(args: argparse.Namespace) -> Dict[str, int]:
    state = _get_state(args.matrix_url, args.http_timeout)
    _require_release(state)
    p20 = _p20(state)

    # The generic runner calls snapshot again after restore. Packet20 itself
    # permits only one saved snapshot per boot, so return the immutable receipt
    # only after firmware's exact restore verifier has passed.
    if bool(p20.get("snapshotValid")):
        if bool(p20.get("restoreVerified")) and not bool(p20.get("enabled")):
            return snapshot_receipt(state)
        raise AdapterError(
            "a Packet20 snapshot already exists but is not in the verified-restored "
            "terminal state; do not retry this boot. Reboot intentionally before a "
            "new authorized diagnostic session"
        )

    snapshot_state = str(p20.get("snapshotState") or "")
    if snapshot_state not in {"", "IDLE"}:
        raise AdapterError(
            f"unexpected pre-snapshot state {snapshot_state!r}; do not retry this boot"
        )

    if not bool(p20.get("enabled")):
        _post_packet20(args.matrix_url, "begin", args.http_timeout)
        state = _wait_state(
            args.matrix_url,
            args.http_timeout,
            args.wait_seconds,
            lambda s: bool(_p20(s).get("enabled"))
            and _p20(s).get("lastCommand") == "begin"
            and bool(_p20(s).get("lastCommandAccepted")),
            "Packet20 diagnostic begin",
        )
        p20 = _p20(state)

    if bool(p20.get("snapshotValid")):
        raise AdapterError("snapshot became valid unexpectedly before snapshot command")

    _post_packet20(args.matrix_url, "snapshot", args.http_timeout)
    state = _wait_state(
        args.matrix_url,
        args.http_timeout,
        args.wait_seconds,
        lambda s: str(_p20(s).get("snapshotState") or "") in {"READY", "FAILED"},
        "renderer-safe Packet20 snapshot",
    )
    p20 = _p20(state)
    if str(p20.get("snapshotState")) == "FAILED":
        raise AdapterError("Packet20 firmware reported snapshotState=FAILED")
    if p20.get("lastCommand") != "snapshot" or not bool(p20.get("lastCommandAccepted")):
        raise AdapterError("snapshot reached terminal state without an accepted snapshot command")
    return snapshot_receipt(state)


def command_select(args: argparse.Namespace) -> Dict[str, Any]:
    effect_id = int(args.effect_id)
    kernel = effect_to_kernel(effect_id)
    state = _get_state(args.matrix_url, args.http_timeout)
    _require_release(state)
    p20 = _p20(state)
    if not bool(p20.get("enabled")):
        raise AdapterError("Packet20 diagnostic mode is not active")
    if str(p20.get("snapshotState") or "") != "READY" or not bool(p20.get("snapshotValid")):
        raise AdapterError("Packet20 snapshot is not READY; selection is refused")

    _post_packet20(args.matrix_url, "select", args.http_timeout, kernel=kernel)
    state = _wait_state(
        args.matrix_url,
        args.http_timeout,
        args.wait_seconds,
        lambda s: (
            bool(_p20(s).get("enabled"))
            and bool(_p20(s).get("lastCommandAccepted"))
            and _p20(s).get("lastCommand") == "select"
            and _as_int(_p20(s).get("selectedKernel"), "selectedKernel") == kernel
            and _as_int(_hbnf(s).get("kernel"), "HBNF.kernel") == kernel
        ),
        f"kernel selection {kernel}",
    )
    return {
        "ok": True,
        "effectId": effect_id,
        "kernel": kernel,
        "kernelName": kernel_name(kernel),
        "variantSignature": _hbnf(state).get("variantSignature"),
    }


def normalize_telemetry(
    state: Dict[str, Any],
    matrix_info: Dict[str, Any],
    aux_info: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    h = _require_release(state)
    p20 = _p20(state)
    timing = h.get("timing")
    if not isinstance(timing, dict):
        raise AdapterError("HBNF.timing object is missing")

    kernel = _as_int(
        timing.get("kernel") if timing.get("kernel") is not None else h.get("kernel"),
        "HBNF timing kernel",
    )
    if kernel < 0 or kernel >= len(KERNEL_NAMES):
        raise AdapterError(f"runtime kernel index out of range: {kernel}")

    whole_us = _as_float(timing.get("wholeFrameUs"), "timing.wholeFrameUs")
    kernel_us = _as_float(timing.get("kernelRenderUs"), "timing.kernelRenderUs")
    palette_us = _as_float(timing.get("paletteColorUs"), "timing.paletteColorUs")
    audio_us = _as_float(timing.get("audioModulationUs"), "timing.audioModulationUs")
    overlay_us = _as_float(timing.get("overlayUs"), "timing.overlayUs")
    companion_us = _as_float(timing.get("companionPrepUs"), "timing.companionPrepUs")
    ddp_us = _as_float(timing.get("companionDdpSendUs"), "timing.companionDdpSendUs")
    unaccounted_us = _as_float(timing.get("unaccountedUs"), "timing.unaccountedUs")

    leds = matrix_info.get("leds")
    if not isinstance(leds, dict):
        leds = {}
    ws = matrix_info.get("ws")
    if ws is None:
        ws = 0

    aux_reachable = isinstance(aux_info, dict)
    aux_fps = 0.0
    if aux_reachable:
        aux_leds = aux_info.get("leds")
        if isinstance(aux_leds, dict) and aux_leds.get("fps") is not None:
            aux_fps = _as_float(aux_leds.get("fps"), "AUX leds.fps")

    companion_count = _as_int(h.get("companionRenderCount"), "HBNF.companionRenderCount")
    aux_active = bool(aux_reachable and companion_count > 0 and aux_fps > 0.0)

    # restart_count is a contract field. Packet20 has no cumulative reboot
    # counter, so use a fixed session sentinel. The generic sweep runner's
    # monotonic uptime guard is the authoritative mid-sweep reboot detector.
    result: Dict[str, Any] = {
        "release_id": str(h.get("candidate") or ""),
        "uptime_seconds": _as_float(timing.get("uptimeSec"), "timing.uptimeSec"),
        "fps": _as_float(timing.get("fps"), "timing.fps"),
        "frame_ms_avg": whole_us / 1000.0,
        "kernel_id": kernel,
        "kernel_name": kernel_name(kernel),
        "variant_id": h.get("variantSignature"),
        "kernel_ms_avg": kernel_us / 1000.0,
        "palette_ms_avg": palette_us / 1000.0,
        "audio_ms_avg": audio_us / 1000.0,
        "overlay_ms_avg": overlay_us / 1000.0,
        "aux_prepare_send_ms_avg": (companion_us + ddp_us) / 1000.0,
        "unaccounted_ms_avg": unaccounted_us / 1000.0,
        "free_heap_bytes": _as_int(timing.get("freeHeap"), "timing.freeHeap"),
        "websocket_clients": _as_int(ws, "Matrix info.ws"),
        "aux_projection_active": aux_active,
        "aux_render_fps": aux_fps,
        "wifi_rssi_dbm": _as_int(timing.get("rssi"), "timing.rssi"),
        "restart_count": 0,
        # Extra evidence fields retained in raw JSONL but ignored by the
        # generic diagnostic profiler.
        "packet20_snapshot_id": p20.get("snapshotId"),
        "packet20_snapshot_hash": p20.get("snapshotHash"),
        "packet20_snapshot_state": p20.get("snapshotState"),
        "packet20_restore_verified": bool(p20.get("restoreVerified")),
        "packet20_reset_reason_core0": p20.get("resetReasonCore0"),
        "packet20_reset_reason_core1": p20.get("resetReasonCore1"),
        "packet20_esp_reset_reason": p20.get("espResetReason"),
        "packet20_timing_semantics": "latest_completed_frame_profiled_over_samples",
        "matrix_info_led_fps": leds.get("fps"),
    }
    if result["variant_id"] is None:
        raise AdapterError("HBNF.variantSignature is missing")
    return result


def command_telemetry(args: argparse.Namespace) -> Dict[str, Any]:
    state = _get_state(args.matrix_url, args.http_timeout)
    matrix_info = _get_info(args.matrix_url, args.http_timeout)
    aux_info: Optional[Dict[str, Any]]
    try:
        aux_info = _get_info(args.aux_url, args.http_timeout)
    except AdapterError:
        # AUX controller reachability is diagnostic data, not a reason to hide
        # the Matrix sample. The resulting sample reports AUX inactive/0 FPS.
        aux_info = None
    return normalize_telemetry(state, matrix_info, aux_info)


def command_restore(args: argparse.Namespace) -> Dict[str, int]:
    try:
        expected = json.loads(open(args.snapshot, "r", encoding="utf-8").read())
    except Exception as exc:
        raise AdapterError(f"cannot read snapshot receipt {args.snapshot!r}: {exc}") from exc
    if not isinstance(expected, dict):
        raise AdapterError("snapshot receipt file is not a JSON object")
    expected_id = _as_int(expected.get("snapshotId"), "snapshot receipt snapshotId")
    expected_hash = _as_int(expected.get("snapshotHash"), "snapshot receipt snapshotHash")

    state = _get_state(args.matrix_url, args.http_timeout)
    _require_release(state)
    p20 = _p20(state)
    current = snapshot_receipt(state)
    if current != {"snapshotId": expected_id, "snapshotHash": expected_hash}:
        raise AdapterError(
            f"device snapshot receipt {current} does not match runner receipt "
            f"{{'snapshotId': {expected_id}, 'snapshotHash': {expected_hash}}}"
        )
    if not bool(p20.get("enabled")):
        raise AdapterError("Packet20 diagnostic mode ended before restore")

    _post_packet20(
        args.matrix_url,
        "restore",
        args.http_timeout,
        snapshotId=expected_id,
    )
    state = _wait_state(
        args.matrix_url,
        args.http_timeout,
        args.wait_seconds,
        lambda s: (
            str(_p20(s).get("snapshotState") or "") == "FAILED"
            or bool(_p20(s).get("restoreVerified"))
        ),
        "Packet20 exact state restore verification",
    )
    p20 = _p20(state)
    if str(p20.get("snapshotState")) == "FAILED":
        raise AdapterError("Packet20 firmware reported snapshot/restore verification FAILED")
    if not bool(p20.get("restoreVerified")):
        raise AdapterError("Packet20 restore did not verify")
    if bool(p20.get("enabled")):
        raise AdapterError("Packet20 diagnostic mode remained active after verified restore")
    current = snapshot_receipt(state)
    if current != {"snapshotId": expected_id, "snapshotHash": expected_hash}:
        raise AdapterError("snapshot receipt changed during restore")
    return current


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--matrix-url", default=DEFAULT_MATRIX_URL)
    parser.add_argument("--aux-url", default=DEFAULT_AUX_URL)
    parser.add_argument("--http-timeout", type=float, default=3.0)
    parser.add_argument("--wait-seconds", type=float, default=8.0)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("snapshot")

    select = sub.add_parser("select")
    select.add_argument("--effect-id", required=True, type=int)

    sub.add_parser("telemetry")

    restore = sub.add_parser("restore")
    restore.add_argument("--snapshot", required=True)
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "snapshot":
            result = command_snapshot(args)
        elif args.command == "select":
            result = command_select(args)
        elif args.command == "telemetry":
            result = command_telemetry(args)
        elif args.command == "restore":
            result = command_restore(args)
        else:
            raise AdapterError(f"unsupported command {args.command!r}")
    except AdapterError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True), file=sys.stderr)
        return 2

    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
