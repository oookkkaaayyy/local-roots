#!/usr/bin/env python3
"""Direct-LAN adapter for the bounded R4 Foundation-metrics transaction."""
from __future__ import annotations
import argparse, json, pathlib, sys, time, urllib.request

MATRIX="http://192.168.77.10"
AUX="http://192.168.77.11"
EXPECTED="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1"
MAC="704bca5b345c"
CACHE=pathlib.Path("/tmp/hbnf-foundation-telemetry-cache.json")

def get(url, timeout=5):
    req=urllib.request.Request(url,headers={"Accept":"application/json","Cache-Control":"no-store"})
    with urllib.request.urlopen(req,timeout=timeout) as r:return json.loads(r.read().decode())

def post_state(payload, timeout=8):
    req=urllib.request.Request(MATRIX+"/json/state",data=json.dumps(payload,separators=(",",":")).encode(),headers={"Content-Type":"application/json"},method="POST")
    with urllib.request.urlopen(req,timeout=timeout) as r:
        raw=r.read().decode();return json.loads(raw) if raw.strip() else {}

def p20_state():
    state=get(MATRIX+"/json/state");return state,state.get("HBNF",{}).get("packet20Diagnostic",{})

def command(op,**kw):
    post_state({"on":True,"HBNF":{"packet20Diagnostic":{"op":op,**kw}}})
    deadline=time.monotonic()+10;last=None
    while time.monotonic()<deadline:
        _,last=p20_state()
        if last.get("lastCommand")==op:return {"HBNF":{"packet20Diagnostic":last}}
        time.sleep(.1)
    raise RuntimeError("packet20-command-ack-timeout:"+op)

def enable_tails(enabled):
    state,p20=p20_state(); current=state.get("HBNF",{}).get("foundationTelemetry",{}).get("enabled")
    if current is not enabled:
        post_state({"on":True,"HBNF":{"foundationTelemetry":{"enabled":enabled}}})
        deadline=time.monotonic()+12
        while time.monotonic()<deadline:
            state,p20=p20_state()
            if state.get("HBNF",{}).get("foundationTelemetry",{}).get("enabled") is enabled:return state,p20
            time.sleep(.25)
        raise RuntimeError("foundation-telemetry-mode-timeout")
    return state,p20

def identity():
    info=get(MATRIX+"/json/info"); build=get(MATRIX+"/hbnf/build.json")
    if info.get("ip")!="192.168.77.10" or info.get("mac","").replace(":","").lower()!=MAC:raise RuntimeError("matrix-ip-or-mac-mismatch")
    if build.get("release_id")!=EXPECTED or build.get("candidate")!=EXPECTED:raise RuntimeError("foundation-metrics-release-identity-mismatch")
    return info,build

def snapshot(observer_output=None):
    identity(); state,p20=p20_state()
    new_snapshot=not p20.get("snapshotValid")
    if not p20.get("enabled"):
        command("begin"); time.sleep(1); state,p20=p20_state()
    if not p20.get("snapshotValid") and p20.get("snapshotState")=="IDLE":
        if not command("snapshot").get("HBNF",{}).get("packet20Diagnostic",{}).get("lastCommandAccepted",False):raise RuntimeError("packet20-snapshot-command-rejected")
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            state,p20=p20_state()
            if p20.get("snapshotState")=="READY" and p20.get("snapshotValid"):break
            if p20.get("snapshotState")=="FAILED":raise RuntimeError("packet20-snapshot-failed")
            time.sleep(.25)
        else:raise RuntimeError("packet20-snapshot-ready-timeout")
    if not p20.get("snapshotValid") or p20.get("snapshotState")!="READY":raise RuntimeError("packet20-existing-snapshot-not-ready")
    if new_snapshot and observer_output:
        try:observer_effect(observer_output)
        except Exception:
            _restore_snapshot(p20.get("snapshotId"),p20.get("snapshotHash"))
            raise
    return {"snapshotId":p20.get("snapshotId"),"snapshotHash":p20.get("snapshotHash")}

