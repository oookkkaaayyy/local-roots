#!/usr/bin/env python3
"""HBNF local aux commissioning helper.

Safe default: READ ONLY.
The only mutation mode is --apply-runtime-sync, which changes WLED runtime
UDP-sync flags and segment selection. It does not alter LED bus/GPIO config,
current limits, Wi-Fi, presets, or firmware.
"""
from __future__ import annotations
import argparse, concurrent.futures, ipaddress, json, sys, urllib.error, urllib.request

R3_RELEASE="hbnf-wow-r3-max-2026-09-21-v3"
R3_ENGINE="r3-wow-max"
WITNESS="registry28-fixed-v3"
MATRIX_PIXELS=512
FX_FIRST=220
EFFECTS=[
"Complex_Kaleido_3","Big_Caleido","Parametric_Water","RGB_Blobs5","Polar_Waves","Zoom2",
"Complex_Kaleido_4","Complex_Kaleido_6","Water","RGB_Blobs4","Complex_Kaleido_5","Spiralus2",
"Hot_Blob","Caleido3","Waves","Chasing_Spirals","Rotating_Blob","Center_Field",
"Distance_Experiment","Lava1","Caleido2","Yves","Scaledemo1","Zoom","Complex_Kaleido",
"RGB_Blobs3","SM5","Module_Experiment10"
]

def request_json(ip:str,path:str,method="GET",body=None,timeout=1.5):
    data=None
    headers={"Accept":"application/json"}
    if body is not None:
        data=json.dumps(body,separators=(",",":")).encode()
        headers["Content-Type"]="application/json"
    req=urllib.request.Request(f"http://{ip}{path}",data=data,headers=headers,method=method)
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8","replace"))

def safe_get(ip,path,timeout=1.5):
    try:
        return request_json(ip,path,timeout=timeout)
    except Exception as e:
        return {"_error":f"{type(e).__name__}: {e}"}

def inspect(ip:str):
    return {
        "ip":ip,
        "state":safe_get(ip,"/json/state",2.0),
        "info":safe_get(ip,"/json/info",2.0),
        "effects":safe_get(ip,"/json/eff",2.0),
        "pins":safe_get(ip,"/json/pins",2.0),
        "cfg":safe_get(ip,"/json/cfg",3.0),
    }

def looks_like_wled(d):
    i=d.get("info") or {}
    return not i.get("_error") and bool(i.get("ver") or i.get("brand")=="WLED" or "WLED" in str(i.get("product","")))

def discover(matrix_ip:str,subnet:str|None):
    net=ipaddress.ip_network(subnet or f"{matrix_ip}/24",strict=False)
    hosts=[str(x) for x in net.hosts() if str(x)!=matrix_ip]
    def probe(ip):
        try:
            info=request_json(ip,"/json/info",timeout=.35)
            if info.get("ver") or info.get("brand")=="WLED" or "WLED" in str(info.get("product","")):
                return ip
        except Exception:
            return None
    out=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=48) as ex:
        for v in ex.map(probe,hosts):
            if v: out.append(v)
    return out

def check_matrix(d):
    s=d.get("state") or {}; i=d.get("info") or {}; e=d.get("effects") or []
    wow=s.get("HBNFWOW") or {}
    checks={
        "reachable":looks_like_wled(d),
        "pixels":((i.get("leds") or {}).get("count")==MATRIX_PIXELS),
        "release":wow.get("release")==R3_RELEASE,
        "engine":wow.get("engine")==R3_ENGINE,
        "buildWitness":wow.get("buildWitness")==WITNESS,
        "fxRegistered":wow.get("fxRegistered")==28,
        "fxFailed":wow.get("fxFailed")==0,
        "modeCount":wow.get("modeCount")==248,
        "fxFirst":wow.get("fxFirst")==220,
        "fxLast":wow.get("fxLast")==247,
        "effectMap":isinstance(e,list) and len(e)>=248 and e[220:248]==EFFECTS,
    }
    return checks

