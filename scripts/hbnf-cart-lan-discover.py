#!/usr/bin/env python3
from __future__ import annotations
import argparse, concurrent.futures, ipaddress, json, urllib.request

AUX_MAC="8c94df55c34c"

def norm_mac(v):
    return ''.join(ch for ch in str(v or '').lower() if ch in '0123456789abcdef')

def classify(info):
    try: count=int(info.get('leds',{}).get('count'))
    except Exception: count=None
    mac=norm_mac(info.get('mac'))
    if count==512 and mac!=AUX_MAC:
        return "matrix"
    if mac==AUX_MAC and count!=512:
        return "aux"
    return None

def fetch(ip,timeout):
    url=f"http://{ip}/json/info"
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"HBNF-LAN-discovery/1"})
        with urllib.request.urlopen(req,timeout=timeout) as r:
            if r.status!=200: return None
            info=json.loads(r.read().decode("utf-8"))
        role=classify(info)
        if not role: return None
        return {
            "role":role,"ip":str(ip),"mac":norm_mac(info.get("mac")),
            "ledCount":int(info.get("leds",{}).get("count",-1)),
            "name":info.get("name"),"version":info.get("ver"),
        }
    except Exception:
        return None

def selftest():
    assert classify({"leds":{"count":512},"mac":"aa:bb:cc:dd:ee:ff"})=="matrix"
    assert classify({"leds":{"count":22},"mac":"8c:94:df:55:c3:4c"})=="aux"
    assert classify({"leds":{"count":512},"mac":"8c:94:df:55:c3:4c"}) is None
    assert classify({"leds":{"count":22},"mac":"00:11:22:33:44:55"}) is None
    print("HBNF_LAN_DISCOVERY_SELFTEST=PASS")

def main():
    ap=argparse.ArgumentParser(description="Read-only WLED identity scan for the HBNF cart LAN.")
    ap.add_argument("--subnet",default="192.168.8.0/24")
    ap.add_argument("--timeout",type=float,default=.22)
    ap.add_argument("--workers",type=int,default=48)
    ap.add_argument("--selftest",action="store_true")
    a=ap.parse_args()
    if a.selftest:
        selftest(); return 0
    net=ipaddress.ip_network(a.subnet,strict=True)
    if net.version!=4 or net.prefixlen<24:
        raise SystemExit("Refusing broad scan; subnet must be IPv4 /24 or narrower.")
    hosts=list(net.hosts())
    found=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(a.workers,64))) as ex:
        futures=[ex.submit(fetch,ip,a.timeout) for ip in hosts]
        for f in concurrent.futures.as_completed(futures):
            x=f.result()
            if x: found.append(x)
    by_role={}
    for x in found:
        if x["role"] in by_role:
            print(json.dumps({"ok":False,"error":f"ambiguous_{x['role']}","matches":found},indent=2))
            return 2
        by_role[x["role"]]=x
    if set(by_role)!={"matrix","aux"}:
        print(json.dumps({"ok":False,"error":"required_devices_not_uniquely_found","matches":found},indent=2))
        return 3
    out={
      "ok":True,
      "readonly":True,
      "matrix":{**by_role["matrix"],"reserveAs":"192.168.8.20"},
      "aux":{**by_role["aux"],"reserveAs":"192.168.8.21"},
      "next":"Enter these MAC/IP reservations in Opal, reconnect both clients, then run hbnf-cart-device-preflight.py."
    }
    print(json.dumps(out,indent=2,sort_keys=True))
    return 0

if __name__=="__main__": raise SystemExit(main())
