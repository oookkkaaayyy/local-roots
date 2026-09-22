#!/usr/bin/env python3
"""Guarded HBNF AUX commissioning state machine.

Default behavior is read-only. Interactive mutation is only performed after an
exact Matrix/Aux target is identified, a fresh backup is written, and the user
explicitly confirms the requested phase.

The script never updates Supabase physical acceptance flags. Those remain a
separate evidence gate after real electrical/visual/thermal testing.
"""
from __future__ import annotations

import argparse, hashlib, ipaddress, json, pathlib, socket, subprocess, sys, time
import urllib.error, urllib.request, uuid

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import local_commission as lc
import commission_operator as op
import generate_aux_hardware_plan as hp

REPORT_NAME = "HBNF_AUX_COMMISSION_LATEST.json"
MATRIX_IDENTITY_KEYS = ("reachable","pixels","release","engine","buildWitness","fxRegistered","fxFailed","modeCount","fxFirst","fxLast","effectMap")
AUX_IDENTITY_KEYS = ("reachable","release","engine","buildWitness","projection","fxRegistered","fxFailed","modeCount","fxFirst","fxLast","effectMap")
AUX_SYNC_KEYS = ("visualSyncReceive","segmentOptionsIsolated","visualSyncSendDisabled","audioSyncReceive")

def all_true(d, keys): return bool(d) and all(d.get(k) is True for k in keys)

def sha256(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()

def local_ipv4s():
    out=[]
    for iface in ("en0","en1","en2","bridge0"):
        try:
            p=subprocess.run(["ipconfig","getifaddr",iface],capture_output=True,text=True,timeout=1)
            v=p.stdout.strip()
            if p.returncode==0 and v:
                ipaddress.ip_address(v)
                if not v.startswith("127."): out.append(v)
        except Exception: pass
    try:
        s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.settimeout(.2);s.connect(("8.8.8.8",53))
        v=s.getsockname()[0];s.close()
        if v and not v.startswith("127."): out.append(v)
    except Exception: pass
    return list(dict.fromkeys(out))

def candidate_subnets(explicit,matrix_hint):
    if explicit: return [str(ipaddress.ip_network(explicit,strict=False))]
    nets=[]
    for ip in local_ipv4s():
        try: nets.append(str(ipaddress.ip_network(f"{ip}/24",strict=False)))
        except Exception: pass
    if matrix_hint and matrix_hint!="auto":
        try: nets.append(str(ipaddress.ip_network(f"{matrix_hint}/24",strict=False)))
        except Exception: pass
    return list(dict.fromkeys(nets))

def discover_wled(subnets,hint=None,explicit_aux=None):
    found=set()
    for ip in (hint,explicit_aux):
        if ip and ip!="auto":
            try:
                d=lc.inspect(ip)
                if lc.looks_like_wled(d): found.add(ip)
            except Exception: pass
    for net in subnets:
        network=ipaddress.ip_network(net)
        seed=hint if hint and hint!="auto" and ipaddress.ip_address(hint) in network else str(next(network.hosts()))
        for ip in lc.discover(seed,net): found.add(ip)
    return sorted(found,key=lambda x:tuple(map(int,x.split("."))))

def identify_nodes(nodes,forced_aux=None):
    inspected={ip:lc.inspect(ip) for ip in nodes}
    matrices=[];exact_aux=[]
    for ip,d in inspected.items():
        if all_true(lc.check_matrix(d),MATRIX_IDENTITY_KEYS): matrices.append(ip)
        if all_true(lc.check_aux(d),AUX_IDENTITY_KEYS): exact_aux.append(ip)
    matrix_ip=matrices[0] if len(matrices)==1 else None
    if forced_aux and forced_aux!="auto" and forced_aux in inspected and forced_aux!=matrix_ip:
        aux_ip,reason=forced_aux,"explicit"
    elif len(exact_aux)==1:
        aux_ip,reason=exact_aux[0],"exact-custom-r3"
    elif len(exact_aux)>1:
        aux_ip,reason=None,"multiple-exact-aux"
    else:
        nonmatrix=[ip for ip in nodes if ip!=matrix_ip]
        if len(nonmatrix)==1: aux_ip,reason=nonmatrix[0],"single-non-matrix-wled"
        elif not nonmatrix: aux_ip,reason=None,"none"
        else: aux_ip,reason=None,"ambiguous"
    return {"inspected":inspected,"matrixIp":matrix_ip,"matrixCandidates":matrices,"auxIp":aux_ip,"auxReason":reason,"exactAuxCandidates":exact_aux}

def report_path(path):
    return pathlib.Path(path).expanduser().resolve() if path else pathlib.Path.home()/"Desktop"/REPORT_NAME

def write_report(report,path):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,indent=2,sort_keys=True)+"
")

