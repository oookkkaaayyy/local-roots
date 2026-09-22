#!/usr/bin/env python3
"""HBNF local Matrix + SP803E commissioning helper.

Default behavior is READ ONLY.

Mutation mode --prepare-sync only configures synchronization plumbing after the
custom aux firmware is already present:
- Matrix: WLED visual sync SEND group 1 + AudioReactive sound sync SEND/11988.
- Aux: WLED visual sync RECEIVE group 1, no segment options/bounds, selected
  underglow only + AudioReactive sound sync RECEIVE/11988.

It does not change LED bus definitions, GPIO assignments, current limits,
Wi-Fi credentials, firmware, or presets.
"""
from __future__ import annotations
import argparse, concurrent.futures, ipaddress, json, urllib.request

R3_RELEASE="hbnf-wow-r3-max-2026-09-21-v3"
R3_ENGINE="r3-wow-max"
R3_WITNESS="registry28-fixed-v3"
AUX_RELEASE="hbnf-wow-aux-r3-2026-09-22-v1"
AUX_ENGINE="aux-r3-wow-1d"
AUX_WITNESS="registry28-fixed-1d-v1"
MATRIX_PIXELS=512
AUDIO_PORT=11988
EFFECTS=[
"Complex_Kaleido_3","Big_Caleido","Parametric_Water","RGB_Blobs5","Polar_Waves","Zoom2",
"Complex_Kaleido_4","Complex_Kaleido_6","Water","RGB_Blobs4","Complex_Kaleido_5","Spiralus2",
"Hot_Blob","Caleido3","Waves","Chasing_Spirals","Rotating_Blob","Center_Field",
"Distance_Experiment","Lava1","Caleido2","Yves","Scaledemo1","Zoom","Complex_Kaleido",
"RGB_Blobs3","SM5","Module_Experiment10"
]

def request_json(ip:str,path:str,method="GET",body=None,timeout=2.0):
    data=None
    headers={"Accept":"application/json"}
    if body is not None:
        data=json.dumps(body,separators=(",",":")).encode()
        headers["Content-Type"]="application/json"
    req=urllib.request.Request(f"http://{ip}{path}",data=data,headers=headers,method=method)
    with urllib.request.urlopen(req,timeout=timeout) as r:
        raw=r.read().decode("utf-8","replace")
        return json.loads(raw) if raw.strip() else {}

def safe_get(ip,path,timeout=2.0):
    try: return request_json(ip,path,timeout=timeout)
    except Exception as e: return {"_error":f"{type(e).__name__}: {e}"}

def inspect(ip:str):
    return {
        "ip":ip,
        "state":safe_get(ip,"/json/state",2.5),
        "info":safe_get(ip,"/json/info",2.5),
        "effects":safe_get(ip,"/json/eff",3.0),
        "pins":safe_get(ip,"/json/pins",2.0),
        "cfg":safe_get(ip,"/json/cfg",4.0),
    }

def looks_like_wled(d):
    i=d.get("info") or {}
    return not i.get("_error") and bool(i.get("ver") or i.get("brand")=="WLED" or "WLED" in str(i.get("product","")))

def discover(matrix_ip:str,subnet:str|None):
    net=ipaddress.ip_network(subnet or f"{matrix_ip}/24",strict=False)
    hosts=[str(x) for x in net.hosts() if str(x)!=matrix_ip]
    def probe(ip):
        try:
            info=request_json(ip,"/json/info",timeout=.4)
            if info.get("ver") or info.get("brand")=="WLED" or "WLED" in str(info.get("product","")): return ip
        except Exception: pass
        return None
    out=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=48) as ex:
        for v in ex.map(probe,hosts):
            if v: out.append(v)
    return sorted(out,key=lambda x:tuple(map(int,x.split("."))))

def _effect_map_ok(e):
    return isinstance(e,list) and len(e)>=248 and e[220:248]==EFFECTS

def check_matrix(d):
    s=d.get("state") or {}; i=d.get("info") or {}; e=d.get("effects") or []
    wow=s.get("HBNFWOW") or {}
    cfg=d.get("cfg") or {}
    sync=((cfg.get("if") or {}).get("sync") or {})
    ar=((cfg.get("um") or {}).get("AudioReactive") or {})
    arsync=(ar.get("sync") or {})
    send=(sync.get("send") or {})
    return {
        "reachable":looks_like_wled(d),
        "pixels":((i.get("leds") or {}).get("count")==MATRIX_PIXELS),
        "release":wow.get("release")==R3_RELEASE,
        "engine":wow.get("engine")==R3_ENGINE,
        "buildWitness":wow.get("buildWitness")==R3_WITNESS,
        "fxRegistered":wow.get("fxRegistered")==28,
        "fxFailed":wow.get("fxFailed")==0,
        "modeCount":wow.get("modeCount")==248,
        "fxFirst":wow.get("fxFirst")==220,
        "fxLast":wow.get("fxLast")==247,
        "effectMap":_effect_map_ok(e),
        "visualSyncSend":send.get("en") is True and int(send.get("grp") or 0)==1,
        "audioSyncSend":int(arsync.get("mode") or 0)==1 and int(arsync.get("port") or 0)==AUDIO_PORT,
    }

