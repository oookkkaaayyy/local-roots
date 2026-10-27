#!/usr/bin/env python3
"""Add the two default-off single-channel PWM UV buses to the identified AUX.

This is a narrow reversible WLED configuration step. It does not connect or
energize the UV module, open any UV readiness gate, or enable cloud control.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import pathlib
import time
import urllib.error
import urllib.request

TARGET_IP = "192.168.77.11"
TARGET_MAC = "8c94df55c34c"
AUX_RELEASE = "hbnf-wow-aux-r3-2026-10-25-uv-follow-v1"
AUX_ENGINE = "aux-r3-wow-1d"
AUX_WITNESS = "registry28-tempo-lock-1d-v7-network-no-starve-uv-follow"
EXPECTED_VERSION = "16.0.1"
UV_OUTPUTS = ((25, 22, 1), (26, 23, 2))
ACCEPTED_UV_RUNTIME = (1, "uv-follow-output-capable-v1")
ACCEPTED_FAIL_DARK_RUNTIME = (0, "uv-follow-fail-dark-v1")


def request(ip: str, path: str, method: str = "GET", body=None, timeout: float = 4.0):
    payload = None if body is None else json.dumps(body, separators=(",", ":")).encode()
    headers = {"Accept": "application/json"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"http://{ip}{path}", data=payload, headers=headers, method=method)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=timeout) as response:
        raw = response.read()
        return json.loads(raw.decode("utf-8")) if raw else {}


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalized_mac(value) -> str:
    return str(value or "").replace(":", "").lower()


def validate_prestate(info, state, cfg, pins):
    if normalized_mac(info.get("mac")) != TARGET_MAC:
        raise RuntimeError(f"wrong AUX target: MAC={info.get('mac')}")
    if str(info.get("ver")) != EXPECTED_VERSION:
        raise RuntimeError(f"unexpected WLED version: {info.get('ver')}")
    ident = state.get("HBNFAUX") or {}
    if (ident.get("release"), ident.get("engine"), ident.get("buildWitness")) != (
            AUX_RELEASE, AUX_ENGINE, AUX_WITNESS):
        raise RuntimeError("AUX runtime identity differs from the accepted UV-follow lineage")
    runtime_verified = ident.get("uvOutputsVerified")
    if runtime_verified is False:
        runtime_verified = 0
    if runtime_verified is True:
        runtime_verified = 1
    runtime_profile = (runtime_verified, ident.get("uvBuildProfile"))
    if runtime_profile not in (ACCEPTED_UV_RUNTIME, ACCEPTED_FAIL_DARK_RUNTIME):
        raise RuntimeError("AUX runtime is neither the recorded V7 fail-dark baseline nor the accepted output-capable candidate")
    led = ((cfg.get("hw") or {}).get("led") or {})
    light = cfg.get("light") or {}
    if not isinstance(cfg.get("def"), dict) or not isinstance(cfg["def"].get("ps"), int):
        raise RuntimeError("AUX boot-preset setting is unavailable; refusing a change without an exact rollback value")
    buses = led.get("ins") or []
    if len(buses) != 1:
        raise RuntimeError("refusing an unknown AUX LED-bus layout")
    base = buses[0]
    if (base.get("pin") != [16] or int(base.get("start", -1)) != 0
            or int(base.get("len", -1)) != 22 or int(base.get("type", -1)) != 22):
        raise RuntimeError("the live underglow bus does not match the recorded 22-pixel baseline")
    segments = {int(s.get("id", n)): s for n, s in enumerate(state.get("seg") or [])}
    seg0 = segments.get(0) or {}
    if len(segments) != 1 or int(seg0.get("start", -1)) != 0 or int(seg0.get("stop", -1)) != 22:
        raise RuntimeError("refusing an unknown live segment layout")
    available = {int(pin.get("p", -1)): pin for pin in pins.get("pins") or []}
    for gpio, _, _ in UV_OUTPUTS:
        pin = available.get(gpio) or {}
        if pin.get("p") != gpio or "o" in pin or "n" in pin:
            raise RuntimeError(f"GPIO{gpio} is not reported available by the live AUX")
    return led, segments


def expected_config(led):
    buses = [dict(bus) for bus in led["ins"]]
    for gpio, start, _ in UV_OUTPUTS:
        buses.append({
            "start": start, "len": 1, "pin": [gpio], "order": 0,
            "rev": False, "skip": 0, "type": 41, "ref": False,
            "rgbwm": 0, "freq": 0, "maxpwr": 0, "ledma": 0,
            "drv": 0, "text": "",
        })
    return {"total": 24, "ins": buses}


def expected_state(state):
    old = state.get("seg") or []
    underglow = dict(old[0])
    underglow.update({"id": 0, "start": 0, "stop": 22, "sel": True})
    cart = {"id": 1, "start": 22, "stop": 23, "on": False, "bri": 0,
            "fx": 0, "ix": 0, "sel": False}
    bar = {"id": 2, "start": 23, "stop": 24, "on": False, "bri": 0,
           "fx": 0, "ix": 0, "sel": False}
    return {"on": state.get("on", True), "mainseg": 0,
            "seg": [underglow, cart, bar]}


def choose_unused_preset_id(presets):
    if not isinstance(presets, dict):
        raise RuntimeError("AUX preset list is not an object; refusing to overwrite an unknown preset")
    for preset_id in range(250, 0, -1):
        if str(preset_id) not in presets:
            return preset_id
    raise RuntimeError("No unused WLED preset slot is available; existing presets were not changed")


def safe_boot_preset_body(state, preset_id):
    """Capture current underglow state while forcing both UV outputs OFF."""
    planned = expected_state(state)
    body = {key: state[key] for key in ("on", "bri") if key in state}
    body.update({"mainseg": 0, "seg": planned["seg"], "ib": True, "sb": True,
                 "psave": preset_id, "bootps": preset_id, "n": "HBNF AUX UV safe startup"})
    return body


def check_safe_boot_preset(presets, preset_id, baseline_state=None):
    preset = presets.get(str(preset_id)) if isinstance(presets, dict) else None
    if not isinstance(preset, dict):
        raise RuntimeError("new safe-startup preset was not present in WLED readback")
    segments = {int(s.get("id", n)): s for n, s in enumerate(preset.get("seg") or []) if isinstance(s, dict)}
    if preset.get("on") is not True or not all((segments.get(i) or {}).get("on") is False for i in (1, 2)):
        raise RuntimeError("safe-startup preset did not preserve global ON while keeping both UV segments OFF")
    if int(preset.get("mainseg", -1)) != 0:
        raise RuntimeError("safe-startup preset did not retain the underglow main segment")
    if baseline_state is not None:
        expected = {int(s.get("id", n)): s for n, s in enumerate(expected_state(baseline_state)["seg"])}
        for sid in (0, 1, 2):
            actual = segments.get(sid) or {}
            for key in ("start", "stop", "on", "bri", "fx", "sx", "ix", "pal", "col"):
                if key in expected[sid] and actual.get(key) != expected[sid].get(key):
                    raise RuntimeError(f"safe-startup preset changed segment {sid} field {key}")


def wait_for_safe_boot_preset(preset_id, baseline_state, timeout=8.0):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = request(TARGET_IP, "/presets.json", timeout=4.0)
        if str(preset_id) in (last if isinstance(last, dict) else {}):
            check_safe_boot_preset(last, preset_id, baseline_state)
            return last
        time.sleep(0.25)
    raise RuntimeError("new safe-startup preset did not persist before the bounded readback deadline")


def wait_for_preset_map(expected, timeout=8.0):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = request(TARGET_IP, "/presets.json", timeout=4.0)
        if last == expected:
            return last
        time.sleep(0.25)
    raise RuntimeError("WLED preset map did not return to the exact pre-transaction contents")


def reboot_and_wait(previous_uptime):
    # WLED 0.16 uses /reset for a software restart. The request may lose its
    # HTTP response while the unit restarts, so readiness is confirmed by the
    # exact AUX MAC and firmware version rather than by the request status.
    try:
        request(TARGET_IP, "/reset", timeout=3.0)
    except Exception:
        pass
    deadline = time.monotonic() + 45.0
    last_error = None
    while time.monotonic() < deadline:
        try:
            info = request(TARGET_IP, "/json/info", timeout=2.0)
            if (normalized_mac(info.get("mac")) == TARGET_MAC
                    and str(info.get("ver")) == EXPECTED_VERSION
                    and (previous_uptime is None or int(info.get("uptime", previous_uptime + 1)) < int(previous_uptime))):
                return info
        except Exception as error:
            last_error = error
        time.sleep(1.0)
    raise RuntimeError(f"AUX did not return after its configuration restart: {last_error}")


def check_poststate(info, state, cfg):
    led = ((cfg.get("hw") or {}).get("led") or {})
    light = cfg.get("light") or {}
    if light.get("aseg") is not True:
        raise RuntimeError("automatic per-output segmentation did not persist")
    buses = led.get("ins") or []
    bus_map = {tuple(b.get("pin") or []): b for b in buses}
    if int(led.get("total", -1)) != 24 or len(buses) != 3:
        raise RuntimeError("post-write LED bus count/total did not match the UV plan")
    if tuple(bus_map.get((25,), {}).get("start", -1) for _ in [0]) != (22,):
        raise RuntimeError("GPIO25 UV Cart bus readback mismatch")
    if tuple(bus_map.get((26,), {}).get("start", -1) for _ in [0]) != (23,):
        raise RuntimeError("GPIO26 UV Bar bus readback mismatch")
    if any(int(bus_map.get((gpio,), {}).get("type", -1)) != 41 for gpio in (25, 26)):
        raise RuntimeError("UV outputs are not configured as WLED single-channel PWM White")
    if normalized_mac(info.get("mac")) != TARGET_MAC:
        raise RuntimeError("AUX identity changed during configuration")
    segments = {int(s.get("id", n)): s for n, s in enumerate(state.get("seg") or [])}
    if int(state.get("mainseg", -1)) != 0:
        raise RuntimeError("underglow is no longer the selected main segment")
    if len(segments) != 3:
        raise RuntimeError("post-write segment count did not match the UV plan")
    for sid, start, stop in ((0, 0, 22), (1, 22, 23), (2, 23, 24)):
        segment = segments.get(sid) or {}
        if (int(segment.get("start", -1)), int(segment.get("stop", -1))) != (start, stop):
            raise RuntimeError(f"segment {sid} bounds readback mismatch")
    for sid in (1, 2):
        segment = segments[sid]
        if segment.get("on") is not False:
            raise RuntimeError(f"UV segment {sid} did not read back OFF")
    ident = state.get("HBNFAUX") or {}
    if (ident.get("release"), ident.get("engine"), ident.get("buildWitness")) != (
            AUX_RELEASE, AUX_ENGINE, AUX_WITNESS):
        raise RuntimeError("AUX runtime identity changed")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence-dir", required=True)
    parser.add_argument("--apply", action="store_true", help="apply after saving exact rollback snapshots")
    parser.add_argument("--module-confirmed-disconnected", action="store_true",
                        help="owner confirms the staged UV load is physically disconnected during restart")
    args = parser.parse_args()
    evidence = pathlib.Path(args.evidence_dir).expanduser().resolve()
    evidence.mkdir(parents=True, exist_ok=True)

    info = request(TARGET_IP, "/json/info")
    state = request(TARGET_IP, "/json/state")
    cfg = request(TARGET_IP, "/json/cfg")
    pins = request(TARGET_IP, "/json/pins")
    presets = request(TARGET_IP, "/presets.json")
    led, _ = validate_prestate(info, state, cfg, pins)
    snapshots = {"info": info, "state": state, "cfg": cfg, "pins": pins, "presets": presets}
    for name, value in snapshots.items():
        (evidence / f"pre-{name}.json").write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    manifest = {
        "schema": "hbnf-aux-uv-pwm-config-transaction-v1",
        "capturedAtUtc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "target": {"ip": TARGET_IP, "mac": normalized_mac(info.get("mac")),
                   "wledVersion": info.get("ver")},
        "runtimeIdentity": {key: (state.get("HBNFAUX") or {}).get(key) for key in
                            ("release", "engine", "buildWitness", "uvOutputsVerified", "uvBuildProfile")},
        "preState": {name: {"path": f"pre-{name}.json", "sha256": sha256(evidence / f"pre-{name}.json")}
                     for name in snapshots},
        "change": {"outputs": [{"channel": "cart", "gpio": 25, "start": 22,
                                  "segmentId": 1, "type": 41},
                                 {"channel": "bar", "gpio": 26, "start": 23,
                                  "segmentId": 2, "type": 41}],
                   "defaultState": "both UV segments off; existing 22-pixel underglow selected"},
        "applied": False,
    }
    if not args.apply:
        manifest["disposition"] = "PREFLIGHT_ONLY"
        (evidence / "TRANSACTION.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
        print(json.dumps(manifest, indent=2, sort_keys=True))
        return 0
    if not args.module_confirmed_disconnected:
        raise RuntimeError("live apply requires confirmation that the UV module is physically disconnected")

    safe_preset_id = choose_unused_preset_id(presets)
    previous_boot_preset = cfg["def"]["ps"]

    original_cfg = cfg
    original_state = state
    rollback_led = ((original_cfg.get("hw") or {}).get("led") or {})
    rollback_light = original_cfg.get("light") or {}
    next_led = dict(led)
    next_led.update(expected_config(led))
    # WLED creates one segment per bus only when light.aseg is enabled, and
    # exposes rSeg to rebuild the segment map from the configured bus ranges.
    next_cfg = {"hw": {"led": next_led}, "light": {"aseg": True}}
    try:
        request(TARGET_IP, "/json/cfg", "POST", next_cfg, timeout=8.0)
        reboot_and_wait(info.get("uptime"))
        request(TARGET_IP, "/json/state", "POST", {"rSeg": True}, timeout=8.0)
        rebuilt = request(TARGET_IP, "/json/state", timeout=8.0)
        (evidence / "post-state-rebuilt.json").write_text(json.dumps(rebuilt, indent=2, sort_keys=True) + "\n")
        request(TARGET_IP, "/json/state", "POST", {"seg": [
            {"id": 0, "on": True, "sel": True},
            {"id": 1, "on": False, "bri": 0, "fx": 0, "ix": 0, "sel": False},
            {"id": 2, "on": False, "bri": 0, "fx": 0, "ix": 0, "sel": False},
        ], "mainseg": 0}, timeout=8.0)
        safe_state = request(TARGET_IP, "/json/state", timeout=8.0)
        request(TARGET_IP, "/json/state", "POST", safe_boot_preset_body(safe_state, safe_preset_id), timeout=8.0)
        preset_readback = wait_for_safe_boot_preset(safe_preset_id, safe_state)
        cfg_after_preset = request(TARGET_IP, "/json/cfg", timeout=8.0)
        if int((cfg_after_preset.get("def") or {}).get("ps", -1)) != safe_preset_id:
            raise RuntimeError("WLED boot preset selection did not read back")
        reboot_and_wait(request(TARGET_IP, "/json/info", timeout=8.0).get("uptime"))
        post_info = request(TARGET_IP, "/json/info", timeout=8.0)
        post_state = request(TARGET_IP, "/json/state", timeout=8.0)
        post_cfg = request(TARGET_IP, "/json/cfg", timeout=8.0)
        preset_readback = request(TARGET_IP, "/presets.json", timeout=8.0)
        check_safe_boot_preset(preset_readback, safe_preset_id, safe_state)
        for name, value in (("post-info", post_info), ("post-state", post_state), ("post-cfg", post_cfg), ("post-presets", preset_readback)):
            (evidence / f"{name}.json").write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
        check_poststate(post_info, post_state, post_cfg)
        if int((post_cfg.get("def") or {}).get("ps", -1)) != safe_preset_id:
            raise RuntimeError("boot preset selection did not survive the cold-start verification")
    except Exception as error:
        rollback_errors = []
        try:
            if "safe_preset_id" in locals():
                request(TARGET_IP, "/json/state", "POST", {"pdel": safe_preset_id}, timeout=8.0)
                expected_presets = dict(presets)
                expected_presets.pop(str(safe_preset_id), None)
                wait_for_preset_map(expected_presets)
        except Exception as rollback_error:
            rollback_errors.append(f"preset: {rollback_error}")
        try:
            rollback_uptime = request(TARGET_IP, "/json/info", timeout=4.0).get("uptime")
            request(TARGET_IP, "/json/cfg", "POST", {
                "hw": {"led": rollback_led},
                "light": {"aseg": rollback_light.get("aseg", False)},
                "def": {"ps": previous_boot_preset},
            }, timeout=8.0)
            reboot_and_wait(rollback_uptime)
            request(TARGET_IP, "/json/state", "POST", {"rSeg": True}, timeout=8.0)
            rollback_cfg = request(TARGET_IP, "/json/cfg", timeout=8.0)
            if ((rollback_cfg.get("hw") or {}).get("led") != rollback_led
                    or (rollback_cfg.get("light") or {}).get("aseg", False) != rollback_light.get("aseg", False)
                    or (rollback_cfg.get("def") or {}).get("ps") != previous_boot_preset):
                raise RuntimeError("configuration or prior boot preset did not read back exactly after rollback")
        except Exception as rollback_error:
            rollback_errors.append(f"cfg: {rollback_error}")
        try:
            current_state = request(TARGET_IP, "/json/state", timeout=8.0)
            current_segments = current_state.get("seg") or []
            for segment in sorted(current_segments, key=lambda s: int(s.get("id", 0)), reverse=True):
                sid = int(segment.get("id", 0))
                if sid > 0:
                    request(TARGET_IP, "/json/state", "POST", {"seg": [{"id": sid, "stop": 0}]}, timeout=8.0)
            request(TARGET_IP, "/json/state", "POST", original_state, timeout=8.0)
            restored = request(TARGET_IP, "/json/state", timeout=8.0)
            if len(restored.get("seg") or []) != len(original_state.get("seg") or []):
                raise RuntimeError("segment count did not return to its captured baseline")
        except Exception as rollback_error:
            rollback_errors.append(f"state: {rollback_error}")
        manifest.update({"applied": True, "disposition": "FAILED_ROLLBACK_ATTEMPTED",
                         "failure": f"{type(error).__name__}: {error}",
                         "rollbackErrors": rollback_errors,
                         "failedPostReadback": {name: {"path": f"{name}.json", "sha256": sha256(evidence / f"{name}.json")}
                                                 for name in ("post-info", "post-state", "post-cfg", "post-state-rebuilt")
                                                 if (evidence / f"{name}.json").is_file()}})
        (evidence / "TRANSACTION.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
        raise RuntimeError(f"UV PWM configuration failed; exact cfg/state rollback attempted: {error}; {rollback_errors}") from error

    manifest.update({"applied": True, "disposition": "PASS_UV_OUTPUTS_OFF",
                     "safeBootPresetId": safe_preset_id,
                     "previousBootPresetId": previous_boot_preset,
                     "bootPresetReadback": {"path": "post-presets.json", "sha256": sha256(evidence / "post-presets.json")},
                     "postState": {name: {"path": f"{name}.json", "sha256": sha256(evidence / f"{name}.json")}
                                   for name in ("post-info", "post-state", "post-cfg", "post-presets")},
                     "runtimeActivationGatesChanged": False,
                     "runtimeFirmwareUpgradePerformed": False})
    (evidence / "TRANSACTION.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