def backup_node(ip,root,label):
    out=op.backup(ip,root)
    tagged=out.with_name(out.name.replace("HBNF_AUX_BACKUP",f"HBNF_{label.upper()}_BACKUP",1))
    try: out.rename(tagged);return tagged
    except Exception: return out

def hardware_summary(d):
    cfg=d.get("cfg") or {};state=d.get("state") or {};hw=((cfg.get("hw") or {}).get("led") or {})
    buses=[]
    for b in hw.get("ins") or []:
        if isinstance(b,dict): buses.append({k:b.get(k) for k in ("pin","start","len","type","order","rev","maxpwr")})
    segs=[]
    for n,s in enumerate(state.get("seg") or []):
        if isinstance(s,dict): segs.append({"id":int(s.get("id",n)),"start":s.get("start"),"stop":s.get("stop"),"sel":s.get("sel"),"on":s.get("on")})
    return {"total":hw.get("total"),"maxpwr":hw.get("maxpwr"),"buses":buses,"segments":segs,"mainseg":state.get("mainseg")}

def hardware_ok(d):
    s=hardware_summary(d);by_pin={tuple(x.get("pin") or []):x for x in s["buses"]}
    u,m,sh=by_pin.get((16,)),by_pin.get((25,)),by_pin.get((26,))
    if not (u and m and sh): return False
    if int(u.get("type") or -1)!=hp.TYPE_DIGITAL_RGB or int(m.get("type") or -1)!=hp.TYPE_ANALOG_1CH or int(sh.get("type") or -1)!=hp.TYPE_ANALOG_1CH: return False
    if int(u.get("maxpwr") or 0)>900 or int(u.get("len") or 0)<1: return False
    seg={int(x["id"]):x for x in s["segments"]}
    return s.get("mainseg")==0 and (seg.get(0) or {}).get("sel") is True and (seg.get(1) or {}).get("sel") is False and (seg.get(2) or {}).get("sel") is False and (seg.get(1) or {}).get("on") is False and (seg.get(2) or {}).get("on") is False

def preflight(args):
    package=op.verify_package(pathlib.Path(args.package_dir).resolve())
    subnets=candidate_subnets(args.subnet,args.matrix_hint)
    nodes=discover_wled(subnets,args.matrix_hint,args.aux)
    ids=identify_nodes(nodes,args.aux)
    m,a=ids["matrixIp"],ids["auxIp"]
    mc=lc.check_matrix(ids["inspected"][m]) if m else None
    ac=lc.check_aux(ids["inspected"][a]) if a else None
    backups={};root=pathlib.Path(args.backup_root).expanduser().resolve()
    if args.backup:
        if m: backups["matrix"]=str(backup_node(m,root,"matrix"))
        if a: backups["aux"]=str(backup_node(a,root,"aux"))
    if not package.get("ok"): nxt="PACKAGE_INVALID"
    elif not m: nxt="POWER_OR_IDENTIFY_MATRIX"
    elif not a: nxt="POWER_OR_IDENTIFY_AUX" if ids["auxReason"]=="none" else "DISAMBIGUATE_AUX"
    elif not all_true(ac,AUX_IDENTITY_KEYS): nxt="INSTALL_EXACT_AUX_FIRMWARE"
    elif not hardware_ok(ids["inspected"][a]): nxt="APPLY_HARDWARE_PLAN"
    elif not all_true(ac,AUX_SYNC_KEYS): nxt="RUN_GUARDED_PREPARE_SYNC"
    else: nxt="BEGIN_PHYSICAL_ACCEPTANCE"
    return {"mutationIssued":False,"package":package,"subnets":subnets,"wledNodes":nodes,"matrix":{"ip":m,"candidates":ids["matrixCandidates"],"checks":mc},"aux":{"ip":a,"selectionReason":ids["auxReason"],"checks":ac},"backups":backups,"nextAction":nxt}