def check_aux(d):
    s=d.get("state") or {}; i=d.get("info") or {}; e=d.get("effects") or []
    aux=s.get("HBNFAUX") or {}
    segs={int(x.get("id",n)):x for n,x in enumerate(s.get("seg") or []) if isinstance(x,dict)}
    cfg=d.get("cfg") or {}
    sync=((cfg.get("if") or {}).get("sync") or {})
    recv=(sync.get("recv") or {})
    send=(sync.get("send") or {})
    ar=((cfg.get("um") or {}).get("AudioReactive") or {})
    arsync=(ar.get("sync") or {})
    mqtt=((cfg.get("if") or {}).get("mqtt") or {})
    topics=(mqtt.get("topics") or {})
    return {
        "reachable":looks_like_wled(d),
        "wledVersion":i.get("ver"),
        "arch":i.get("arch"),
        "ledCount":(i.get("leds") or {}).get("count"),
        "maxPowerMa":(i.get("leds") or {}).get("maxpwr"),
        "release":aux.get("release")==AUX_RELEASE,
        "engine":aux.get("engine")==AUX_ENGINE,
        "buildWitness":aux.get("buildWitness")==AUX_WITNESS,
        "projection":aux.get("projection")=="1d-row",
        "fxRegistered":aux.get("fxRegistered")==28,
        "fxFailed":aux.get("fxFailed")==0,
        "modeCount":aux.get("modeCount")==248,
        "fxFirst":aux.get("fxFirst")==220,
        "fxLast":aux.get("fxLast")==247,
        "effectMap":_effect_map_ok(e),
        "mainseg":s.get("mainseg"),
        "segment0Selected":(segs.get(0) or {}).get("sel"),
        "segment1Selected":(segs.get(1) or {}).get("sel"),
        "segment2Selected":(segs.get(2) or {}).get("sel"),
        "visualSyncReceive":recv.get("bri") is False and recv.get("col") is True and recv.get("fx") is True and recv.get("pal") is True and int(recv.get("grp") or 0)==1,
        "segmentOptionsIsolated":recv.get("seg") is False and recv.get("sb") is False,
        "visualSyncSendDisabled":send.get("en") is False,
        "audioSyncReceive":int(arsync.get("mode") or 0)==2 and int(arsync.get("port") or 0)==AUDIO_PORT,
        "mqttConfigured":mqtt.get("en") is True and str(mqtt.get("broker") or "")=="broker.emqx.io" and int(mqtt.get("port") or 0)==1883 and topics.get("device")=="hbnf/cart/aux1",
        "pins":d.get("pins"),
    }

def _post_cfg(ip,patch):
    # WLED deserializeConfig preserves values absent from a partial document.
    # sv=true persists the resulting complete runtime config through WLED's own
    # serializer; no Wi-Fi, bus or unrelated values are supplied here.
    body=dict(patch)
    body["sv"]=True
    return request_json(ip,"/json/cfg","POST",body,timeout=6)

MATRIX_CFG_PATCH={
  "if":{"sync":{"send":{"en":True,"dir":True,"grp":1}}},
  "um":{"AudioReactive":{"sync":{"port":AUDIO_PORT,"mode":1}}}
}
AUX_CFG_PATCH={
  "if":{
    "sync":{
      "recv":{"bri":False,"col":True,"fx":True,"pal":True,"grp":1,"seg":False,"sb":False},
      "send":{"en":False,"grp":0}
    },
    "mqtt":{
      "en":True,"broker":"broker.emqx.io","port":1883,
      "topics":{"device":"hbnf/cart/aux1","group":""}
    }
  },
  "um":{"AudioReactive":{"sync":{"port":AUDIO_PORT,"mode":2}}}
}

