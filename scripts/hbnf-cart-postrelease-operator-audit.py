#!/usr/bin/env python3
from pathlib import Path
import json,re

root=Path(__file__).resolve().parents[1]
required=[
 "scripts/HBNF_POST_RELEASE_SETUP.command",
 "scripts/hbnf-cart-device-preflight.py",
 "scripts/hbnf-cart-lan-discover.py",
 "scripts/hbnf-cart-uv-pin-plan.py",
 "scripts/FLASH_HBNF_GAME_BRIDGE.command",
 "scripts/provision_hbnf_game_bridge.py",
 "config/hbnf-cart-router-manifest.json",
 "hbnf-game-adapter/bridge/HBNF_GameBridge/HBNF_GameBridge.ino",
 "scripts/DEPLOY_HBNF_IPAD_UI.command",
 "hbnf-wow-bundle/web/hbnf-cart-ipad.html",
 "hbnf-wow-bundle/web/hbnf-cart-ipad.js",
]
for rel in required:
    p=root/rel
    assert p.exists() and p.stat().st_size>0, rel

manifest=json.load(open(root/"config/hbnf-cart-router-manifest.json"))
assert manifest["adminIp"]=="192.168.8.1"
assert manifest["mainWifi"]["ssid"]=="HBNF-Cart"
ips={x["name"]:x["ip"] for x in manifest["reservations"]}
assert ips["HBNF-Matrix"]=="192.168.8.20"
assert ips["HBNF-AUX"]=="192.168.8.21"
assert manifest["staticClients"][0]["name"]=="HBNF-GameBridge"
assert manifest["staticClients"][0]["ip"]=="192.168.8.30"

op=(root/"scripts/HBNF_POST_RELEASE_SETUP.command").read_text()
for needle in [
 "does not modify production Supabase",
 "does not flash Matrix or AUX",
 "hbnf-cart-lan-discover.py",
 "hbnf-cart-device-preflight.py",
 "FLASH_HBNF_GAME_BRIDGE.command",
 "canonical OFF",
 "UV may remain separate",
 "DEPLOY_HBNF_IPAD_UI.command",
 "192.168.8.30",
]:
    assert needle in op, needle
assert "supabase db push" not in op.lower()
assert "hbnf-cart-production-activate" not in op
assert not re.search(r'WIFI_PASS\s+[^"<]',op), "embedded password-like value"
print("HBNF_POST_RELEASE_OPERATOR_AUDIT=PASS")

ipad=(root/"hbnf-wow-bundle/web/hbnf-cart-ipad.js").read_text()
assert "hbnf-cart-control" in ipad
assert "192.168.8.20" not in ipad and "192.168.8.21" not in ipad
deploy=(root/"scripts/DEPLOY_HBNF_IPAD_UI.command").read_text()
assert "hbnf-cart-ipad.html" in deploy and "hbnf-cart-ipad.js" in deploy