def multipart_firmware(fw):
    boundary="----HBNF"+uuid.uuid4().hex;data=fw.read_bytes()
    chunks=[
      f'--{boundary}
Content-Disposition: form-data; name="skipValidation"

1
'.encode(),
      f'--{boundary}
Content-Disposition: form-data; name="update"; filename="{fw.name}"
Content-Type: application/octet-stream

'.encode(),
      data,f'
--{boundary}--
'.encode()
    ]
    return b"".join(chunks),f"multipart/form-data; boundary={boundary}"

def wait_wled(ip,timeout=90,exact_aux=False):
    deadline=time.time()+timeout;last=None
    while time.time()<deadline:
        try:
            last=lc.inspect(ip)
            if lc.looks_like_wled(last) and (not exact_aux or all_true(lc.check_aux(last),AUX_IDENTITY_KEYS)): return last
        except Exception: pass
        time.sleep(2)
    raise RuntimeError("WLED did not return with the expected identity before timeout.")

def ota_install(ip,fw,timeout=120):
    before=lc.inspect(ip)
    if not lc.looks_like_wled(before): raise RuntimeError("Aux target is not a reachable WLED node.")
    if all_true(lc.check_matrix(before),MATRIX_IDENTITY_KEYS): raise RuntimeError("Target is exact Matrix R3; refusing AUX firmware install.")
    arch=str((before.get("info") or {}).get("arch") or "").lower()
    if "esp32" not in arch: raise RuntimeError(f"Aux target architecture is {arch!r}, not ESP32.")
    if sha256(fw)!=op.EXPECTED_FW_SHA or fw.stat().st_size!=op.EXPECTED_FW_BYTES: raise RuntimeError("Frozen firmware hash/size mismatch.")
    body,ctype=multipart_firmware(fw)
    req=urllib.request.Request(f"http://{ip}/update",data=body,method="POST",headers={"Content-Type":ctype,"Content-Length":str(len(body))})
    try:
        with urllib.request.urlopen(req,timeout=45) as r:
            response=r.read().decode("utf-8","replace");status=int(getattr(r,"status",200))
    except urllib.error.HTTPError as e:
        detail=e.read().decode("utf-8","replace")
        raise RuntimeError(f"OTA HTTP {e.code}: {detail[:400]}") from e
    if status!=200 or "Update successful" not in response: raise RuntimeError(f"OTA did not return success (HTTP {status}).")
    after=wait_wled(ip,timeout,True)
    return {"ok":True,"ip":ip,"checks":lc.check_aux(after)}

def cfg_post(ip,patch):
    body=dict(patch);body["sv"]=True
    return lc.request_json(ip,"/json/cfg","POST",body,timeout=8)

def state_post(ip,patch): return lc.request_json(ip,"/json/state","POST",patch,timeout=6)

def hw_rollback(d):
    cfg=d.get("cfg") or {};state=d.get("state") or {}
    return {"cfg":{"hw":{"led":((cfg.get("hw") or {}).get("led") or {})}},"state":{"mainseg":state.get("mainseg",0),"seg":state.get("seg") or []}}

def apply_hardware(ip,plan):
    before=lc.inspect(ip)
    if not all_true(lc.check_aux(before),AUX_IDENTITY_KEYS): raise RuntimeError("Exact AUX R3 identity not proven.")
    rb=hw_rollback(before)
    try:
        cfg_post(ip,plan["cfgPatch"]);wait_wled(ip,60,True);state_post(ip,plan["statePatch"]);time.sleep(1)
        after=lc.inspect(ip)
        if not hardware_ok(after): raise RuntimeError("Hardware config post-write verification failed.")
        return {"ok":True,"summary":hardware_summary(after),"rollbackUsed":False}
    except Exception as first:
        try:
            cfg_post(ip,rb["cfg"]);wait_wled(ip,60,True);state_post(ip,rb["state"])
        except Exception as e: raise RuntimeError(f"Hardware config failed ({first}); rollback also failed ({e}).") from first
        raise RuntimeError(f"Hardware config failed and prior config was restored: {first}") from first