def prepare_sync(matrix_ip,aux_ip):
    m=inspect(matrix_ip); a=inspect(aux_ip)
    mc=check_matrix(m); ac=check_aux(a)
    matrix_identity=all(mc[k] for k in ("reachable","pixels","release","engine","buildWitness","fxRegistered","fxFailed","modeCount","fxFirst","fxLast","effectMap"))
    aux_identity=all(ac[k] for k in ("reachable","release","engine","buildWitness","projection","fxRegistered","fxFailed","modeCount","fxFirst","fxLast","effectMap"))
    if not matrix_identity: raise RuntimeError("Matrix R3 identity failed; refusing sync mutation: "+json.dumps(mc,sort_keys=True))
    if not aux_identity: raise RuntimeError("Aux custom R3 identity failed; refusing sync mutation: "+json.dumps(ac,sort_keys=True))
    _post_cfg(matrix_ip,MATRIX_CFG_PATCH)
    _post_cfg(aux_ip,AUX_CFG_PATCH)
    # Runtime group + selected segment state. Receiver enable booleans live only
    # in persistent config, not in the /json/state udpn object.
    request_json(matrix_ip,"/json/state","POST",{"udpn":{"send":True,"sgrp":1}},timeout=4)
    request_json(aux_ip,"/json/state","POST",{
      "udpn":{"send":False,"rgrp":1},
      "mainseg":0,
      "seg":[{"id":0,"sel":True},{"id":1,"sel":False},{"id":2,"sel":False}]
    },timeout=4)
    return {"matrix":inspect(matrix_ip),"aux":inspect(aux_ip)}

def selftest():
    fx=["x"]*220+EFFECTS
    matrix={
      "state":{"HBNFWOW":{"release":R3_RELEASE,"engine":R3_ENGINE,"buildWitness":R3_WITNESS,"fxRegistered":28,"fxFailed":0,"modeCount":248,"fxFirst":220,"fxLast":247}},
      "info":{"ver":"0.16.1","leds":{"count":512}},"effects":fx,
      "cfg":{"if":{"sync":{"send":{"en":True,"grp":1}}},"um":{"AudioReactive":{"sync":{"mode":1,"port":11988}}}}
    }
    assert all(check_matrix(matrix).values())
    aux={
      "state":{"HBNFAUX":{"release":AUX_RELEASE,"engine":AUX_ENGINE,"buildWitness":AUX_WITNESS,"projection":"1d-row","fxRegistered":28,"fxFailed":0,"modeCount":248,"fxFirst":220,"fxLast":247},
               "mainseg":0,"seg":[{"id":0,"sel":True},{"id":1,"sel":False},{"id":2,"sel":False}]},
      "info":{"ver":"0.16.1","arch":"esp32","leds":{"count":100,"maxpwr":900}},"effects":fx,"pins":{},
      "cfg":{"if":{"sync":{"recv":{"bri":True,"col":True,"fx":True,"pal":True,"grp":1,"seg":False,"sb":False},"send":{"en":False}},
                         "mqtt":{"en":True,"broker":"broker.emqx.io","port":1883,"topics":{"device":"hbnf/cart/aux1","group":""}}},
             "um":{"AudioReactive":{"sync":{"mode":2,"port":11988}}}}
    }
    c=check_aux(aux)
    required=("reachable","release","engine","buildWitness","projection","fxRegistered","fxFailed","modeCount","fxFirst","fxLast","effectMap","visualSyncReceive","segmentOptionsIsolated","visualSyncSendDisabled","audioSyncReceive","mqttConfigured")
    assert all(c[k] for k in required),c
    assert MATRIX_CFG_PATCH["um"]["AudioReactive"]["sync"]["mode"]==1
    assert AUX_CFG_PATCH["um"]["AudioReactive"]["sync"]["mode"]==2
    assert "recv" not in {"send":True,"sgrp":1}
    print("HBNF_AUX_LOCAL_COMMISSION_SELFTEST_PASS")

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--matrix",default="192.168.68.89")
    p.add_argument("--aux",default="auto")
    p.add_argument("--subnet",default=None)
    p.add_argument("--prepare-sync",action="store_true")
    p.add_argument("--selftest",action="store_true")
    a=p.parse_args()
    if a.selftest: selftest(); return 0
    matrix=inspect(a.matrix); mchecks=check_matrix(matrix)
    candidates=discover(a.matrix,a.subnet) if a.aux=="auto" else [a.aux]
    inspected={ip:inspect(ip) for ip in candidates}
    aux_ip=None
    # Prefer an already-customized aux node, otherwise expose discovered WLED
    # candidates without guessing which device is the cart controller.
    for ip,d in inspected.items():
        ac=check_aux(d)
        if ac["release"] and ac["engine"] and ac["buildWitness"]:
            aux_ip=ip; break
    if aux_ip is None and len(candidates)==1: aux_ip=candidates[0]
    result={"mutationIssued":False,"matrix":{"ip":a.matrix,"checks":mchecks},"candidates":candidates,"auxIp":aux_ip}
    if aux_ip: result["aux"]=check_aux(inspected[aux_ip])
    if a.prepare_sync:
        if not aux_ip: raise RuntimeError("No unambiguous auxiliary WLED node found.")
        applied=prepare_sync(a.matrix,aux_ip)
        result["mutationIssued"]=True
        result["postApply"]={"matrix":check_matrix(applied["matrix"]),"aux":check_aux(applied["aux"])}
    print(json.dumps(result,indent=2,sort_keys=True))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
