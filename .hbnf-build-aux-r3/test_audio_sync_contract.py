#!/usr/bin/env python3
"""Source-level proof for local Matrix audio reuse on the AUX WLED build."""
import json
import pathlib
import re
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: test_audio_sync_contract.py <pinned-wled-source-root>")

wled = pathlib.Path(sys.argv[1]).resolve()
repo = pathlib.Path(__file__).resolve().parents[1]
audio = (wled / "usermods/audioreactive/audio_reactive.cpp").read_text()
anim = (wled / "usermods/usermod_v2_animartrix/usermod_v2_animartrix.cpp").read_text()
bridge = (wled / "usermods/usermod_v2_animartrix/hbnf_animartrix_audio_bridge.h").read_text()
bus = (wled / "wled00/bus_manager.cpp").read_text()
bus_h = (wled / "wled00/bus_manager.h").read_text()
contract = json.loads((repo / "hbnf-aux-lighting/commissioning/contract.json").read_text())
uv_command = (repo / "hbnf-aux-lighting/backend/aux_uv_command.mjs").read_text()

# Exact WLED receive path: valid UDP sound packets update the same local sample
# already exposed to effects, and last_UDPTime advances only for a valid sample.
assert "volumeSmth   = fmaxf(receivedPacket.sampleSmth, 0.0f);" in audio
assert "if (have_new_sample) last_UDPTime = millis();" in audio
assert re.search(r"um_data->u_size\s*=\s*9\s*;", audio)
assert "um_data->u_data[0] = &volumeSmth;" in audio
assert "um_data->u_type[0] = UMT_FLOAT;" in audio
assert "um_data->u_data[8] = &last_UDPTime;" in audio
assert "um_data->u_type[8] = UMT_UINT32;" in audio

# Existing AUX usermod already reads AudioReactive UMData locally. No HTTP or
# high-frequency MQTT read is required to consume the synchronized envelope.
assert "UsermodManager::getUMData(&um,USERMOD_ID_AUDIOREACTIVE)" in bridge
assert "um->u_data[0]" in bridge
assert "fresh_=um->u_size>=9 && um->u_data[8]" in bridge
assert "if(!fresh_)" not in bridge  # local mic/Matrix energy keeps its established path
assert "hbnfAudio.beginFrame" in anim
assert "UMT_UINT32" in (wled / "wled00/fcn_declare.h").read_text()
assert "void UsermodManager::loop()" in (wled / "wled00/um_manager.cpp").read_text()
assert 'void mode_HbnfUvFollow()' in anim
assert 'strip.addEffect(248, &mode_HbnfUvFollow' in anim
assert 'uvFollowEffectId"] = 248' in anim
assert 'hbnfUvFollowRegistered = true' in anim
assert 'uvOutputsVerified"] = HBNF_UV_OUTPUTS_VERIFIED' in anim
assert 'HBNF_UV_OUTPUTS_VERIFIED\n#define HBNF_UV_OUTPUTS_VERIFIED 0' in anim
assert 'uvFollowLevel(anim.hbnfEnergy(), SEGMENT.intensity, anim.hbnfFresh(), true)' in anim
assert 'SEGMENT.fill(RGBW32(level,level,level,level))' in anim
assert '#if HBNF_UV_OUTPUTS_VERIFIED' in anim and '#else\n  SEGMENT.fill(0);' in anim

# Pinned WLED has a one-channel PWM bus type, but this Cart's physical 5V
# switching and segment allocation remain explicitly unverified and fail-closed.
assert "TYPE_ANALOG_1CH" in bus_h and "PWM White" in bus
assert "case TYPE_ANALOG_1CH: //one channel (white), relies on auto white calculation\n      _data[0] = w;" in bus
assert "unsigned duty = (_data[i] * pwmBri) / 255;" in bus
assert "uint8_t AWmode = elm[F(\"rgbwm\")] | RGBW_MODE_MANUAL_ONLY;" in (wled / "wled00/cfg.cpp").read_text()
assert "void Segment::fill(uint32_t c) const" in (wled / "wled00/FX_fcn.cpp").read_text()
assert "class BusPwm" in bus_h and "PinOwner::BusPwm" in bus
assert contract["aux"]["uv"]["sp803e_pwm_direct_control"] is False
assert contract["aux"]["uv"]["status"] == "per-channel-hardware-pending"
assert contract["safety"]["uv_requires_verified_per_channel_pwm_path"] is True
assert 'verified: false' in uv_command
assert 'segmentId: null' in uv_command

print("HBNF_AUX_LOCAL_AUDIO_FRESHNESS_AND_PWM_SOURCE_PASS")