def sync_snapshot(d):
    cfg=d.get("cfg") or {};state=d.get("state") or {}
    return {"cfg":{"if":{"sync":((cfg.get("if") or {}).get("sync") or {})},"um":{"AudioReactive":{"sync":(((cfg.get("um") or {}).get("AudioReactive") or {}).get("sync") or {})}}},"state":{"udpn":state.get("udpn") or {},"mainseg":state.get("mainseg",0),"seg":state.get("seg") or []}}

def prepare_sync_with_rollback(matrix_ip,aux_ip):
    mb,ab=lc.inspect(matrix_ip),lc.inspect(aux_ip);ms,ass=sync_snapshot(mb),sync_snapshot(ab)
    try:
        applied=lc.prepare_sync(matrix_ip,aux_ip);mc,ac=lc.check_matrix(applied["matrix"]),lc.check_aux(applied["aux"])
        if not all_true(mc,MATRIX_IDENTITY_KEYS+("visualSyncSend","audioSyncSend")): raise RuntimeError("Matrix sync post-write verification failed.")
        if not all_true(ac,AUX_IDENTITY_KEYS+AUX_SYNC_KEYS): raise RuntimeError("Aux sync post-write verification failed.")
        return {"ok":True,"matrix":mc,"aux":ac,"rollbackUsed":False}
    except Exception as first:
        errors=[]
        for ip,snap in ((matrix_ip,ms),(aux_ip,ass)):
            try: cfg_post(ip,snap["cfg"]);state_post(ip,snap["state"])
            except Exception as e: errors.append(f"{ip}: {e}")
        if errors: raise RuntimeError(f"Sync failed ({first}); rollback errors: {'; '.join(errors)}") from first
        raise RuntimeError(f"Sync failed and prior sync state was restored: {first}") from first

def prompt_yes(msg):
    try: return input(msg+" Type YES to continue: ").strip()=="YES"
    except EOFError: return False

def require_ready(pf):
    if not pf.get("package",{}).get("ok"): raise RuntimeError("Package verification failed.")
    m,a=pf.get("matrix",{}).get("ip"),pf.get("aux",{}).get("ip")
    if not m: raise RuntimeError("Exact Matrix R3 node not uniquely identified.")
    if not a: raise RuntimeError("Aux WLED node not uniquely identified.")
    if m==a: raise RuntimeError("Matrix and Aux resolved to same IP.")
    return m,a

