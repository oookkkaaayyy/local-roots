#!/usr/bin/env python3
"""Read-only HBNF AUX commissioning operator.

This wrapper intentionally performs NO device mutation. It verifies the frozen
package, discovers Matrix/Aux WLED nodes, takes a timestamped backup of any
unambiguous Aux candidate, and emits a machine-readable readiness report.
Physical/visible mutation remains delegated to the separately guarded tools.
"""
from __future__ import annotations
import argparse, hashlib, json, pathlib, sys, time, urllib.request

HERE=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import local_commission as lc

EXPECTED_FW_SHA="dee7261313b00e7c12e1482bc31e5f45311fba40a95e5eaf53d4eb9a9e96e0bf"
EXPECTED_FW_BYTES=1342736
BACKUP_PATHS=["/json/cfg","/json/state","/json/info","/json/eff","/json/pins","/presets.json"]


def sha256(path:pathlib.Path)->str:
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()


def verify_package(root:pathlib.Path)->dict:
    fw=root/"HBNF_SP803E_AUX_R3.bin"
    metrics=root/"FINAL_METRICS.txt"
    contract=root/"contract.json"
    scenes=root/"WOW_SCENES_V2.json"
    required=[fw,metrics,contract,scenes,root/"local_commission.py"]
    missing=[p.name for p in required if not p.is_file()]
    if missing: return {"ok":False,"missing":missing}
    got_sha=sha256(fw); got_bytes=fw.stat().st_size
    kv={}
    for line in metrics.read_text().splitlines():
        if '=' in line:
            k,v=line.split('=',1); kv[k]=v
    con=json.loads(contract.read_text()); sc=json.loads(scenes.read_text())
    checks={
      "firmwareSha":got_sha==EXPECTED_FW_SHA==kv.get("firmware_sha256"),
      "firmwareBytes":got_bytes==EXPECTED_FW_BYTES==int(kv.get("firmware_bytes","-1")),
      "release":kv.get("release")==lc.AUX_RELEASE,
      "engine":kv.get("engine")==lc.AUX_ENGINE,
      "witness":kv.get("build_witness")==lc.AUX_WITNESS,
      "effectRange":con["aux"]["effect_ids"]==[220,247],
      "sceneCount":len(sc.get("scenes",[]))==28,
      "projection":con["aux"].get("projection")=="fold2-1d-v1",
      "brightnessIndependent":con["sync"].get("receive_brightness") is False,
      "audioPort":con["sync"].get("audio_port")==11988,
    }
    return {"ok":all(checks.values()),"checks":checks,"firmwareSha256":got_sha,"firmwareBytes":got_bytes}


def raw_get(ip:str,path:str,timeout=4.0)->bytes:
    with lc.DIRECT_OPENER.open(f"http://{ip}{path}",timeout=timeout) as r:
        return r.read()


