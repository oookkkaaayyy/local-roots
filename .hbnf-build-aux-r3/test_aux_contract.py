#!/usr/bin/env python3
import json,pathlib,re
repo=pathlib.Path(__file__).resolve().parents[1]
auxbuild=pathlib.Path(__file__).resolve().parent
src=(auxbuild/"apply_aux_r3.py").read_text()
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
assert "registry28-fixed-1d-v1" in src
print("HBNF_AUX_R3_PATCH_CONTRACT_PASS")
