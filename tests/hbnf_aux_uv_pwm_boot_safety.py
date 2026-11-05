#!/usr/bin/env python3
"""Offline tests for the AUX UV safe-startup preset transaction."""
import importlib.util
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "hbnf-aux-lighting/commissioning/configure_uv_pwm_outputs.py"
spec = importlib.util.spec_from_file_location("configure_uv_pwm_outputs", SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

existing = {"1": {"n": "Owner look"}, "250": {"n": "Final"}}
assert module.choose_unused_preset_id(existing) == 249
assert existing == {"1": {"n": "Owner look"}, "250": {"n": "Final"}}
try:
    module.choose_unused_preset_id({str(i): {} for i in range(1, 251)})
    raise AssertionError("full preset bank was accepted")
except RuntimeError as error:
    assert "No unused" in str(error)

state = {
    "on": True, "bri": 180, "mainseg": 0,
    "seg": [
        {"id": 0, "start": 0, "stop": 22, "on": True, "bri": 100, "fx": 12, "sx": 90, "ix": 110, "pal": 3, "col": [[1, 2, 3]]},
        {"id": 1, "start": 22, "stop": 23, "on": False, "bri": 0, "fx": 0, "ix": 0},
        {"id": 2, "start": 23, "stop": 24, "on": False, "bri": 0, "fx": 0, "ix": 0},
    ],
}
body = module.safe_boot_preset_body(state, 249)
assert body["on"] is True and body["mainseg"] == 0
assert body["psave"] == body["bootps"] == 249
assert all(body["seg"][0][key] == state["seg"][0][key]
           for key in ("start", "stop", "on", "bri", "fx", "sx", "ix", "pal", "col"))
assert all(body["seg"][i]["on"] is False for i in (1, 2))
assert body["seg"][1]["bri"] == body["seg"][2]["bri"] == 0

preset = {"249": {"on": True, "bri": 180, "mainseg": 0, "seg": body["seg"]}}
module.check_safe_boot_preset(preset, 249, state)

# The existing underglow may intentionally be OFF before a UV configuration
# transaction. Safe boot may never wake it merely to keep the UV outputs OFF.
off_state = {**state, "on": False}
off_body = module.safe_boot_preset_body(off_state, 249)
assert off_body["on"] is False
assert off_body["seg"][0] == body["seg"][0], "underglow state changed"
assert all(off_body["seg"][sid]["on"] is False and off_body["seg"][sid]["bri"] == 0 for sid in (1, 2))
off_preset = {"249": {**preset["249"], "on": False, "seg": off_body["seg"]}}
module.check_safe_boot_preset(off_preset, 249, off_state)
# A readback without a full baseline must still reject a latent nonzero UV
# brightness, even if WLED reports the segment "on" field as false.
latent_bright = {"249": {**off_preset["249"],
    "seg": [*off_body["seg"][:1], {**off_body["seg"][1], "bri": 255}, off_body["seg"][2]]}}
try:
    module.check_safe_boot_preset(latent_bright, 249)
    raise AssertionError("nonzero UV boot brightness was accepted without baseline evidence")
except RuntimeError as error:
    assert "zero brightness" in str(error)
try:
    module.check_safe_boot_preset({"249": {**off_preset["249"], "on": True}}, 249, off_state)
    raise AssertionError("unsafe global wake passed safe-boot validation")
except RuntimeError as error:
    assert "global" in str(error)
try:
    module.safe_boot_preset_body({key: value for key, value in state.items() if key != "on"}, 249)
    raise AssertionError("missing global on/off state allowed a safe-boot write")
except RuntimeError as error:
    assert "global" in str(error)
bad = {"249": {**preset["249"], "seg": [*body["seg"][:1], {**body["seg"][1], "on": True}, body["seg"][2]]}}
try:
    module.check_safe_boot_preset(bad, 249, state)
    raise AssertionError("UV-on boot preset passed")
except RuntimeError as error:
    assert "OFF" in str(error) or "field" in str(error)

valid_info = {"mac": module.TARGET_MAC, "ver": module.EXPECTED_VERSION}
valid_state = {"HBNFAUX": {"release": module.AUX_RELEASE, "engine": module.AUX_ENGINE,
                             "buildWitness": module.AUX_WITNESS, "uvOutputsVerified": 1,
                             "uvBuildProfile": "uv-follow-output-capable-v1"},
               "mainseg": 0, "seg": state["seg"]}
valid_cfg = {"def": {"ps": 249}, "hw": {"led": {"total": 24, "ins": [
    {"pin": [16], "start": 0, "len": 22, "type": 22},
    {"pin": [25], "start": 22, "len": 1, "type": 41},
    {"pin": [26], "start": 23, "len": 1, "type": 41},
]}}, "light": {"aseg": True}}
valid_presets = {"249": preset["249"]}
module.check_poststate({"mac": module.TARGET_MAC}, valid_state, valid_cfg)
assert "def" in valid_cfg

print("HBNF AUX UV safe-startup preset offline checks PASS")
