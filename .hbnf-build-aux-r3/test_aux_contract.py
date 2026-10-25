#!/usr/bin/env python3
import json,pathlib,re
auxbuild=pathlib.Path(__file__).resolve().parent
repo=pathlib.Path(__file__).resolve().parents[1]
src=(auxbuild/"apply_aux_r3.py").read_text()
if (auxbuild/"contract.json").exists() and (auxbuild/"WOW_SCENES_V2.json").exists():
    contract=json.loads((auxbuild/"contract.json").read_text())
    scenes=json.loads((auxbuild/"WOW_SCENES_V2.json").read_text())
else:
    contract=json.loads((repo/"hbnf-aux-lighting/commissioning/contract.json").read_text())
    scenes=json.loads((repo/"hbnf-wow-bundle/config/WOW_SCENES_V2.json").read_text())
assert contract["matrix"]["effect_ids"]==[220,247]
assert len(scenes["scenes"])==28
style=[scenes["styleCodes"][x["style"]] for x in scenes["scenes"]]
amount=[x["amount"] for x in scenes["scenes"]]
m=re.search(r"style=\[([^\]]+)\]",src); assert m
m2=re.search(r"amount=\[([^\]]+)\]",src); assert m2
assert [int(x) for x in m.group(1).split(",")]==style
assert [int(x) for x in m2.group(1).split(",")]==amount
assert "audioSyncEnabled = 2" in src
assert "hbnf-wow-aux-r3-2026-10-25-uv-follow-v1" in src
assert "registry28-tempo-lock-1d-v7-network-no-starve-uv-follow" in src
print("HBNF_AUX_R3_PATCH_CONTRACT_PASS")

assert 'mqtt_anchor' in src
assert 'projectionRole' in src
assert 'frame-lock-v1' in src
assert 'HbnfProjectionReceiverV1' in src
assert 'hbnfProjectionRx.tick()' in src
assert 'tick_old' in src and 'tick_new' in src
assert 'hbnfProjectionRx.tick();' in src
assert 'guard<128' in src
assert 'projectionQueuePolicy' in src
assert 'projectionHelloPackets' in src
assert 'PROJECTION_DISCOVERY_PORT' in src
assert 'encodeProjectionHello' in src
assert 'hello_.begin' in src
assert 'network-before-bus-guard-v1' in src
assert 'AUX must not run Matrix projection sender or generative owner' in src

assert 'hbnfCanvasH = 2' in src
assert 'hbnfCanvasW' in src
assert 'SEGMENT.virtualLength()' in src
assert 'fold2-1d-v1' in src
assert "hbnfAudio.setScene(SEGMENT.mode)" in src
assert contract["aux"]["projection"]=="frame-lock-v1"
assert contract["aux"]["projection_fallback"]=="fold2-1d-v1"
assert contract["aux"]["luma_policy"]=="camera-bright-v1"
assert contract["matrix"]["audio_geometry"]=="source-coupled-v4"
assert contract["matrix"]["generator"]=="anti-repeat-v4"
assert contract["matrix"]["projection_link"]["port"]==11989
assert contract["aux"]["projection_link"]["port"]==11989
assert contract["aux"]["projection_link"]["discovery_port"]==11990
assert contract["matrix"]["projection_link"]["discovery_port"]==11990
assert contract["matrix"]["projection_link"]["geometry"]=="perimeter-5-6-5-6-v1"
assert contract["sync"]["framebuffer_source_of_truth"]=="matrix"
assert contract["matrix"]["buildWitness"]=="registry28-tempo-lock-v9-network-no-starve"
assert contract["aux"]["buildWitness"]=="registry28-tempo-lock-1d-v7-network-no-starve-uv-follow"
assert contract["aux"]["uv"]["rhythm_follow_effect_id"]==248
assert contract["aux"]["uv"]["outputs_verified_in_build"] is False

print("HBNF_AUX_V4_FRAME_LOCK_CONTRACT_PASS")

# The workflow's strict binary reproducibility gate must not reuse WLED's
# cross-checkout ~/.buildcache between the two clean builds.
workflow=(repo/".github/workflows/hbnf-sp803e-aux-r3-build.yml").read_text()
cache_paths=re.findall(r"PLATFORMIO_BUILD_CACHE_DIR:\s*(/tmp/hbnf-build-cache-[a-z]+)",workflow)
assert cache_paths[:2]==["/tmp/hbnf-build-cache-first","/tmp/hbnf-build-cache-second"]
assert cache_paths[0]!=cache_paths[1]
print("HBNF_AUX_REPRODUCIBILITY_CACHE_ISOLATION_PASS")
