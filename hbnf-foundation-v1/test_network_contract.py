#!/usr/bin/env python3
import json, pathlib, sys

p=pathlib.Path(__file__).with_name("NETWORK_CONTRACT.json")
c=json.loads(p.read_text())

assert c["wled"]["commit"]=="29b389df1c1aaec6ff53aea742d17063b985906c"
m=c["matrix"]
a=c["aux"]

assert m["physical_bus"]["start"]==0
assert m["physical_bus"]["length"]==512
assert m["physical_bus"]["type"]==22
assert m["companion_ddp_bus"]["type"]==80
assert m["companion_ddp_bus"]["start"]==512
assert m["companion_ddp_bus"]["length"]==22
assert m["companion_ddp_bus"]["port"]==4048
assert m["pixel_space"]["matrix_end_inclusive"]+1==m["companion_ddp_bus"]["start"]
assert m["pixel_space"]["companion_end_inclusive"]+1==m["pixel_space"]["total"]
assert m["pixel_space"]["total"]==534
assert m["wifi_sleep"] is False

assert a["role"]=="DDP realtime receiver"
assert a["receive_direct"] is True
assert a["ddp_port"]==4048
assert a["physical_groups"]==22
assert sum(a["physical_topology"])==22
assert a["hardware_color_order"]=="BRG"
assert a["wifi_sleep"] is False
assert a["live_hbnf_audio"] is False
assert a["live_hbnf_generator"] is False
assert a["hbnf_mqtt_control"] is False
assert a["custom_hbnp"] is False

auth=c["authority"]
assert auth["audio"]=="matrix only"
assert auth["visual_state"]=="matrix only"
assert "before DDP" in auth["aux_brightness"]
assert "asynchronous" in auth["cloud"]

print("PASS foundation-v1 network contract: WLED-native DDP, 512+22 pixel space, dumb AUX")
