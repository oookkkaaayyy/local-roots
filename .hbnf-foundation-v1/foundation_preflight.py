#!/usr/bin/env python3
"""Read-only HBNF Foundation V1 physical/configuration preflight.

This script performs GET requests only. It does not POST state, change WLED
configuration, flash firmware, touch Supabase, or alter the cart.
"""
from __future__ import annotations
import concurrent.futures
import ipaddress
import json
import pathlib
import re
import subprocess
import sys
import time
import urllib.request

DIRECT = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def get_bytes(ip: str, path: str, timeout: float = 1.0) -> bytes:
    req = urllib.request.Request(
        f"http://{ip}{path}",
        headers={"Cache-Control": "no-cache"},
        method="GET",
    )
    with DIRECT.open(req, timeout=timeout) as r:
        return r.read()

def get_json(ip: str, path: str, timeout: float = 1.0):
    return json.loads(get_bytes(ip, path, timeout).decode("utf-8", "replace"))

def default_network():
    if sys.platform != "darwin":
        raise RuntimeError("Foundation preflight currently targets the Mac cart workflow.")
    route = subprocess.run(
        ["/sbin/route", "-n", "get", "default"],
        capture_output=True, text=True, timeout=5, check=True,
    )
    m = re.search(r"\binterface:\s*(\S+)", route.stdout)
    if not m:
        raise RuntimeError("Could not determine active interface.")
    iface = m.group(1)
    ip = subprocess.check_output(
        ["/usr/sbin/ipconfig", "getifaddr", iface], text=True, timeout=5
    ).strip()
    try:
        mask = subprocess.check_output(
            ["/usr/sbin/ipconfig", "getoption", iface, "subnet_mask"],
            text=True, timeout=5
        ).strip()
    except Exception:
        mask = "255.255.255.0"
    net = ipaddress.IPv4Network(f"{ip}/{mask}", strict=False)
    if net.num_addresses > 1024:
        raise RuntimeError(f"Refusing broad scan of {net}; connect to the cart/home LAN.")
    return iface, ip, net

def inspect(ip: str):
    try:
        info = get_json(ip, "/json/info", 0.45)
        if not isinstance(info, dict):
            return None
        state = get_json(ip, "/json/state", 0.65)
        cfg = get_json(ip, "/json/cfg", 0.8)
        return {"ip": ip, "info": info, "state": state, "cfg": cfg}
    except Exception:
        return None

def classify(node):
    st = node.get("state") or {}
    if isinstance(st.get("HBNFAUX"), dict):
        return "aux"
    if isinstance(st.get("HBNFWOW"), dict) or isinstance(st.get("HBNF"), dict):
        return "matrix"
    return "wled-other"

def main():
    iface, local_ip, net = default_network()
    hosts = [str(x) for x in net.hosts()]
    found = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(64, max(8, len(hosts)))) as ex:
        for node in ex.map(inspect, hosts):
            if node:
                node["role"] = classify(node)
                found.append(node)

    report = {
        "schema": "hbnf-foundation-v1-readonly-preflight-v1",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "mutationIssued": False,
        "network": {"interface": iface, "localIp": local_ip, "cidr": str(net)},
        "nodes": found,
        "summary": {
            "matrixCandidates": [n["ip"] for n in found if n["role"] == "matrix"],
            "auxCandidates": [n["ip"] for n in found if n["role"] == "aux"],
            "otherWled": [n["ip"] for n in found if n["role"] == "wled-other"],
        },
    }
    out = pathlib.Path.home() / "Desktop" / (
        "HBNF_FOUNDATION_PREFLIGHT_" + time.strftime("%Y%m%d-%H%M%S") + ".json"
    )
    out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(f"READ-ONLY PRELIGHT COMPLETE: {out}")
    print(json.dumps(report["summary"], indent=2))
    if len(report["summary"]["matrixCandidates"]) != 1 or len(report["summary"]["auxCandidates"]) != 1:
        print("BLOCKED: expected exactly one current Matrix and one current AUX node.")
        return 2
    print("PASS: current Matrix and AUX identities captured. No changes made.")
    return 0

def selftest():
    # Guard the recovery lane against accidental mutation creep.
    src = pathlib.Path(__file__).read_text()
    operational = src.split("def selftest():", 1)[0]
    forbidden = [
        'method="POST"', "urlopen(req, data=", "/update", "wrangler deploy",
        "mqtt", "supabase"
    ]
    for token in forbidden:
        assert token not in operational, token
    assert 'method="GET"' in operational
    print("PASS read-only preflight selftest")

if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        raise SystemExit(0)
    raise SystemExit(main())
