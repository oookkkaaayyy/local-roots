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
assert "hbnf-wow-aux-r3-2026-09-22-v1" in src
assert "SEGMENT.custom3 != 0" in src
assert "setSpeedFactor((hbnfAudio.setScene" in src
assert "registry28-semantic-tempo-1d-v4-colorwifi" in src
print("HBNF_AUX_R3_PATCH_CONTRACT_PASS")

assert 'mqtt_old' in src
assert 'projection\\\\\\":\\\\\\"fold2-1d-v1' in src

assert 'hbnfCanvasH = 2' in src
assert 'hbnfCanvasW' in src
assert 'SEGMENT.virtualLength()' in src
assert 'fold2-1d-v1' in src
assert "hbnfAudio.setScene(SEGMENT.mode)" in src
assert contract["aux"]["projection"]=="fold2-1d-v1"
assert contract["matrix"]["buildWitness"]=="registry28-semantic-tempo-v6-colorwifi"
assert contract["aux"]["buildWitness"]=="registry28-semantic-tempo-1d-v4-colorwifi"

print("HBNF_AUX_R3_STANDALONE_CONTRACT_PASS")
