#!/usr/bin/env python3
"""Bounded local WLED integration check with its own narrow state restoration.

Checks candidate Vibe/audio controls, palette/scene composition, native text/
scoreboard overlay and Matrix-to-AUX DDP readback. It does not claim hosted
Owner PWA application confirmation; that acceptance remains separately gated.
Packet20 diagnostics are not needed for these API control checks.
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
PERSISTED_CONFIG=MATRIX+"/edit?func=download&path=%2Fcfg.json"
RESTORE_SETTLE_SECONDS=0.9

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

def _persisted_settings(get):
    config=get(PERSISTED_CONFIG)
    hbnf=config.get("um",{}).get("hbnfFoundationV1")
    if not isinstance(hbnf,dict):raise RuntimeError("combined-check-persisted-settings-unavailable")
    settings={k:hbnf.get(k) for k in ("matrixBrightness","auxBrightness","vibe")}
    if any(type(v) is not int for v in settings.values()):
        raise RuntimeError("combined-check-persisted-settings-incomplete")
    return settings

def _capture_restore_state(state,persisted):
    h=state.get("HBNF",{})
    fields=("scene","vibe","motion","audioResponse","matrixBrightness","auxBrightness")
    if any(type(h.get(k)) is not int for k in fields):
        raise RuntimeError("combined-check-runtime-controls-incomplete")
    palette=h.get("palette")
    if not isinstance(palette,dict) or palette.get("mode") not in ("legacy","wled","solid"):
        raise RuntimeError("combined-check-runtime-palette-unavailable")
    if any(h.get(k)!=persisted.get(k) for k in ("matrixBrightness","auxBrightness","vibe")):
        raise RuntimeError("combined-check-runtime-persisted-settings-mismatch")
    if h.get("overlayId") is not None:
        raise RuntimeError("combined-check-existing-overlay-active")
    wled_fields=("on","bri","transition","ps","pl","mainseg","seg")
    if any(k not in state for k in ("on","bri","seg")) or not isinstance(state.get("seg"),list):
        raise RuntimeError("combined-check-renderer-state-incomplete")
    if state.get("on") is not True:
        raise RuntimeError("combined-check-matrix-output-off")
    restore={k:state[k] for k in wled_fields if k in state}
    restore["seg"]=json.loads(json.dumps(state["seg"]))
    restore["HBNF"]={k:h[k] for k in fields}
    restore_palette=dict(palette)
    if restore_palette.get("mode")=="legacy":
        # The firmware validates this token but retains only the mode.
        restore_palette.setdefault("id","hbnf-balanced")
    restore["HBNF"]["palette"]=restore_palette
    restore["HBNF"]["overlay"]=None
    controls={k:h[k] for k in fields};controls["palette"]=dict(palette)
    return restore,controls,json.loads(json.dumps(state["seg"]))

def _restore_comparison(state,persisted,expected_controls,expected_segments,expected_wled):
    h=state.get("HBNF",{})
    controls=all(h.get(k)==v for k,v in expected_controls.items())
    segments=state.get("seg")==expected_segments
    saved=all(persisted.get(k)==expected_controls[k] for k in ("matrixBrightness","auxBrightness","vibe"))
    palette=h.get("palette",{});expected=expected_controls.get("palette",{})
    palette_ok=palette.get("mode")==expected.get("mode")
    if expected.get("mode")=="wled":palette_ok=palette_ok and palette.get("index")==expected.get("index")
    if expected.get("mode")=="solid":palette_ok=palette_ok and palette.get("rgb")==expected.get("rgb")
    wled_keys=("on","bri","transition","ps","pl","mainseg")
    wled_ok=all(state.get(k)==expected_wled[k] for k in wled_keys if k in expected_wled)
    return {"runtime_controls":controls,"segments":segments,"persisted_owner_settings":saved,
        "palette":palette_ok,"wled_output":wled_ok,"overlay_cleared":h.get("overlayId") is None}

def _restore_matches(state,persisted,expected_controls,expected_segments,expected_wled):
    return all(_restore_comparison(state,persisted,expected_controls,expected_segments,expected_wled).values())

def check(expected_release,api=None,sleep=time.sleep,require_normal_mode=False):
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
    if require_normal_mode and h.get("packet20Diagnostic",{}).get("enabled") is True:
        raise RuntimeError("combined-check-refuses-active-packet20-diagnostic-mode")
    if require_normal_mode and h.get("foundationTelemetry",{}).get("enabled") is True:
        raise RuntimeError("combined-check-refuses-foundation-telemetry-mode")
    if (aux_info.get("ip")!="192.168.77.11" or aux_info.get("mac","").replace(":","").lower()!=AUX_MAC
        or aux_info.get("live") is not True or aux_info.get("lm")!="DDP" or aux_info.get("lip")!="192.168.77.10"
        or aux_info.get("leds",{}).get("count")!=22 or aux_state.get("lor")!=0):
        raise RuntimeError("combined-check-aux-projection-not-healthy")

    persisted=_persisted_settings(get)
    restore_payload,original_controls,original_segments=_capture_restore_state(state,persisted)
    checks={};palette_index=None;palette_name=None;mutation_attempted=False;primary_error=None;cleanup={"attempted":False,"verified":False}
    try:
        palettes=get(MATRIX+"/json/pal")
        if not isinstance(palettes,list):raise RuntimeError("combined-check-named-palette-list-unavailable")
        named=next(((i,name) for i,name in enumerate(palettes)
                    if isinstance(name,str) and name.strip() not in ("","RSVD","-")),None)
        if named is None:raise RuntimeError("combined-check-no-named-palette-available")
        palette_index,palette_name=named
        payload={"on":True,"HBNF":{
            "vibe":"groove","scene":"field-mix","motion":70,"audioResponse":75,
            "matrixBrightness":h.get("matrixBrightness"),"auxBrightness":h.get("auxBrightness"),
            "palette":{"mode":"wled","index":palette_index},
            "overlay":{"id":"r6-combined-check","kind":"scoreboard","label":"SCORES",
                        "entries":["TEAM A 2","TEAM B 1"],"ttlMs":5000}
        }}
        mutation_attempted=True
        post(MATRIX+"/json/state",payload)
        sleep(0.2)
        observed=get(MATRIX+"/json/state");oh=observed.get("HBNF",{});audio=oh.get("audio",{})
        aux_info_after=get(AUX+"/json/info");aux_state_after=get(AUX+"/json/state")
        checks={
            "candidate_identity":oh.get("candidate")==expected_release,
            "vibe_audio_controls":(oh.get("vibe")==1 and oh.get("motion")==70 and oh.get("audioResponse")==75
                and all(isinstance(audio.get(k),(int,float)) for k in ("bass","mid","treble","volume","peak"))),
            "named_palette_applied_and_read_back":(oh.get("scene")==1 and oh.get("palette",{}).get("mode")=="wled"
                and oh.get("palette",{}).get("index")==palette_index),
            "native_text_scoreboard_overlay":oh.get("overlayId")=="r6-combined-check",
            "matrix_aux_ddp_projection":(aux_info_after.get("live") is True and aux_info_after.get("lm")=="DDP"
                and aux_info_after.get("lip")=="192.168.77.10" and aux_state_after.get("lor")==0),
        }
        post(MATRIX+"/json/state",{"on":True,"HBNF":{"overlay":{"id":"r6-mixed-case-check","kind":"text",
            "text":"HeLLo","color":"#FFFFFF","ttlMs":5000}}})
        sleep(0.2)
        text_observed=get(MATRIX+"/json/state").get("HBNF",{})
        checks["mixed_case_text_command_applied"]=(text_observed.get("overlayId")=="r6-mixed-case-check")
    except Exception as exc:
        primary_error=f"{type(exc).__name__}: {exc}"
    finally:
        if mutation_attempted:
            cleanup["attempted"]=True
            restore_post_error=None
            try:
                post(MATRIX+"/json/state",restore_payload)
            except Exception as exc:
                # A lost POST response is ambiguous; never resend a state
                # mutation. Resolve it with ordinary read-only state/config.
                restore_post_error=f"{type(exc).__name__}: {exc}"
            try:
                sleep(RESTORE_SETTLE_SECONDS)
                restored=get(MATRIX+"/json/state")
                saved=_persisted_settings(get)
                comparisons=_restore_comparison(restored,saved,original_controls,original_segments,restore_payload)
                cleanup["verified"]=all(comparisons.values())
                cleanup["checks"]=comparisons
                cleanup["post_outcome"]=("READBACK_CONFIRMED_AFTER_AMBIGUOUS_RESPONSE"
                    if restore_post_error and cleanup["verified"] else
                    "RESPONSE_LOST_READBACK_MISMATCH" if restore_post_error else "RESPONSE_RECEIVED")
                cleanup["runtime_controls"]={k:restored.get("HBNF",{}).get(k) for k in original_controls}
                cleanup["persisted_settings"]=saved
                if not cleanup["verified"]:
                    cleanup["error"]=restore_post_error or "readback-did-not-match-captured-owner-state"
            except Exception as exc:
                cleanup["error"]=restore_post_error or f"{type(exc).__name__}: {exc}"
    status="PASS" if (not primary_error and all(checks.values()) and cleanup.get("verified")) else "FAIL"
    return {"schema":"hbnf-r6-combined-feature-check-v1","status":status,
            "expected_release_id":expected_release,"checks":checks,"cleanup":cleanup,
            "error":primary_error,"named_palette":{"index":palette_index,"name":palette_name},
            "text_input":"HeLLo",
            "text_centering":"requires final visual owner review; API readback cannot measure optical centering",
            "owner_controls_scoring_status":"NOT_PROVEN_BY_LOCAL_WLED_CHECK; retain existing owner/backend acceptance gate",
            "restore":"self-contained readback of captured WLED state and persisted HBNF settings",
            "audio_semantics":"runtime audio fields were read; this is not labeled music or owner audio acceptance"}

def main(argv=None):
    ap=argparse.ArgumentParser()
    ap.add_argument("--release-id",required=True)
    ap.add_argument("--out",required=True)
    ap.add_argument("--require-normal-mode",action="store_true",
        help="For the provisional smoke, refuse Packet20/Foundation diagnostic state.")
    args=ap.parse_args(argv)
    try: result=check(args.release_id,require_normal_mode=args.require_normal_mode)
    except Exception as exc:
        result={"schema":"hbnf-r6-combined-feature-check-v1","status":"FAIL","error":f"{type(exc).__name__}: {exc}"}
    path=pathlib.Path(args.out);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    print(json.dumps(result,sort_keys=True))
    return 0 if result.get("status")=="PASS" else 2

if __name__=="__main__":raise SystemExit(main())
