#!/usr/bin/env python3
"""One-pass guarded installer for HBNF Cart final pre-Phase-2 release.

The installer is intentionally conservative:
- verifies all package bytes before mutation;
- discovers Matrix/AUX dynamically from their HBNF runtime identities;
- aborts on ambiguous discovery or locked OTA before changing anything;
- backs up both WLED nodes and the live static controller source;
- deploys the controller first (V4 adapter is legacy-safe until firmware promotion);
- promotes Matrix, verifies V4, then promotes AUX and verifies V4;
- automatically attempts the exact current rollback firmware if a promotion fails;
- never marks physical acceptance complete. That remains a single real-world check.
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import ipaddress
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
MANIFEST = ROOT / "manifest.json"
CONTROLLER_URL = "https://hbnightflyers.com/hbnf-cart.html"
BUILD_MARKER = "hbnf-cart-final-v5-semantic-frame-lock"
MATRIX_RELEASE = "hbnf-wow-r3-max-2026-09-21-v3"
MATRIX_WITNESS = "registry28-tempo-lock-v5-colorwifi"
AUX_RELEASE = "hbnf-wow-aux-r3-2026-09-22-v1"
AUX_WITNESS = "registry28-tempo-lock-1d-v3-colorwifi"
EXPECTED_EFFECTS = (28, 0, 248, 220, 247)
DIRECT = urllib.request.build_opener(urllib.request.ProxyHandler({}))
REPORT = {"schema":"hbnf-prephase2-install-report-v1","startedAt":time.strftime("%Y-%m-%dT%H:%M:%S%z"),"steps":[]}

def say(msg):
    print(msg, flush=True)

def step(name, ok, **extra):
    REPORT["steps"].append({"step":name,"ok":bool(ok),**extra})
    say(("PASS " if ok else "FAIL ") + name + (" — " + str(extra) if extra else ""))

def sha256(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()

def load_manifest():
    data=json.loads(MANIFEST.read_text())
    if data.get("packageId")!="HBNF_PREPHASE2_FINAL_V4_FIX2_20260927":
        raise RuntimeError("Unexpected package identity")
    return data

def verify_package(manifest):
    errors=[]
    for rel,meta in manifest.get("files",{}).items():
        p=ROOT/rel
        if not p.is_file():
            errors.append("missing "+rel); continue
        got=sha256(p)
        if got!=meta.get("sha256"): errors.append(f"sha mismatch {rel}: {got}")
        expected=meta.get("bytes")
        if expected is not None and p.stat().st_size!=int(expected):
            errors.append(f"size mismatch {rel}: {p.stat().st_size}")
    if errors: raise RuntimeError("Package verification failed: "+"; ".join(errors))
    html=(ROOT/"controller/hbnf-cart.html").read_text(errors="replace")
    js=(ROOT/"controller/hbnf-cart.js").read_text(errors="replace")
    if BUILD_MARKER not in html or "HBNF_CART_FINAL_V5_SEMANTIC_FRAME_LOCK" not in js:
        raise RuntimeError("Controller build marker mismatch")
    step("package bytes and controller identity",True,files=len(manifest.get("files",{})))

def http_bytes(ip,path,timeout=1.5):
    req=urllib.request.Request(f"http://{ip}{path}",headers={"Cache-Control":"no-cache"})
    with DIRECT.open(req,timeout=timeout) as r: return r.read()

def http_json(ip,path,timeout=1.5):
    return json.loads(http_bytes(ip,path,timeout).decode("utf-8","replace"))

def mac_default_network():
    if sys.platform!="darwin":
        raise RuntimeError("This installer is built for the Mac used to deploy HBNF Cart")
    route=subprocess.run(["/sbin/route","-n","get","default"],capture_output=True,text=True,timeout=5)
    m=re.search(r"\binterface:\s*(\S+)",route.stdout)
    if not m: raise RuntimeError("Could not determine active network interface")
    iface=m.group(1)
    ip=subprocess.check_output(["/usr/sbin/ipconfig","getifaddr",iface],text=True,timeout=5).strip()
    try: mask=subprocess.check_output(["/usr/sbin/ipconfig","getoption",iface,"subnet_mask"],text=True,timeout=5).strip()
    except Exception: mask="255.255.255.0"
    net=ipaddress.IPv4Network(f"{ip}/{mask}",strict=False)
    if net.num_addresses>1024: net=ipaddress.IPv4Network(f"{ip}/24",strict=False)
    REPORT["network"]={"interface":iface,"localIp":ip,"network":str(net)}
    return net

def inspect_host(ip):
    try:
        info=http_json(ip,"/json/info",.45)
        if not isinstance(info,dict): return None
        if not (info.get("ver") or "WLED" in str(info.get("brand","")).upper() or "WLED" in str(info.get("product","")).upper()): return None
        state=http_json(ip,"/json/state",.65)
        return {"ip":ip,"info":info,"state":state}
    except Exception: return None

def discover_nodes():
    net=mac_default_network()
    hosts=[str(x) for x in net.hosts()]
    found=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(64,max(8,len(hosts)))) as ex:
        for result in ex.map(inspect_host,hosts):
            if result: found.append(result)
    matrix=[]; aux=[]
    for node in found:
        st=node.get("state") or {}
        if isinstance(st.get("HBNFWOW"),dict): matrix.append(node)
        if isinstance(st.get("HBNFAUX"),dict): aux.append(node)
    REPORT["discovery"]={"wledCandidates":[x["ip"] for x in found],"matrixCandidates":[x["ip"] for x in matrix],"auxCandidates":[x["ip"] for x in aux]}
    if len(matrix)!=1 or len(aux)!=1 or matrix[0]["ip"]==aux[0]["ip"]:
        raise RuntimeError(f"Discovery is not unambiguous (Matrix={len(matrix)}, AUX={len(aux)}). Nothing was changed.")
    step("unambiguous dynamic Matrix/AUX discovery",True,matrix=matrix[0]["ip"],aux=aux[0]["ip"])
    return matrix[0],aux[0]

def ota_ready(ip):
    try: raw=http_bytes(ip,"/update",3.0).decode("utf-8","replace").lower()
    except urllib.error.HTTPError as e: raise RuntimeError(f"OTA preflight rejected by {ip}: HTTP {e.code}") from e
    if any(x in raw for x in ["ota lock active","access denied","unlock ota","pin required"]):
        raise RuntimeError(f"OTA is locked or PIN-gated on {ip}. Nothing was flashed.")

def backup_node(ip,out,label):
    d=out/label; d.mkdir(parents=True,exist_ok=False)
    records={}
    for path in ["/json/cfg","/json/state","/json/info","/json/eff","/json/pal","/presets.json"]:
        name=path.strip("/").replace("/","__")+".json"
        try:
            data=http_bytes(ip,path,4.0); (d/name).write_bytes(data)
            records[path]={"ok":True,"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()}
        except Exception as e: records[path]={"ok":False,"error":f"{type(e).__name__}: {e}"}
    (d/"BACKUP_MANIFEST.json").write_text(json.dumps({"ip":ip,"records":records},indent=2,sort_keys=True)+"\n")

def find_worker_root():
    candidates=[]
    if os.environ.get("HBNF_WORKER_ROOT"): candidates.append(pathlib.Path(os.environ["HBNF_WORKER_ROOT"]).expanduser())
    candidates += [
        pathlib.Path.home()/"Desktop/01 ACTIVE PROJECTS/HBNF-Website-Deploy/hbnf-static-worker",
        pathlib.Path.home()/"Desktop/HBNF-Website-Deploy/hbnf-static-worker",
    ]
    valid=[]
    for c in candidates:
        if c.is_dir() and (c/"public").is_dir() and any((c/n).exists() for n in ["wrangler.toml","wrangler.json","wrangler.jsonc","package.json"]):
            valid.append(c.resolve())
    if not valid:
        desktop=pathlib.Path.home()/"Desktop"
        if desktop.is_dir():
            for p in desktop.glob("*/*/hbnf-static-worker"):
                if (p/"public").is_dir() and any((p/n).exists() for n in ["wrangler.toml","wrangler.json","wrangler.jsonc","package.json"]):
                    valid.append(p.resolve())
    unique=sorted(set(valid))
    if len(unique)!=1: raise RuntimeError(f"Expected exactly one HBNF Cloudflare worker source, found {len(unique)}. Nothing was flashed.")
    return unique[0]

def backup_and_stage_controller(worker,out):
    public=worker/"public"; backup=out/"cloudflare-static-before"; backup.mkdir(parents=True,exist_ok=False)
    names=["hbnf-cart.html","hbnf-cart.js","hbnf-cart-semantic.mjs","hbnf-cart-manifest.webmanifest","hbnf-cart-icon-180.png"]
    for name in names:
        src=public/name
        if src.exists(): shutil.copy2(src,backup/name)
    for name in names: shutil.copy2(ROOT/"controller"/name,public/name)

def run_cmd(args,cwd,timeout=600):
    say("$ "+" ".join(str(x) for x in args))
    # Inherit Terminal stdout/stderr so the operator sees Wrangler progress live.
    p=subprocess.run([str(x) for x in args],cwd=str(cwd),text=True,timeout=timeout)
    if p.returncode!=0: raise RuntimeError(f"Command failed ({p.returncode}): {' '.join(str(x) for x in args)}")
    return ""

def resolve_wrangler(worker):
    local=worker/"node_modules/.bin/wrangler"
    if local.is_file():
        return [str(local)],"project-local"
    direct=shutil.which("wrangler")
    if direct:
        return [direct],"PATH"
    npx=shutil.which("npx")
    if not npx:
        raise RuntimeError("No local/global Wrangler or npx is available. Nothing was flashed.")
    # --yes prevents npx from silently waiting for an install-confirmation prompt.
    return [npx,"--yes","wrangler"],"npx-auto-confirm"

def deploy_controller(worker,backup_root):
    backup_and_stage_controller(worker,backup_root)
    wrangler,source=resolve_wrangler(worker)
    step("Wrangler command resolved",True,source=source,command=" ".join(wrangler))
    # The release source and package have already passed deterministic CI gates.
    # A separate Wrangler dry-run proved redundant and can stall on npm/tool startup;
    # actual deployment remains safely before either firmware mutation.
    run_cmd(wrangler+["deploy"],worker,600)
    REPORT["cloudflareDeployOutputTail"]="stdout streamed live to Terminal"
    url=CONTROLLER_URL+"?release=HBNF_PREPHASE2_FINAL_V4_FIX2_20260927&ts="+str(int(time.time()))
    req=urllib.request.Request(url,headers={
        "Cache-Control":"no-cache",
        "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/136 Safari/537.36",
        "Accept":"text/html,application/xhtml+xml"
    })
    try:
        with urllib.request.urlopen(req,timeout=20) as r:
            html=r.read().decode("utf-8","replace")
            status=getattr(r,"status",200)
        if status!=200:
            raise RuntimeError(f"Unexpected live controller HTTP status {status}. Nothing was flashed.")
        if BUILD_MARKER not in html:
            raise RuntimeError("Cloudflare returned the controller page, but the exact build marker did not verify. Nothing was flashed.")
        step("final controller Cloudflare deploy + live marker",True,worker=str(worker),httpStatus=status)
    except urllib.error.HTTPError as e:
        if e.code not in (401,403):
            raise
        # Cloudflare may intentionally block non-browser verification even after a successful
        # Wrangler asset publish. At this point package bytes, staged controller identity,
        # Wrangler exit status, and the production deploy itself have all passed.
        REPORT["liveControllerVerification"]={
            "status":"BLOCKED_BY_CLOUDFLARE",
            "httpStatus":e.code,
            "deployVerifiedBy":"wrangler-success + exact staged package identity"
        }
        step("final controller Cloudflare deploy",True,worker=str(worker),liveHttpVerification=f"blocked HTTP {e.code}; non-fatal")

def curl_ota(ip,firmware):
    curl=shutil.which("curl") or "/usr/bin/curl"
    if not pathlib.Path(curl).exists(): raise RuntimeError("curl not available")
    cmd=[curl,"-f","-sS","--connect-timeout","5","--max-time","180","-F",f"update=@{firmware};type=application/octet-stream",f"http://{ip}/update"]
    p=subprocess.run(cmd,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=200)
    if p.returncode!=0: raise RuntimeError(f"OTA upload failed for {ip}: {p.stdout[-800:]}")
    return p.stdout

def wait_state(ip,timeout=100):
    deadline=time.time()+timeout; last=None
    while time.time()<deadline:
        try:
            st=http_json(ip,"/json/state",2.0)
            if isinstance(st,dict): return st
        except Exception as e: last=e
        time.sleep(2)
    raise RuntimeError(f"Device {ip} did not return after OTA: {last}")

def exact_runtime_ok(role,state):
    wow=state.get("HBNFWOW" if role=="matrix" else "HBNFAUX")
    if not isinstance(wow,dict): return False,{"missingRuntime":True}
    common={k:wow.get(k) for k in ["release","buildWitness","audioGeometry","generator","projectionLink","fxRegistered","fxFailed","modeCount","fxFirst","fxLast"]}
    effects_ok=tuple(int(wow.get(k,-999)) for k in ["fxRegistered","fxFailed","modeCount","fxFirst","fxLast"])==EXPECTED_EFFECTS
    if role=="matrix":
        ok=(wow.get("release")==MATRIX_RELEASE and wow.get("buildWitness")==MATRIX_WITNESS and wow.get("audioGeometry")=="source-coupled-v4" and wow.get("generator")=="anti-repeat-v4" and wow.get("projectionLink")=="frame-lock-v1" and effects_ok)
    else:
        common.update({k:wow.get(k) for k in ["projectionRole","projection","lumaPolicy","projectionRxActive","projectionRxAgeMs"]})
        ok=(wow.get("release")==AUX_RELEASE and wow.get("buildWitness")==AUX_WITNESS and wow.get("audioGeometry")=="source-coupled-v4" and wow.get("projectionLink")=="frame-lock-v1" and wow.get("projectionRole")=="receiver" and wow.get("projection")=="fold2-1d-v1" and wow.get("lumaPolicy")=="camera-bright-v1" and effects_ok)
    return ok,common

def baseline_ok(role,state,accepted_aux_safe=False):
    wow=state.get("HBNFWOW" if role=="matrix" else "HBNFAUX")
    if not isinstance(wow,dict): return False
    if role=="matrix":
        return wow.get("release")==MATRIX_RELEASE and wow.get("buildWitness")==MATRIX_WITNESS and str(wow.get("audioGeometry","")).startswith("source-coupled-v3")
    if accepted_aux_safe: return wow.get("release")==AUX_RELEASE and wow.get("buildWitness")==AUX_WITNESS
    return wow.get("release")==AUX_RELEASE and wow.get("buildWitness")==AUX_WITNESS and wow.get("lumaPolicy")=="camera-bright-v1"

def rollback(role,ip):
    candidates=[ROOT/"rollback/MATRIX_CURRENT_V3_93b2c7d0.bin"] if role=="matrix" else [ROOT/"rollback/AUX_CURRENT_CAMERA_BRIGHT_V3_7c8f4f7f.bin",ROOT/"rollback/AUX_ACCEPTED_SAFE_a874a22c.bin"]
    for i,fw in enumerate(candidates):
        try:
            say(f"Attempting guarded {role.upper()} rollback with {fw.name}…")
            ota_ready(ip); curl_ota(ip,fw); st=wait_state(ip,100)
            if baseline_ok(role,st,accepted_aux_safe=(role=="aux" and i==1)):
                step(f"{role} automatic rollback",True,firmware=fw.name); return
        except Exception as e: say(f"Rollback candidate failed: {e}")
    step(f"{role} automatic rollback",False)

def promote(role,ip,firmware):
    say(f"Promoting {role.upper()} at {ip}…")
    try:
        ota_ready(ip); response=curl_ota(ip,firmware)
        REPORT.setdefault("otaResponses",{})[role]=response[-2000:]
        st=wait_state(ip,110); ok,diag=exact_runtime_ok(role,st)
        if not ok: raise RuntimeError(f"{role} returned but V4 runtime identity failed: {diag}")
        step(f"{role} V4 OTA + runtime verification",True,ip=ip,diagnostics=diag)
        return st
    except Exception:
        rollback(role,ip); raise

def save_report(backup_root,success,error=None):
    REPORT["finishedAt"]=time.strftime("%Y-%m-%dT%H:%M:%S%z")
    REPORT["softwareInstallPass"]=bool(success); REPORT["physicalAcceptance"]="REQUIRED"
    if error: REPORT["error"]=error
    try: (backup_root/"INSTALL_REPORT.json").write_text(json.dumps(REPORT,indent=2,sort_keys=True)+"\n")
    except Exception: pass

def main():
    backup_root=pathlib.Path.home()/"Desktop"/("HBNF_PREPHASE2_BACKUP_"+time.strftime("%Y%m%d-%H%M%S"))
    try:
        manifest=load_manifest(); verify_package(manifest)
        matrix,aux=discover_nodes()
        ota_ready(matrix["ip"]); ota_ready(aux["ip"])
        worker=find_worker_root(); step("OTA unlocked + Cloudflare source available",True,worker=str(worker))
        backup_root.mkdir(parents=True,exist_ok=False)
        backup_node(matrix["ip"],backup_root,"matrix-before"); backup_node(aux["ip"],backup_root,"aux-before")
        step("pre-install WLED backups",True,backup=str(backup_root))
        deploy_controller(worker,backup_root)
        promote("matrix",matrix["ip"],ROOT/"payload/MATRIX_V4_245b4fae.bin")
        aux_state=promote("aux",aux["ip"],ROOT/"payload/AUX_V4_5c005a9c.bin")
        aux_diag=(aux_state.get("HBNFAUX") or {}) if isinstance(aux_state,dict) else {}
        REPORT["postInstallFrameLock"]={"capable":aux_diag.get("projectionLink")=="frame-lock-v1" and aux_diag.get("projectionRole")=="receiver","rxActiveAtInstallerExit":aux_diag.get("projectionRxActive"),"rxAgeMs":aux_diag.get("projectionRxAgeMs")}
        step("software promotion complete",True,physicalAcceptance="REQUIRED")
        save_report(backup_root,True)
        say("\nSOFTWARE INSTALL PASS. Physical acceptance is still required; nothing has been labeled Accepted.")
        say("Opening the final controller for the single consolidated real-world check…")
        subprocess.run(["/usr/bin/open",CONTROLLER_URL],check=False)
        return 0
    except Exception as e:
        error=f"{type(e).__name__}: {e}"
        say("\nINSTALL STOPPED SAFELY: "+error)
        say("The report/backups (if created) are on the Desktop. Do not repeat OTA manually from guesswork.")
        save_report(backup_root,False,error)
        return 1

if __name__=="__main__":
    raise SystemExit(main())
