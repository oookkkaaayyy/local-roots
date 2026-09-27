#!/usr/bin/env python3
from pathlib import Path

root=Path(__file__).resolve().parents[1]
ino=(root/"hbnf-game-adapter/bridge/HBNF_GameBridge/HBNF_GameBridge.ino").read_text()
page=(root/"hbnf-game-adapter/bridge/HBNF_GameBridge/game_controller_page.h").read_text()
prov=(root/"scripts/provision_hbnf_game_bridge.py").read_text()

required_ino=[
    'kPlaySsid = "HBNF-Play"',
    '"x-hbnf-device"',
    'CART_TOKEN ',
    'cartProxyWorker',
    'queueCartProxy',
    'CLAIM_AUTO',
    'gameWeb.on("/generate_204"',
    'gameWeb.on("/hotspot-detect.html"',
]
required_page=['>LIGHTS<','>PLAY<','CLAIM_AUTO',"cart('OFF')"]
# OFF is emitted through data-cart rather than literal cart('OFF'); accept that exact UI contract.
if "data-cart=\"OFF\"" not in page:
    raise SystemExit("missing guest OFF control")
for x in required_ino:
    if x not in ino: raise SystemExit("missing bridge contract: "+x)
for x in ['>LIGHTS<','>PLAY<','CLAIM_AUTO','data-cart="NEXT"','id="mb"','id="ab"']:
    if x not in page: raise SystemExit("missing guest UI contract: "+x)
for x in ['OPEN GUEST PLAY','GUEST_PLAY_CLOSED','Sign in','magic link','Pair this phone']:
    if x in page or x in ino: raise SystemExit("guest friction regression: "+x)
if 'HBNF_PLAY_WIFI.svg' not in prov or 'SCAN TO CONTROL THE CART + PLAY' not in prov:
    raise SystemExit("single-QR printable contract missing")
if '<img src="HBNF_PLAY_CONTROLLER_DIAGNOSTIC.svg">' in prov:
    raise SystemExit("printable sign regressed to two QR codes")
print("HBNF_PHASE2_GUEST_UX_AUDIT=PASS")
