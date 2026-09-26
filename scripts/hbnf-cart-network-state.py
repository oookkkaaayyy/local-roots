#!/usr/bin/env python3
from __future__ import annotations
import argparse, concurrent.futures, ipaddress, json, urllib.request

AUX_MAC="8c94df55c34c"
DEFAULT_SUBNETS=["192.168.68.0/24","192.168.8.0/24"]

def norm_mac(v):
    return ''.join(ch for ch in str(v or '').lower() if ch in '0123456789abcdef')

def classify(info):
    try: count=int(info.get("leds",{}).get("count"))
    except Exception: count=None
    mac=norm_mac(info.get("mac"))
    if count==512 and mac!=AUX_MAC: return "matrix"
    if mac==AUX_MAC and count!=512: return "aux"
    return None

def fetch(ip,timeout,subnet):
    try:
        req=urllib.request.Request(f"http://{ip}/json/info",headers={"User-Agent":"HBNF-network-state/1"})
        with urllib.request.urlopen(req,timeout=timeout) as r:
            if r.status!=200: return None
            info=json.loads(r.read().decode())
        role=classify(info)
        if not role: return None
        return {"role":role,"ip":str(ip),"subnet":subnet,"mac":norm_mac(info.get("mac")),
                "ledCount":int(info.get("leds",{}).get("count",-1)),"version":info.get("ver")}
    except Exception:
        return None

def scan(subnets,timeout=.18,workers=64):
    found=[]
    jobs=[]
    for subnet in subnets:
        net=ipaddress.ip_network(subnet,strict=True)
        if net.version!=4 or net.prefixlen<24:
            raise ValueError("refusing scan broader than IPv4 /24")
        for ip in net.hosts(): jobs.append((ip,subnet))
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(workers,64))) as ex:
        fs=[ex.submit(fetch,ip,timeout,subnet) for ip,subnet in jobs]
        for f in concurrent.futures.as_completed(fs):
            x=f.result()
            if x: found.append(x)
    return sorted(found,key=lambda x:(x["role"],x["ip"]))

def summarize(found):
    roles={"matrix":[],"aux":[]}
    for x in found: roles[x["role"]].append(x)
    if len(roles["matrix"])>1 or len(roles["aux"])>1:
        state="AMBIGUOUS"
    elif not found:
        state="NONE_FOUND"
    else:
        target=[x for x in found if x["subnet"]=="192.168.8.0/24"]
        legacy=[x for x in found if x["subnet"]=="192.168.68.0/24"]
        target_roles={x["role"] for x in target}
        legacy_roles={x["role"] for x in legacy}
        if target_roles=={"matrix","aux"} and not legacy: state="TARGET_READY"
        elif legacy_roles=={"matrix","aux"} and not target: state="LEGACY_READY"
        elif target and legacy: state="MIXED_MIGRATION"
        elif target: state="TARGET_PARTIAL"
        elif legacy: state="LEGACY_PARTIAL"
        else: state="UNKNOWN"
    return {"ok":state in {"TARGET_READY","LEGACY_READY"},"state":state,"devices":found}

def selftest():
    legacy=[
      {"role":"matrix","ip":"192.168.68.88","subnet":"192.168.68.0/24"},
      {"role":"aux","ip":"192.168.68.90","subnet":"192.168.68.0/24"}]
    target=[
      {"role":"matrix","ip":"192.168.8.20","subnet":"192.168.8.0/24"},
      {"role":"aux","ip":"192.168.8.21","subnet":"192.168.8.0/24"}]
    assert summarize(legacy)["state"]=="LEGACY_READY"
    assert summarize(target)["state"]=="TARGET_READY"
    assert summarize([legacy[0],target[1]])["state"]=="MIXED_MIGRATION"
    assert summarize([])["state"]=="NONE_FOUND"
    print("HBNF_NETWORK_STATE_SELFTEST=PASS")

def main():
    ap=argparse.ArgumentParser(description="Read-only HBNF Matrix/AUX locator across legacy and target cart LANs.")
    ap.add_argument("--subnet",action="append",dest="subnets")
    ap.add_argument("--timeout",type=float,default=.18)
    ap.add_argument("--workers",type=int,default=64)
    ap.add_argument("--selftest",action="store_true")
    a=ap.parse_args()
    if a.selftest: selftest(); return 0
    subnets=a.subnets or DEFAULT_SUBNETS
    try: out=summarize(scan(subnets,a.timeout,a.workers))
    except Exception as e:
        print(json.dumps({"ok":False,"state":"SCAN_ERROR","error":str(e)},indent=2)); return 2
    print(json.dumps(out,indent=2,sort_keys=True))
    return 0 if out["state"] in {"TARGET_READY","LEGACY_READY","MIXED_MIGRATION","TARGET_PARTIAL","LEGACY_PARTIAL"} else 3

if __name__=="__main__": raise SystemExit(main())