def check_aux(d):
    s=d.get("state") or {}; i=d.get("info") or {}
    segs={int(x.get("id",n)):x for n,x in enumerate(s.get("seg") or []) if isinstance(x,dict)}
    ud=s.get("udpn") or {}
    return {
        "reachable":looks_like_wled(d),
        "wledVersion":i.get("ver"),
        "ledCount":(i.get("leds") or {}).get("count"),
        "maxPowerMa":(i.get("leds") or {}).get("maxpwr"),
        "mainseg":s.get("mainseg"),
        "udpReceive":ud.get("recv"),
        "receiveGroup":ud.get("rgrp"),
        "segment0Selected":(segs.get(0) or {}).get("sel"),
        "segment1Selected":(segs.get(1) or {}).get("sel"),
        "segment2Selected":(segs.get(2) or {}).get("sel"),
        "pins":d.get("pins"),
    }

def apply_runtime_sync(matrix_ip,aux_ip):
    m=inspect(matrix_ip)
    mc=check_matrix(m)
    if not all(mc.values()):
        raise RuntimeError("Matrix R3 verification failed; refusing mutation: "+json.dumps(mc,sort_keys=True))
    request_json(matrix_ip,"/json/state","POST",{"udpn":{"send":True,"sgrp":1}},timeout=3)
    request_json(aux_ip,"/json/state","POST",{
        "udpn":{"recv":True,"rgrp":1},
        "mainseg":0,
        "seg":[{"id":0,"sel":True},{"id":1,"sel":False},{"id":2,"sel":False}]
    },timeout=3)
    return {"matrix":inspect(matrix_ip),"aux":inspect(aux_ip)}

def selftest():
    fx=["x"]*220+EFFECTS
    sample={"state":{"HBNFWOW":{"release":R3_RELEASE,"engine":R3_ENGINE,"buildWitness":WITNESS,
        "fxRegistered":28,"fxFailed":0,"modeCount":248,"fxFirst":220,"fxLast":247}},
        "info":{"ver":"0.16.1","leds":{"count":512}},"effects":fx}
    assert all(check_matrix(sample).values())
    aux={"state":{"mainseg":0,"udpn":{"recv":True,"rgrp":1},"seg":[{"id":0,"sel":True},{"id":1,"sel":False},{"id":2,"sel":False}]},
         "info":{"ver":"0.16.1","leds":{"count":100,"maxpwr":900}},"effects":[]}
    c=check_aux(aux)
    assert c["mainseg"]==0 and c["udpReceive"] is True and c["segment0Selected"] is True
    print("HBNF_AUX_LOCAL_COMMISSION_SELFTEST_PASS")

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--matrix",default="192.168.68.89")
    p.add_argument("--aux",default="auto")
    p.add_argument("--subnet",default=None)
    p.add_argument("--apply-runtime-sync",action="store_true")
    p.add_argument("--selftest",action="store_true")
    a=p.parse_args()
    if a.selftest:
        selftest(); return 0
    matrix=inspect(a.matrix)
    mchecks=check_matrix(matrix)
    candidates=discover(a.matrix,a.subnet) if a.aux=="auto" else [a.aux]
    aux_ip=None; inspected={}
    for ip in candidates:
        d=inspect(ip); inspected[ip]=d
        if looks_like_wled(d):
            aux_ip=ip; break
    result={"mutationIssued":False,"matrix":{"ip":a.matrix,"checks":mchecks},"candidates":candidates,"auxIp":aux_ip}
    if aux_ip:
        result["aux"]=check_aux(inspected[aux_ip])
    if a.apply_runtime_sync:
        if not aux_ip: raise RuntimeError("No auxiliary WLED node found.")
        applied=apply_runtime_sync(a.matrix,aux_ip)
        result["mutationIssued"]=True
        result["postApply"]={"matrix":check_matrix(applied["matrix"]),"aux":check_aux(applied["aux"])}
    print(json.dumps(result,indent=2,sort_keys=True))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
