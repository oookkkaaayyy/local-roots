#!/usr/bin/env python3
"""Bounded local WLED integration check inside the existing R6 snapshot.

Checks candidate Vibe/audio controls, palette/scene composition, native text/
scoreboard overlay and Matrix-to-AUX DDP readback. It does not claim hosted
Owner PWA application confirmation; that acceptance remains separately gated.
The caller's Packet20 snapshot is responsible for restoring pre-check state.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import time
import urllib.request

MATRIX="http://192.168.77.10"
AUX="http://192.168.77.11"
MATRIX_MAC="704bca5b345c"
AUX_MAC="8c94df55c34c"

def get_json(url,timeout=4):
    req=urllib.request.Request(url,headers={"Cache-Control":"no-store"})
    with urllib.request.urlopen(req,timeout=timeout) as response:
        raw=response.read()
        if response.status!=200:raise RuntimeError(f"GET status {response.status}: {url}")
        return json.loads(raw)

def post_json(url,payload,timeout=4):
    data=json.dumps(payload,separators=(",",":")).encode()
    req=urllib.request.Request(url,data=data,headers={"Content-Type":"application/json"},method="POST")
    with urllib.request.urlopen(req,timeout=timeout) as response:
        raw=response.read()
        if response.status!=200:raise RuntimeError(f"POST status {response.status}: {url}")
        return json.loads(raw) if raw.strip() else {}

def check(expected_release,api=None,sleep=time.sleep):
    api=api or {"get":get_json,"post":post_json}
    get,post=api["get"],api["post"]
    build=get(MATRIX+"/hbnf/build.json")
    info=get(MATRIX+"/json/info")
    state=get(MATRIX+"/json/state")
    if (info.get("ip")!="192.168.77.10" or info.get("mac","").replace(":","").lower()!=MATRIX_MAC
        or build.get("release_id")!=expected_release or build.get("candidate")!=expected_release
        or state.get("on") is not True):
        raise RuntimeError("combined-check-matrix-identity-or-state-mismatch")
    aux_info=get(AUX+"/json/info")
    aux_state=get(AUX+"/json/state")
    h=state.get("HBNF",{})
    if h.get("packet20Diagnostic",{}).get("enabled") is not True:
        raise RuntimeError("combined-check-requires-open-packet20-snapshot")
    if h.get("foundationTelemetry",{}).get("enabled") is not True:
        raise RuntimeError("combined-check-requires-foundation-telemetry")
    if (aux_info.get("ip")!="192.168.77.11" or aux_info.get("mac","").replace(":","").lower()!=AUX_MAC
        or aux_info.get("live") is not True or aux_info.get("lm")!="DDP" or aux_info.get("lip")!="192.168.77.10"
        or aux_info.get("leds",{}).get("count")!=22 or aux_state.get("lor")!=0):
        raise RuntimeError("combined-check-aux-projection-not-healthy")

    # One bounded native WLED JSON update exercises the paths concurrently.
    # The short-lived overlay expires on its own if the host is interrupted.
    payload={"on":True,"HBNF":{
        "vibe":"groove","scene":"field-mix","motion":70,"audioResponse":75,
        "matrixBrightness":h.get("matrixBrightness"),"auxBrightness":h.get("auxBrightness"),
        "palette":{"mode":"legacy","id":"ocean"},
        "overlay":{"id":"r6-combined-check","kind":"scoreboard","label":"SCORES",
                    "entries":["TEAM A 2","TEAM B 1"],"ttlMs":12000}
    }}
    post(MATRIX+"/json/state",payload)
    sleep(1.0)
    observed=get(MATRIX+"/json/state")
    oh=observed.get("HBNF",{})
    audio=oh.get("audio",{})
    aux_info_after=get(AUX+"/json/info")
    aux_state_after=get(AUX+"/json/state")
    checks={
        "candidate_identity":oh.get("candidate")==expected_release,
        "vibe_audio_controls":(oh.get("vibe")==1 and oh.get("motion")==70 and oh.get("audioResponse")==75
                               and all(isinstance(audio.get(k),(int,float)) for k in ("bass","mid","treble","volume","peak"))),
        "palette_scene_interaction":(oh.get("scene")==1 and oh.get("palette",{}).get("mode")=="legacy"),
        "native_text_scoreboard_overlay":oh.get("overlayId")=="r6-combined-check",
        "matrix_aux_ddp_projection":(aux_info_after.get("live") is True and aux_info_after.get("lm")=="DDP"
                                      and aux_info_after.get("lip")=="192.168.77.10" and aux_state_after.get("lor")==0),
    }
    return {"schema":"hbnf-r6-combined-feature-check-v1",
            "status":"PASS" if all(checks.values()) else "FAIL",
            "expected_release_id":expected_release,"checks":checks,
            "owner_controls_scoring_status":"NOT_PROVEN_BY_LOCAL_WLED_CHECK; retain existing owner/backend acceptance gate",
            "restore":"outer Packet20 snapshot must verify before transaction close",
            "audio_semantics":"runtime audio fields were read; this is not labeled music or owner audio acceptance"}

def main(argv=None):
    ap=argparse.ArgumentParser()
    ap.add_argument("--release-id",required=True)
    ap.add_argument("--out",required=True)
    args=ap.parse_args(argv)
    try: result=check(args.release_id)
    except Exception as exc:
        result={"schema":"hbnf-r6-combined-feature-check-v1","status":"FAIL","error":f"{type(exc).__name__}: {exc}"}
    path=pathlib.Path(args.out);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    print(json.dumps(result,sort_keys=True))
    return 0 if result.get("status")=="PASS" else 2

if __name__=="__main__":raise SystemExit(main())