def interactive(args):
    history=[];pf=preflight(args);history.append({"phase":"preflight","result":pf});write_report({"history":history,"current":pf},report_path(args.report));print(json.dumps(pf,indent=2,sort_keys=True))
    if pf["nextAction"] in ("PACKAGE_INVALID","POWER_OR_IDENTIFY_MATRIX","POWER_OR_IDENTIFY_AUX","DISAMBIGUATE_AUX"): return {"history":history,"current":pf}
    m,a=require_ready(pf)
    if pf["nextAction"]=="INSTALL_EXACT_AUX_FIRMWARE":
        print(f"
Target AUX: {a}. Matrix: {m}. Fresh backups were created.")
        print("This uploads the exact proven AUX firmware and reboots ONLY the identified AUX node.")
        if not prompt_yes("Install exact AUX firmware now?"): return {"history":history,"current":pf}
        r=ota_install(a,pathlib.Path(args.package_dir).resolve()/"HBNF_SP803E_AUX_R3.bin");history.append({"phase":"install-firmware","result":r});pf=preflight(args);history.append({"phase":"post-firmware-preflight","result":pf});write_report({"history":history,"current":pf},report_path(args.report))
    if pf["nextAction"]=="APPLY_HARDWARE_PLAN":
        print("
Hardware config needs two physical facts software must not guess.")
        pixels=int(input("Actual installed WS2811 logical pixel/group count: ").strip())
        order=input("Verified color order (GRB/RGB/BRG/RBG/BGR/GBR): ").strip().upper()
        reverse=input("Data direction reversed? [y/N]: ").strip().lower()=="y"
        plan=hp.build(pixels,order,reverse,900,55);print(json.dumps({"inputs":plan["inputs"],"postApplyChecks":plan["postApplyChecks"]},indent=2))
        if not prompt_yes("Apply this hardware/segment plan to AUX only?"): return {"history":history,"current":pf,"pendingPlan":plan}
        r=apply_hardware(a,plan);history.append({"phase":"apply-hardware","result":r});pf=preflight(args);history.append({"phase":"post-hardware-preflight","result":pf});write_report({"history":history,"current":pf},report_path(args.report))
    if pf["nextAction"]=="RUN_GUARDED_PREPARE_SYNC":
        print("
Next change configures Matrix SEND + AUX RECEIVE local sync only; it does not open cloud/Supabase AUX actuation.")
        if not prompt_yes("Apply guarded sync configuration now?"): return {"history":history,"current":pf}
        r=prepare_sync_with_rollback(m,a);history.append({"phase":"prepare-sync","result":r});pf=preflight(args);history.append({"phase":"post-sync-preflight","result":pf});write_report({"history":history,"current":pf},report_path(args.report))
    return {"history":history,"current":pf}

def selftest():
    body,ctype=multipart_firmware(pathlib.Path(__file__))
    assert b'name="skipValidation"' in body and b'name="update"' in body and "multipart/form-data" in ctype
    fake={"cfg":{"hw":{"led":{"total":39,"maxpwr":900,"ins":[{"pin":[16],"start":0,"len":37,"type":22,"order":1,"rev":False,"maxpwr":900},{"pin":[25],"start":37,"len":1,"type":41,"order":0,"rev":False,"maxpwr":0},{"pin":[26],"start":38,"len":1,"type":41,"order":0,"rev":False,"maxpwr":0}]}}},"state":{"mainseg":0,"seg":[{"id":0,"start":0,"stop":37,"sel":True,"on":True},{"id":1,"start":37,"stop":38,"sel":False,"on":False},{"id":2,"start":38,"stop":39,"sel":False,"on":False}]}}
    assert hardware_ok(fake);bad=json.loads(json.dumps(fake));bad["state"]["seg"][1]["sel"]=True;assert not hardware_ok(bad)
    assert candidate_subnets("192.168.1.0/24",None)==["192.168.1.0/24"]
    print("HBNF_AUX_COMMISSION_GUARD_SELFTEST_PASS")

def main():
    p=argparse.ArgumentParser(description="Guarded HBNF AUX commissioning state machine")
    p.add_argument("--phase",choices=["preflight","install-firmware","apply-hardware","prepare-sync","verify","interactive"],default="preflight")
    p.add_argument("--matrix-hint",default="192.168.68.89");p.add_argument("--aux",default="auto");p.add_argument("--subnet")
    p.add_argument("--package-dir",default=str(HERE));p.add_argument("--backup",action="store_true",default=True);p.add_argument("--no-backup",dest="backup",action="store_false")
    p.add_argument("--backup-root",default="~/Desktop");p.add_argument("--report");p.add_argument("--pixels",type=int);p.add_argument("--order",choices=list(hp.ORDER_CODES));p.add_argument("--reverse",action="store_true");p.add_argument("--yes",action="store_true");p.add_argument("--selftest",action="store_true")
    a=p.parse_args()
    if a.selftest: selftest();return 0
    rp=report_path(a.report)
    if a.phase=="interactive":
        result=interactive(a);write_report(result,rp);print(f"
Report: {rp}");return 0
    pf=preflight(a)
    if a.phase in ("preflight","verify"): write_report(pf,rp);print(json.dumps(pf,indent=2,sort_keys=True));return 0 if pf.get("package",{}).get("ok") else 2
    if not a.yes: raise SystemExit("Mutation phase requires --yes, or use --phase interactive.")
    m,aip=require_ready(pf)
    if a.phase=="install-firmware": result=ota_install(aip,pathlib.Path(a.package_dir).resolve()/"HBNF_SP803E_AUX_R3.bin")
    elif a.phase=="apply-hardware":
        if a.pixels is None or a.order is None: raise SystemExit("apply-hardware requires --pixels and --order")
        result=apply_hardware(aip,hp.build(a.pixels,a.order,a.reverse,900,55))
    elif a.phase=="prepare-sync": result=prepare_sync_with_rollback(m,aip)
    final=preflight(a);out={"mutationIssued":True,"phase":a.phase,"result":result,"current":final};write_report(out,rp);print(json.dumps(out,indent=2,sort_keys=True));return 0

if __name__=="__main__": raise SystemExit(main())