def backup(ip:str,out_root:pathlib.Path)->pathlib.Path:
    stamp=time.strftime("%Y%m%d-%H%M%S")
    out=out_root/f"HBNF_AUX_BACKUP_{ip.replace('.','-')}_{stamp}"
    out.mkdir(parents=True,exist_ok=False)
    manifest={"ip":ip,"created":stamp,"files":{}}
    for path in BACKUP_PATHS:
        name=path.strip('/').replace('/','__') or 'root'
        dest=out/(name+('.json' if not name.endswith('.json') else ''))
        try:
            data=raw_get(ip,path)
            dest.write_bytes(data)
            manifest["files"][path]={"ok":True,"file":dest.name,"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()}
        except Exception as e:
            manifest["files"][path]={"ok":False,"error":f"{type(e).__name__}: {e}"}
    (out/"BACKUP_MANIFEST.json").write_text(json.dumps(manifest,indent=2,sort_keys=True)+"\n")
    return out


def choose_aux(matrix_ip:str,candidates:list[str],inspected:dict)->tuple[str|None,str]:
    exact=[]
    for ip,d in inspected.items():
        c=lc.check_aux(d)
        if all(c.get(k) for k in ("release","engine","buildWitness","projection","fxRegistered","fxFailed","modeCount","fxFirst","fxLast","effectMap")):
            exact.append(ip)
    if len(exact)==1: return exact[0],"exact-custom-r3"
    if len(exact)>1: return None,"multiple-exact-aux-nodes"
    nonmatrix=[ip for ip in candidates if ip!=matrix_ip]
    if len(nonmatrix)==1: return nonmatrix[0],"single-wled-candidate"
    return None,"ambiguous" if nonmatrix else "none"


def next_action(aux_ip,aux_checks,selection_reason):
    if not aux_ip: return "POWER_OR_IDENTIFY_AUX" if selection_reason=="none" else "DISAMBIGUATE_AUX"
    exact=all(aux_checks.get(k) for k in ("release","engine","buildWitness","projection","fxRegistered","fxFailed","modeCount","fxFirst","fxLast","effectMap"))
    if not exact: return "INSTALL_EXACT_AUX_FIRMWARE"
    if not aux_checks.get("visualSyncReceive") or not aux_checks.get("segmentOptionsIsolated") or not aux_checks.get("audioSyncReceive"):
        return "RUN_GUARDED_PREPARE_SYNC"
    return "BEGIN_PHYSICAL_ACCEPTANCE"


def run_preflight(args):
    root=pathlib.Path(args.package_dir).resolve()
    pkg=verify_package(root)
    matrix=lc.inspect(args.matrix); mc=lc.check_matrix(matrix)
    candidates=lc.discover(args.matrix,args.subnet) if args.aux=="auto" else [args.aux]
    inspected={ip:lc.inspect(ip) for ip in candidates}
    aux_ip,reason=choose_aux(args.matrix,candidates,inspected)
    ac=lc.check_aux(inspected[aux_ip]) if aux_ip else None
    backup_dir=None
    if aux_ip and args.backup:
        backup_dir=str(backup(aux_ip,pathlib.Path(args.backup_root).expanduser().resolve()))
    report={
      "mutationIssued":False,
      "package":pkg,
      "matrix":{"ip":args.matrix,"checks":mc},
      "candidates":candidates,
      "auxSelection":{"ip":aux_ip,"reason":reason},
      "aux":ac,
      "backupDir":backup_dir,
      "nextAction":next_action(aux_ip,ac or {},reason),
    }
    out=json.dumps(report,indent=2,sort_keys=True)
    print(out)
    if args.report:
        pathlib.Path(args.report).expanduser().resolve().write_text(out+"\n")
    return 0 if pkg.get("ok") else 2


def selftest():
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        root=pathlib.Path(td)
        (root/"HBNF_SP803E_AUX_R3.bin").write_bytes(b'x')
        # Verify negative-path sanity without reproducing frozen firmware bytes.
        assert verify_package(root)["ok"] is False
    fx=["x"]*220+lc.EFFECTS
    exact={"state":{"HBNFAUX":{"release":lc.AUX_RELEASE,"engine":lc.AUX_ENGINE,"buildWitness":lc.AUX_WITNESS,"projection":"fold2-1d-v1","fxRegistered":28,"fxFailed":0,"modeCount":248,"fxFirst":220,"fxLast":247}},"info":{"ver":"0.16.1","leds":{"count":40}},"effects":fx,"cfg":{},"pins":{}}
    ip,reason=choose_aux("192.168.1.2",["192.168.1.3"],{"192.168.1.3":exact})
    assert ip=="192.168.1.3" and reason=="exact-custom-r3"
    assert next_action(ip,lc.check_aux(exact),reason)=="RUN_GUARDED_PREPARE_SYNC"
    assert next_action(None,{},"none")=="POWER_OR_IDENTIFY_AUX"
    print("HBNF_AUX_COMMISSION_OPERATOR_SELFTEST_PASS")


def main():
    p=argparse.ArgumentParser(description="HBNF AUX read-only commissioning operator")
    p.add_argument("--matrix",default="192.168.68.89")
    p.add_argument("--aux",default="auto")
    p.add_argument("--subnet",default=None)
    p.add_argument("--package-dir",default=str(HERE))
    p.add_argument("--backup",action="store_true",default=True)
    p.add_argument("--no-backup",dest="backup",action="store_false")
    p.add_argument("--backup-root",default="~/Desktop")
    p.add_argument("--report",default=None)
    p.add_argument("--selftest",action="store_true")
    a=p.parse_args()
    if a.selftest: selftest(); return 0
    return run_preflight(a)

if __name__=="__main__": raise SystemExit(main())