def observer_effect(output):
    select(0);time.sleep(5)
    enable_tails(False)
    light=[];deadline=time.monotonic()+30
    while time.monotonic()<deadline:
        s,_=p20_state();v=s.get("HBNF",{}).get("timing",{}).get("wholeFrameUs")
        if v is not None:light.append(float(v)/1000.0)
        time.sleep(1)
    enable_tails(True)
    heavy=[];deadline=time.monotonic()+30
    while time.monotonic()<deadline:
        s,_=p20_state();v=s.get("HBNF",{}).get("timing",{}).get("wholeFrameUs")
        if v is not None:heavy.append(float(v)/1000.0)
        time.sleep(1)
    if len(light)<20 or len(heavy)<20:raise RuntimeError("observer-effect-window-under-sampled")
    light.sort();heavy.sort();lm=light[len(light)//2];hm=heavy[len(heavy)//2]
    result={"status":"MEASURED","kernel_id":0,"lightweight_samples":len(light),"instrumented_samples":len(heavy),"lightweight_frame_average_median_ms":lm,"instrumented_frame_average_median_ms":hm,"relative_delta_pct":(hm-lm)*100.0/lm if lm else None,"metric":"same 1-second latest-frame-average source in both modes; true tail samples reserved for the foundation sweep"}
    path=pathlib.Path(output);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    enable_tails(False)
    return result

def _restore_snapshot(sid,shash):
    state,p20=p20_state()
    if p20.get("restoreVerified") is not True:
        if not command("restore",snapshotId=int(sid)).get("HBNF",{}).get("packet20Diagnostic",{}).get("lastCommandAccepted",False):raise RuntimeError("packet20-restore-command-rejected")
        deadline=time.monotonic()+45
        while time.monotonic()<deadline:
            state,p20=p20_state()
            if p20.get("restoreVerified") is True:break
            if p20.get("snapshotState")=="FAILED":raise RuntimeError("packet20-restore-failed")
            time.sleep(.25)
        else:raise RuntimeError("packet20-restore-verification-timeout")
    if int(p20.get("snapshotHash",-1))!=int(shash):raise RuntimeError("packet20-snapshot-hash-mismatch")
    return {"restoreVerified":True,"snapshotId":int(sid),"snapshotHash":int(shash),"packet20Same":True}

def select(kernel):
    if not command("select",kernel=int(kernel)).get("HBNF",{}).get("packet20Diagnostic",{}).get("lastCommandAccepted",False):raise RuntimeError("packet20-kernel-select-rejected")

def telemetry(inventory):
    info,build=identity(); state,p20=enable_tails(True)
    deadline=time.monotonic()+5
    while state.get("HBNF",{}).get("foundationTelemetry",{}).get("frameMsP99") is None and time.monotonic()<deadline:
        time.sleep(.1);state,p20=p20_state()
    h=state["HBNF"]; timing=h["timing"]; ft=h.get("foundationTelemetry",{})
    if not ft.get("enabled") or ft.get("frameMsP99") is None:raise RuntimeError("foundation-frame-tail-contract-missing")
    aux=get(AUX+"/json/info"); leds=aux.get("leds",{})
    inv=json.loads(pathlib.Path(inventory).read_text())
    kid=int(timing["kernel"])
    entry=next((x for x in inv["entries"] if int(x["runtime_kernel_index_expected"])==kid),None)
    if entry is None:raise RuntimeError("runtime-kernel-outside-inventory")
    cache={"companion_count":int(h.get("companionRenderCount",0)),"restart_count":0,"uptime":int(timing["uptimeSec"]),"last_aux_progress_monotonic":time.monotonic()}
    try: old=json.loads(CACHE.read_text())
    except Exception: old={}
    if cache["uptime"]<int(old.get("uptime",0)):cache["restart_count"]=int(old.get("restart_count",0))+1
    else:cache["restart_count"]=int(old.get("restart_count",0))
    if cache["companion_count"]==int(old.get("companion_count",-1)):
        cache["last_aux_progress_monotonic"]=float(old.get("last_aux_progress_monotonic",cache["last_aux_progress_monotonic"]))
    CACHE.write_text(json.dumps(cache))
    age=max(0,int((time.monotonic()-cache["last_aux_progress_monotonic"])*1000))
    sample={
      "release_id":build["release_id"],"uptime_seconds":timing["uptimeSec"],"fps":timing["fps"],
      "frame_ms_avg":ft.get("frameMsAvg"),"frame_ms_p50":ft.get("frameMsP50"),"frame_ms_p95":ft.get("frameMsP95"),"frame_ms_p99":ft.get("frameMsP99"),"frame_ms_max":ft.get("frameMsMax"),
      "kernel_id":kid,"kernel_name":entry["kernel_name"],"variant_id":timing["variantSignature"],
      "free_heap_bytes":timing["freeHeap"],"minimum_free_heap_bytes":ft.get("minimumFreeHeapBytes"),"largest_free_block_bytes":ft.get("largestFreeBlockBytes"),
      "websocket_clients":info.get("ws"),"aux_projection_active":bool(aux.get("live") and aux.get("lm")=="DDP"),"aux_projection_age_ms":age,"aux_render_fps":leds.get("fps"),
      "wifi_rssi_dbm":timing["rssi"],"restart_count":cache["restart_count"],
      "kernel_ms_avg":ft.get("kernelMsAvg"),"kernel_ms_p95":ft.get("kernelMsP95"),"palette_ms_avg":ft.get("paletteMsAvg"),"palette_ms_p95":ft.get("paletteMsP95"),
      "audio_ms_avg":ft.get("audioMsAvg"),"audio_ms_p95":ft.get("audioMsP95"),"scheduler_ms_avg":ft.get("schedulerMsAvg"),"scheduler_ms_p95":ft.get("schedulerMsP95"),
      "overlay_ms_avg":ft.get("overlayMsAvg"),"overlay_ms_p95":ft.get("overlayMsP95"),"aux_prepare_send_ms_avg":ft.get("auxPrepareSendMsAvg"),"aux_prepare_send_ms_p95":ft.get("auxPrepareSendMsP95"),
      "unaccounted_ms_avg":ft.get("unaccountedMsAvg"),"unaccounted_ms_p95":ft.get("unaccountedMsP95"),
    }
    print(json.dumps(sample,separators=(",",":")))

def restore(path):
    snap=json.loads(pathlib.Path(path).read_text()); sid=int(snap["snapshotId"])
    print(json.dumps(_restore_snapshot(sid,snap["snapshotHash"])))

def main():
    ap=argparse.ArgumentParser();sub=ap.add_subparsers(dest="action",required=True)
    s0=sub.add_parser("snapshot");s0.add_argument("--observer-output")
    s=sub.add_parser("select");s.add_argument("--kernel",required=True)
    t=sub.add_parser("telemetry");t.add_argument("--inventory",required=True)
    r=sub.add_parser("restore");r.add_argument("--snapshot-file",required=True)
    a=ap.parse_args()
    if a.action=="snapshot":print(json.dumps(snapshot(a.observer_output),separators=(",",":")))
    elif a.action=="select":select(a.kernel)
    elif a.action=="telemetry":telemetry(a.inventory)
    elif a.action=="restore":restore(a.snapshot_file)
if __name__=="__main__":
    try:main()
    except Exception as e:print(f"foundation adapter error: {e}",file=sys.stderr);sys.exit(2)
