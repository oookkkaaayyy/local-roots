#!/usr/bin/env python3
"""Guarded HBNF AUX commissioning state machine.

Default behavior is read-only. Interactive mutation is only performed after an
exact Matrix/Aux target is identified, a fresh backup is written, and the user
explicitly confirms the requested phase.

The script never updates Supabase physical acceptance flags. Those remain a
separate evidence gate after real electrical/visual/thermal testing.
"""
from __future__ import annotations

import argparse, getpass, hashlib, ipaddress, json, os, pathlib, re, socket, subprocess, sys, time
import urllib.error, urllib.request, uuid, zipfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import local_commission as lc
import commission_operator as op
import generate_aux_hardware_plan as hp

REPORT_NAME = "HBNF_AUX_COMMISSION_LATEST.json"
EVIDENCE_NAME = "HBNF_AUX_ACCEPTANCE_EVIDENCE.json"
SAFE_BOOT_NAME = "HBNF AUX SAFE BOOT"
SAFE_BOOT_MIN = 180
SAFE_BOOT_MAX = 199
CLOUD_BASE = "https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1"
MATRIX_IDENTITY_KEYS = ("reachable","pixels","release","engine","buildWitness","fxRegistered","fxFailed","modeCount","fxFirst","fxLast","effectMap")
AUX_IDENTITY_KEYS = ("reachable","release","engine","buildWitness","projection","fxRegistered","fxFailed","modeCount","fxFirst","fxLast","uvFollowEffectId","uvFollowRegistered","uvOutputsFailDark","effectMap")
AUX_SYNC_KEYS = ("visualSyncReceive","segmentOptionsIsolated","visualSyncSendDisabled","audioSyncReceive")
INSTALLED_AUX_MAC = "8c94df55c34c"
EXPECTED_WORKFLOW_PATH = ".github/workflows/hbnf-sp803e-aux-r3-build.yml"
EXPECTED_WORKFLOW_REF = "refs/heads/codex/cart-uv-local-policy-scaffold-20261026"

def _metrics(path):
    values={}
    for line in path.read_text().splitlines():
        if "=" in line:
            key,value=line.split("=",1);values[key.strip()]=value.strip()
    return values

def _candidate_actions_receipt(root,package):
    """Check embedded run-receipt consistency; authenticated Actions retrieval is external."""
    try:
        root=pathlib.Path(root).resolve()
        metrics=_metrics(root/"FINAL_METRICS.txt")
        receipt=json.loads((root/"RELEASE_RECEIPT.json").read_text())
        pointer=json.loads((root/"ARTIFACT_POINTER.json").read_text())
        build=receipt.get("build") or {};source=receipt.get("source") or {};candidate=receipt.get("candidate") or {}
        run_id=str(metrics.get("github_run_id") or "")
        run_attempt=str(metrics.get("github_run_attempt") or "")
        run_url=f"https://github.com/oookkkaaayyy/local-roots/actions/runs/{run_id}"
        return bool(
            run_id.isdigit()
            and run_attempt.isdigit()
            and pointer.get("schema")=="hbnf-aux-run-artifact-pointer-v1"
            and str(pointer.get("run_id"))==run_id
            and str(pointer.get("run_attempt"))==run_attempt
            and pointer.get("run_url")==run_url
            and pointer.get("source_commit")==metrics.get("github_sha")
            and pointer.get("workflow_ref")==metrics.get("github_ref")==EXPECTED_WORKFLOW_REF
            and pointer.get("workflow_path")==metrics.get("workflow_path")==EXPECTED_WORKFLOW_PATH
            and pointer.get("firmware_sha256")==package.get("firmwareSha256")==metrics.get("firmware_sha256")
            and pointer.get("firmware_bytes")==package.get("firmwareBytes")==int(metrics.get("firmware_bytes","-1"))
            and op.verify_artifact_archive(root,pointer,require_external=True)
            and metrics.get("github_sha")==source.get("commit")==package.get("releaseAdmission",{}).get("candidate_source_commit")
            and metrics.get("github_ref")==EXPECTED_WORKFLOW_REF
            and metrics.get("workflow_path")==EXPECTED_WORKFLOW_PATH
            and metrics.get("github_run_url")==run_url==build.get("run_url")
            and build.get("run_id")==run_id
            and build.get("workflow_ref")==EXPECTED_WORKFLOW_REF
            and build.get("workflow_path")==EXPECTED_WORKFLOW_PATH
            and metrics.get("UV_OUTPUTS_VERIFIED")=="NO"
            and metrics.get("UV_COMPILE_GATE_DEFAULT")=="0"
            and candidate.get("sha256")==package.get("firmwareSha256")==metrics.get("firmware_sha256")
            and candidate.get("size")==package.get("firmwareBytes")==int(metrics.get("firmware_bytes","-1"))
            and receipt.get("status")=="INCOMPLETE"
            and package.get("ok") is True
            and package.get("installAdmissible") is False
            and package.get("releaseAdmission",{}).get("reason")=="FRESH_CURRENT_DEVICE_PREFLIGHT_REQUIRED"
            and package.get("releaseAdmission",{}).get("rollbackVerified") is True
        )
    except Exception:
        return False

def _installed_current_baseline(d,package_dir,package):
    """Match the live AUX target to the exact owner-confirmed V7 rollback identity."""
    try:
        root=pathlib.Path(package_dir).resolve()
        admission=package["releaseAdmission"];artifact=admission["rollbackArtifact"]
        manifest=json.loads((root/artifact["manifest_file"]).read_text())
        i=d.get("info") or {};state=d.get("state") or {};aux=state.get("HBNFAUX") or {}
        return bool(
            d.get("ip")=="192.168.77.11"
            and str(i.get("mac") or "").replace(":","").lower()==INSTALLED_AUX_MAC
            and str(i.get("arch") or "").lower()=="esp32"
            and int(i.get("flash") or 0)==4
            and aux.get("release")==manifest.get("firmware_release")
            and aux.get("engine")==manifest.get("engine")
            and aux.get("buildWitness")==manifest.get("build_witness")
            and manifest.get("firmware_sha256")==admission.get("installed_firmware_sha256")==artifact.get("sha256")
            and manifest.get("firmware_bytes")==artifact.get("bytes")
            and manifest.get("provenance",{}).get("source_commit")==artifact.get("source_commit")
            and str(manifest.get("provenance",{}).get("workflow_run_id"))==str(artifact.get("workflow_run_id"))
        )
    except Exception:
        return False

def all_true(d, keys): return bool(d) and all(d.get(k) is True for k in keys)

def sha256(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()

def verified_package_firmware(fw):
    package=op.verify_package(fw.parent)
    if not package.get("ok"):
        raise RuntimeError(f"AUX firmware package verification failed: {package}")
    if sha256(fw)!=package["firmwareSha256"] or fw.stat().st_size!=package["firmwareBytes"]:
        raise RuntimeError("AUX firmware bytes do not match the package manifest.")
    return package

def require_install_admission(package,package_dir,device=None):
    if not _candidate_actions_receipt(package_dir,package):
        admission=package.get("releaseAdmission") or {}
        reason=admission.get("reason") or "exact installed-firmware rollback is not verified"
        resume=admission.get("resumptionCondition") or ""
        raise RuntimeError(f"AUX firmware OTA blocked: package build receipt does not match the expected run ({reason}). {resume}".strip())
    if device is None:
        return None
    if not _installed_current_baseline(device,package_dir,package):
        admission=package.get("releaseAdmission") or {}
        raise RuntimeError(f"AUX firmware OTA blocked: fresh device readback does not match the owner-confirmed current V7 rollback ({admission.get('reason') or 'baseline mismatch'}). {admission.get('resumptionCondition') or ''}".strip())
    metrics=_metrics(pathlib.Path(package_dir).resolve()/"FINAL_METRICS.txt")
    info=device.get("info") or {};aux=((device.get("state") or {}).get("HBNFAUX") or {})
    return {"schema":"hbnf-aux-install-admission-v1","status":"PASS",
        "captured_at_utc":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),
        "source_commit":metrics["github_sha"],"candidate_sha256":package["firmwareSha256"],
        "github_actions_run_id":str(metrics["github_run_id"]),"github_actions_run_url":metrics["github_run_url"],
        "device_ip":device.get("ip"),"device_mac":INSTALLED_AUX_MAC,"device_firmware_version":info.get("ver"),
        "installed_release":aux.get("release"),"installed_engine":aux.get("engine"),
        "installed_build_witness":aux.get("buildWitness"),
        "rollback_sha256":package.get("releaseAdmission",{}).get("rollbackArtifact",{}).get("sha256"),
        "uv_output_enabled":False,"owner_install_authorization":"SESSION_EXPLICIT"}

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

def _mask_to_prefix(mask):
    if str(mask).lower().startswith("0x"):
        n=int(str(mask),16)
        bits=f"{n:032b}"
        if "01" in bits: raise ValueError("non-contiguous netmask")
        return bits.count("1")
    return ipaddress.IPv4Network(f"0.0.0.0/{mask}").prefixlen

def parse_ifconfig_networks(text):
    nets=[]
    for line in str(text or "").splitlines():
        m=re.search(r"\binet\s+(\d+\.\d+\.\d+\.\d+)\s+netmask\s+(0x[0-9a-fA-F]+|\d+\.\d+\.\d+\.\d+)",line)
        if not m: continue
        ip,mask=m.groups()
        if ip.startswith("127."): continue
        try:
            prefix=_mask_to_prefix(mask)
            nets.append(str(ipaddress.ip_network(f"{ip}/{prefix}",strict=False)))
        except Exception: pass
    return list(dict.fromkeys(nets))

def interface_networks():
    try:
        p=subprocess.run(["ifconfig"],capture_output=True,text=True,timeout=3)
        if p.returncode==0:
            nets=parse_ifconfig_networks(p.stdout)
            if nets: return nets
    except Exception: pass
    return []

def candidate_subnets(explicit,matrix_hint):
    if explicit: return [str(ipaddress.ip_network(explicit,strict=False))]
    nets=interface_networks()
    if not nets:
        for ip in local_ipv4s():
            try: nets.append(str(ipaddress.ip_network(f"{ip}/24",strict=False)))
            except Exception: pass
    if matrix_hint and matrix_hint!="auto":
        try:
            hint=ipaddress.ip_address(matrix_hint)
            if not any(hint in ipaddress.ip_network(n) for n in nets):
                nets.append(str(ipaddress.ip_network(f"{matrix_hint}/24",strict=False)))
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
    path.write_text(json.dumps(report,indent=2,sort_keys=True)+"\n")

def write_install_admission_once(report,path):
    """Atomically reserve the sole OTA attempt for this candidate on this account."""
    path=pathlib.Path(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    try:
        fd=os.open(str(path),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    except FileExistsError as e:
        raise RuntimeError(f"AUX firmware OTA blocked: a transaction record already exists for this exact candidate: {path}") from e
    with os.fdopen(fd,"w") as stream:
        json.dump(report,stream,indent=2,sort_keys=True);stream.write("\n");stream.flush();os.fsync(stream.fileno())

def backup_node(ip,root,label):
    out=op.backup(ip,root)
    tagged=out.with_name(out.name.replace("HBNF_AUX_BACKUP",f"HBNF_{label.upper()}_BACKUP",1))
    try: out.rename(tagged);return tagged
    except Exception: return out

def evidence_path(path=None):
    return pathlib.Path(path).expanduser().resolve() if path else pathlib.Path.home()/"Desktop"/EVIDENCE_NAME

def load_evidence(path):
    path=evidence_path(path)
    if not path.is_file():
        return {"schema":"hbnf-aux-acceptance-v1","accepted":{},"observations":{},"createdAt":time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    try:
        data=json.loads(path.read_text())
        if not isinstance(data,dict): raise ValueError("not object")
        data.setdefault("schema","hbnf-aux-acceptance-v1");data.setdefault("accepted",{});data.setdefault("observations",{})
        return data
    except Exception as e:
        raise RuntimeError(f"Existing acceptance evidence is unreadable: {e}")

def save_evidence(data,path):
    path=evidence_path(path);path.parent.mkdir(parents=True,exist_ok=True)
    data["updatedAt"]=time.strftime("%Y-%m-%dT%H:%M:%S%z")
    path.write_text(json.dumps(data,indent=2,sort_keys=True)+"\n")
    return path

def accept_evidence(data,key,details=None):
    data.setdefault("accepted",{})[key]=True
    if details is not None: data.setdefault("observations",{})[key]=details

def infer_color_order(observed):
    order="".join(str(x).strip().upper() for x in observed)
    if len(order)!=3 or set(order)!={"R","G","B"}:
        raise ValueError("observed colors must be one each of R, G and B")
    return order

def wifi_ssids(d):
    cfg=d.get("cfg") or {};ins=((cfg.get("nw") or {}).get("ins") or [])
    out=[]
    for x in ins:
        if isinstance(x,dict):
            v=str(x.get("ssid") or "").strip()
            if v and v not in out: out.append(v)
    return out

def cloud_json(path,method="GET",body=None,timeout=12):
    data=None;headers={"Accept":"application/json"}
    if body is not None:
        data=json.dumps(body,separators=(",",":")).encode();headers["Content-Type"]="application/json"
    req=urllib.request.Request(CLOUD_BASE+"/"+path,data=data,method=method,headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=timeout) as r:
            raw=r.read().decode("utf-8","replace")
            return {"ok":200<=int(getattr(r,"status",200))<300,"status":int(getattr(r,"status",200)),"json":json.loads(raw) if raw.strip() else {}}
    except urllib.error.HTTPError as e:
        raw=e.read().decode("utf-8","replace")
        try: j=json.loads(raw)
        except Exception: j={"raw":raw[:500]}
        return {"ok":False,"status":e.code,"json":j}
    except Exception as e:
        return {"ok":False,"status":0,"json":{"error":f"{type(e).__name__}: {e}"}}

def hardware_summary(d):
    cfg=d.get("cfg") or {};state=d.get("state") or {};hw=((cfg.get("hw") or {}).get("led") or {})
    buses=[]
    for b in hw.get("ins") or []:
        if isinstance(b,dict): buses.append({k:b.get(k) for k in ("pin","start","len","type","order","rev","maxpwr")})
    segs=[]
    for n,s in enumerate(state.get("seg") or []):
        if isinstance(s,dict): segs.append({"id":int(s.get("id",n)),"start":s.get("start"),"stop":s.get("stop"),"sel":s.get("sel"),"on":s.get("on")})
    return {"total":hw.get("total"),"maxpwr":hw.get("maxpwr"),"buses":buses,"segments":segs,"mainseg":state.get("mainseg"),"bootDefault":cfg.get("def") or {}}

def _topology_common(d):
    s=hardware_summary(d);by_pin={tuple(x.get("pin") or []):x for x in s["buses"]}
    u=by_pin.get((16,))
    if not u or len(s["buses"])!=1: return None
    if int(u.get("type") or -1)!=hp.TYPE_DIGITAL_RGB: return None
    pixels=int(u.get("len") or 0)
    if pixels<1 or int(u.get("start",-1))!=0: return None
    if int(s.get("total") or 0)!=pixels: return None
    seg={int(x["id"]):x for x in s["segments"]}
    s0=seg.get(0) or {}
    if len(seg)!=1: return None
    bounds=(int(s0.get("start",-1))==0 and int(s0.get("stop") or -1)==pixels)
    if not (bounds and s.get("mainseg")==0 and s0.get("sel") is True): return None
    return s,u,pixels

def hardware_topology_matches_plan(d,plan):
    common=_topology_common(d)
    if not common: return False
    s,u,pixels=common;inputs=plan.get("inputs") or {};src=plan.get("sourceAuthority") or {}
    return int(s.get("maxpwr") or 0)==int(inputs.get("underglowMaxMilliamps") or -1) and int(u.get("maxpwr") or 0)==int(inputs.get("underglowMaxMilliamps") or -1) and pixels==int(inputs.get("underglowLogicalPixels") or -1) and int(u.get("order") if u.get("order") is not None else -1)==int(src.get("colorOrderCode") if src.get("colorOrderCode") is not None else -2) and bool(u.get("rev")) is bool(inputs.get("reverse"))

def hardware_ok(d):
    common=_topology_common(d)
    if not common: return False
    s,u,_=common
    if int(u.get("maxpwr") or 0)!=900 or int(s.get("maxpwr") or 0)!=900: return False
    boot=s.get("bootDefault") or {};ps=int(boot.get("ps") if boot.get("ps") is not None else -1)
    return boot.get("on") is False and SAFE_BOOT_MIN<=ps<=SAFE_BOOT_MAX

def hardware_matches_plan(d,plan):
    return hardware_ok(d) and hardware_topology_matches_plan(d,plan)

def read_presets(ip):
    try:
        raw=op.raw_get(ip,"/presets.json",timeout=5.0).decode("utf-8","replace")
        data=json.loads(raw)
        return data if isinstance(data,dict) else {}
    except Exception as e:
        raise RuntimeError(f"Could not read AUX presets for boot-safety verification: {e}")

def _preset_segments(preset):
    return {int(x.get("id",n)):x for n,x in enumerate(preset.get("seg") or []) if isinstance(x,dict)}

def safe_boot_preset_valid(preset,pixels):
    if not isinstance(preset,dict) or preset.get("n")!=SAFE_BOOT_NAME or preset.get("on") is not False: return False
    seg=_preset_segments(preset);s0=seg.get(0) or {}
    return len(seg)==1 and int(s0.get("start",-1))==0 and int(s0.get("stop") or -1)==pixels and s0.get("on") is True

def safe_boot_runtime_ok(ip,d):
    common=_topology_common(d)
    if not common: return False
    s,_,pixels=common;boot=s.get("bootDefault") or {};pid=int(boot.get("ps") if boot.get("ps") is not None else -1)
    if boot.get("on") is not False or not (SAFE_BOOT_MIN<=pid<=SAFE_BOOT_MAX): return False
    return safe_boot_preset_valid(read_presets(ip).get(str(pid)),pixels)

def choose_safe_boot_preset(ip):
    presets=read_presets(ip)
    for pid in range(SAFE_BOOT_MAX,SAFE_BOOT_MIN-1,-1):
        v=presets.get(str(pid))
        if v is None or v=={}: return pid
    raise RuntimeError(f"No free HBNF safe-boot preset slot exists in {SAFE_BOOT_MIN}..{SAFE_BOOT_MAX}.")

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
    install_admission={"status":"BLOCKED","reason":"PACKAGE_OR_TARGET_NOT_MATCHED"}
    if a:
        current=ids["inspected"].get(a) or {}
        if _candidate_actions_receipt(pathlib.Path(args.package_dir).resolve(),package) and _installed_current_baseline(current,pathlib.Path(args.package_dir).resolve(),package):
            run_id=str(_metrics(pathlib.Path(args.package_dir).resolve()/"FINAL_METRICS.txt").get("github_run_id"))
            install_admission={"status":"PASS","reason":"FRESH_OWNER_CONFIRMED_V7_BASELINE_AND_ACTIONS_PACKAGE_VERIFIED","candidate_source_commit":package.get("releaseAdmission",{}).get("candidate_source_commit"),"candidate_firmware_sha256":package.get("firmwareSha256"),"actions_run_id":run_id,"target_mac":INSTALLED_AUX_MAC,"rollback_sha256":package.get("releaseAdmission",{}).get("rollbackArtifact",{}).get("sha256")}
    if not package.get("ok"): nxt="PACKAGE_INVALID"
    elif not a: nxt="POWER_OR_IDENTIFY_AUX" if ids["auxReason"]=="none" else "DISAMBIGUATE_AUX"
    elif not all_true(ac,AUX_IDENTITY_KEYS): nxt="INSTALL_EXACT_AUX_FIRMWARE" if package.get("installAdmissible") or install_admission.get("status")=="PASS" else "RELEASE_REVIEW_ONLY"
    elif not hardware_ok(ids["inspected"][a]) or not safe_boot_runtime_ok(a,ids["inspected"][a]): nxt="APPLY_HARDWARE_PLAN"
    elif not m: nxt="POWER_OR_IDENTIFY_MATRIX"
    elif not all_true(ac,AUX_SYNC_KEYS): nxt="RUN_GUARDED_PREPARE_SYNC"
    else: nxt="BEGIN_UNDERGLOW_ACCEPTANCE"
    return {"mutationIssued":False,"package":package,"installAdmission":install_admission,"subnets":subnets,"wledNodes":nodes,"matrix":{"ip":m,"candidates":ids["matrixCandidates"],"checks":mc},"aux":{"ip":a,"selectionReason":ids["auxReason"],"checks":ac},"backups":backups,"nextAction":nxt}

def multipart_firmware(fw):
    boundary="----HBNF"+uuid.uuid4().hex
    data=fw.read_bytes()
    crlf="\r\n"
    chunks=[
      f'--{boundary}{crlf}Content-Disposition: form-data; name="skipValidation"{crlf}{crlf}1{crlf}'.encode(),
      f'--{boundary}{crlf}Content-Disposition: form-data; name="update"; filename="{fw.name}"{crlf}Content-Type: application/octet-stream{crlf}{crlf}'.encode(),
      data,
      f'{crlf}--{boundary}--{crlf}'.encode()
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

def pending_release_result(ip,after):
    return {"deviceRuntimeIdentityVerified":True,"releaseAccepted":False,
      "releaseStatus":"PENDING_COMPLETE_DURABLE_RECEIPT","receiptTemplate":"RELEASE_RECEIPT.json",
      "receiptValidator":"validate_release_receipt.py","ip":ip,"checks":lc.check_aux(after),
      "note":"Runtime identity alone is not release success. Complete the source-bound receipt, verify exact candidate and rollback readbacks, publish it durably, retrieve it, then validate it."}

def ota_install(ip,fw,timeout=120,preflight_result=None):
    package=verified_package_firmware(fw)
    require_install_admission(package,fw.parent)
    snapshot_errors=op.install_snapshot_errors(preflight_result or {},ip)
    if snapshot_errors: raise RuntimeError("AUX firmware OTA blocked: "+ " ".join(snapshot_errors))
    before=lc.inspect(ip)
    admission=require_install_admission(package,fw.parent,before)
    if not lc.looks_like_wled(before): raise RuntimeError("Aux target is not a reachable WLED node.")
    if all_true(lc.check_matrix(before),MATRIX_IDENTITY_KEYS): raise RuntimeError("Target is exact Matrix R3; refusing AUX firmware install.")
    info=before.get("info") or {}
    arch=str(info.get("arch") or "").lower()
    flash_mb=int(info.get("flash") or 0)
    if "esp32" not in arch: raise RuntimeError(f"Aux target architecture is {arch!r}, not ESP32.")
    if flash_mb!=4: raise RuntimeError(f"Aux target reports {flash_mb} MB flash; expected the verified SP803E 4 MB target.")
    admission_path=pathlib.Path.home()/"Desktop"/f"HBNF_AUX_INSTALL_ADMISSION_{package['firmwareSha256'][:12]}.json"
    admission["status"]="STARTED"
    admission["attempt_limit"]=1
    admission["attempts_used"]=1
    write_install_admission_once(admission,admission_path)
    body,ctype=multipart_firmware(fw)
    req=urllib.request.Request(f"http://{ip}/update",data=body,method="POST",headers={"Content-Type":ctype,"Content-Length":str(len(body))})
    try:
        with lc.DIRECT_OPENER.open(req,timeout=45) as r:
            response=r.read().decode("utf-8","replace");status=int(getattr(r,"status",200))
    except urllib.error.HTTPError as e:
        detail=e.read().decode("utf-8","replace")
        raise RuntimeError(f"OTA HTTP {e.code}: {detail[:400]}") from e
    if status!=200 or "Update successful" not in response: raise RuntimeError(f"OTA did not return success (HTTP {status}).")
    after=wait_wled(ip,timeout,True)
    result=pending_release_result(ip,after);result["installAdmissionPath"]=str(admission_path)
    return result

def cfg_post(ip,patch):
    body=dict(patch);body["sv"]=True
    return lc.request_json(ip,"/json/cfg","POST",body,timeout=8)

def state_post(ip,patch): return lc.request_json(ip,"/json/state","POST",patch,timeout=6)

def hw_rollback(d):
    cfg=d.get("cfg") or {};state=d.get("state") or {}
    return {"cfg":{"def":cfg.get("def") or {},"hw":{"led":((cfg.get("hw") or {}).get("led") or {})}},"state":{"mainseg":state.get("mainseg",0),"seg":state.get("seg") or []}}

def install_safe_boot_preset(ip,plan):
    pid=choose_safe_boot_preset(ip);pixels=int((plan.get("inputs") or {}).get("underglowLogicalPixels") or 0)
    safe_state={"on":False,"bri":64,"mainseg":0,"seg":plan["statePatch"]["seg"]}
    try:
        state_post(ip,safe_state)
        state_post(ip,{"psave":pid,"n":SAFE_BOOT_NAME,"ib":True,"sb":True})
        saved=None
        for _ in range(24):
            time.sleep(.25)
            saved=read_presets(ip).get(str(pid))
            if safe_boot_preset_valid(saved,pixels): break
        if not safe_boot_preset_valid(saved,pixels):
            raise RuntimeError(f"Preset {pid} did not persist the fail-dark underglow-only state.")
        cfg_post(ip,{"def":{"ps":pid,"on":False,"bri":64}});time.sleep(.5)
        after=lc.inspect(ip);boot=(hardware_summary(after).get("bootDefault") or {})
        if boot.get("on") is not False or int(boot.get("ps") if boot.get("ps") is not None else -1)!=pid:
            raise RuntimeError("Fail-dark boot preset/defaults did not persist in WLED config.")
        return pid
    except Exception:
        try: state_post(ip,{"pdel":pid})
        except Exception: pass
        raise

def apply_hardware(ip,plan):
    before=lc.inspect(ip)
    if not all_true(lc.check_aux(before),AUX_IDENTITY_KEYS): raise RuntimeError("Exact AUX R3 identity not proven.")
    rb=hw_rollback(before);created_preset=None
    try:
        cfg_post(ip,plan["cfgPatch"]);wait_wled(ip,60,True);state_post(ip,plan["statePatch"]);time.sleep(1)
        mid=lc.inspect(ip)
        if not hardware_topology_matches_plan(mid,plan):
            raise RuntimeError("Hardware config did not match the reviewed pixel/order/reverse/current plan exactly.")
        created_preset=install_safe_boot_preset(ip,plan)
        after=lc.inspect(ip)
        if not hardware_matches_plan(after,plan) or not safe_boot_runtime_ok(ip,after):
            raise RuntimeError("Final hardware or persistent fail-dark boot verification failed.")
        return {"ok":True,"summary":hardware_summary(after),"safeBootPreset":created_preset,"rollbackUsed":False}
    except Exception as first:
        if created_preset is not None:
            try: state_post(ip,{"pdel":created_preset})
            except Exception: pass
        try:
            cfg_post(ip,rb["cfg"]);wait_wled(ip,60,True);state_post(ip,rb["state"])
        except Exception as e: raise RuntimeError(f"Hardware config failed ({first}); rollback also failed ({e}).") from first
        raise RuntimeError(f"Hardware config failed and prior config was restored: {first}") from first

def _observed_color(label):
    while True:
        v=input(f"When commanded {label}, what color is the underglow actually showing? [R/G/B/X=stop]: ").strip().upper()
        if v in ("R","G","B"): return v
        if v=="X": raise RuntimeError("Color-order calibration stopped by user.")
        print("Enter R, G, B, or X.")

def calibrate_color_order(ip,pixels,reverse=False):
    print("\nCOLOR-ORDER CALIBRATION — low-current underglow only; both UV segments remain OFF.")
    print("I will temporarily configure only the LED buses at 300 mA, show red/green/blue, then restore the exact prior config before the final plan is applied.")
    before=lc.inspect(ip);rb=hw_rollback(before)
    temp=hp.build(pixels,"RGB",reverse,300,55);observed=[];restore_error=None;applied=None
    colors=[("RED",[255,0,0]),("GREEN",[0,255,0]),("BLUE",[0,0,255])]
    try:
        cfg_post(ip,{"hw":temp["cfgPatch"]["hw"]});wait_wled(ip,60,True);state_post(ip,temp["statePatch"]);time.sleep(1)
        mid=lc.inspect(ip)
        if not hardware_topology_matches_plan(mid,temp): raise RuntimeError("Temporary 300 mA RGB calibration topology did not verify.")
        applied={"ok":True,"summary":hardware_summary(mid)}
        for name,rgb in colors:
            state_post(ip,{"on":True,"mainseg":0,"seg":[{"id":0,"on":True,"sel":True,"bri":32,"fx":0,"pal":0,"col":[rgb,[0,0,0],[0,0,0]]}]})
            time.sleep(.8)
            observed.append(_observed_color(name))
    finally:
        try:
            state_post(ip,{"seg":[{"id":0,"on":False}]})
            cfg_post(ip,rb["cfg"]);wait_wled(ip,60,True);state_post(ip,rb["state"])
        except Exception as e:
            restore_error=f"{type(e).__name__}: {e}"
    if restore_error: raise RuntimeError("Color calibration finished but prior hardware config could not be restored: "+restore_error)
    order=infer_color_order(observed)
    print(f"Detected physical strip color order: {order}. Temporary calibration config was removed.")
    return {"order":order,"observed":observed,"temporary":applied,"temporaryRestored":True}

def configure_aux_mqtt_from_matrix(matrix_ip,aux_ip):
    md,ad=lc.inspect(matrix_ip),lc.inspect(aux_ip)
    mm=((md.get("cfg") or {}).get("if") or {}).get("mqtt") or {}
    before=((ad.get("cfg") or {}).get("if") or {}).get("mqtt") or {}
    broker=str(mm.get("broker") or "").strip();port=int(mm.get("port") or 1883);user=str(mm.get("user") or "").strip()
    if not broker: raise RuntimeError("Matrix MQTT broker is not configured; cannot prepare unified cloud control.")
    mqtt={"en":True,"broker":broker,"port":port,"topics":{"device":"hbnf/cart/aux1","group":""}}
    if user:
        mqtt["user"]=user
        secret=getpass.getpass(f"Matrix broker uses username {user!r}. Enter its MQTT password for AUX (not saved in reports): ")
        if not secret: raise RuntimeError("MQTT password required for the authenticated Matrix broker.")
        mqtt["psk"]=secret
    try:
        cfg_post(aux_ip,{"if":{"mqtt":mqtt}});time.sleep(1)
        after=lc.inspect(aux_ip);ac=lc.check_aux(after)
        got=(((after.get("cfg") or {}).get("if") or {}).get("mqtt") or {})
        if not (got.get("en") is True and str(got.get("broker") or "")==broker and int(got.get("port") or 0)==port and (((got.get("topics") or {}).get("device"))=="hbnf/cart/aux1")):
            raise RuntimeError("AUX MQTT configuration did not persist as expected.")
    except Exception as first:
        try: cfg_post(aux_ip,{"if":{"mqtt":before}})
        except Exception as rollback: raise RuntimeError(f"AUX MQTT setup failed ({first}); rollback also failed ({rollback}).") from first
        raise RuntimeError(f"AUX MQTT setup failed and prior config was restored: {first}") from first
    return {"broker":broker,"port":port,"userConfigured":bool(user),"publicTestBroker":broker=="broker.emqx.io","mqttConfigured":ac.get("mqttConfigured"),"rollbackUsed":False}

def ensure_field_wifi_profile(matrix_ip,aux_ip,explicit_ssid=None):
    md,ad=lc.inspect(matrix_ip),lc.inspect(aux_ip)
    matrix_ssids=wifi_ssids(md);aux_ssids=wifi_ssids(ad)
    candidate=explicit_ssid
    if not candidate:
        missing=[x for x in matrix_ssids if x not in aux_ssids]
        if len(missing)==1: candidate=missing[0]
        elif len(missing)>1:
            print("Matrix has Wi-Fi profiles not yet on AUX:")
            for i,x in enumerate(missing,1): print(f"  {i}. {x}")
            raw=input("Choose the course/hotspot profile number, or press Return to defer: ").strip()
            if raw.isdigit() and 1<=int(raw)<=len(missing): candidate=missing[int(raw)-1]
    if not candidate:
        shared=[x for x in matrix_ssids if x in aux_ssids]
        if len(shared)>=2:
            return {"changed":False,"prepared":True,"matrixSsids":matrix_ssids,"auxSsids":aux_ssids,"reason":"multiple-shared-profiles"}
        typed=input("Course/iPhone-hotspot Wi-Fi name (press Return to defer): ").strip()
        if typed: candidate=typed
        else: return {"changed":False,"prepared":False,"matrixSsids":matrix_ssids,"auxSsids":aux_ssids,"reason":"field-profile-deferred"}
    if candidate in aux_ssids:
        return {"changed":False,"prepared":True,"ssid":candidate,"matrixSsids":matrix_ssids,"auxSsids":aux_ssids}
    if candidate not in matrix_ssids:
        print(f"Warning: {candidate!r} is not visible in Matrix's saved Wi-Fi profiles.")
    secret=getpass.getpass(f"Enter Wi-Fi password for {candidate!r} (not saved in reports): ")
    if not secret: raise RuntimeError("Field Wi-Fi password was empty; profile not changed.")
    entries=[{"ssid":x} for x in aux_ssids]+[{"ssid":candidate,"psk":secret}]
    cfg_post(aux_ip,{"nw":{"ins":entries}});time.sleep(1)
    after=lc.inspect(aux_ip);after_ssids=wifi_ssids(after)
    if candidate not in after_ssids: raise RuntimeError("Field Wi-Fi profile did not persist on AUX.")
    return {"changed":True,"prepared":True,"ssid":candidate,"matrixSsids":matrix_ssids,"auxSsids":after_ssids}

def _local_uv(ip,mode):
    raise RuntimeError("UV control is intentionally unavailable: per-channel UV load ratings, switching paths, and commissioning evidence are incomplete.")

def _uv_off(ip):
    return None

def final_cloud_verification():
    release=cloud_json("hbnf-release-doctor")
    aux_meta=cloud_json("hbnf-aux-control")
    aux_status=cloud_json("hbnf-aux-control","POST",{"action":"status"})
    cart=cloud_json("hbnf-cart-orchestrator")
    cart_show=cloud_json("hbnf-cart-orchestrator","POST",{"action":"dry_run","scene":"showcase"})
    cart_glow=cloud_json("hbnf-cart-orchestrator","POST",{"action":"dry_run","scene":"glow_live"})
    watch=cloud_json("hbnf-watch-control")
    rj=release.get("json") or {};aj=aux_meta.get("json") or {};asj=aux_status.get("json") or {};cj=cart.get("json") or {};wj=watch.get("json") or {}
    checks={
      "releaseDoctorCloudReady":release.get("ok") and rj.get("cloudReady") is True,
      "matrixProductionCurrent":rj.get("productionCurrent") is True,
      "fullPwaReachable":((rj.get("fullPwa") or {}).get("htmlStatus")==200 and (rj.get("fullPwa") or {}).get("jsStatus")==200 and (rj.get("fullPwa") or {}).get("manifestStatus")==200),
      "auxEnabled":aux_meta.get("ok") and aj.get("enabled") is True,
      "mixedLoadAccepted":aj.get("mixedLoadAccepted") is True,
      "auxRuntimeTrusted":aux_status.get("ok") and asj.get("online") is True and asj.get("runtimeTrusted") is True,
      "cartAuxReady":cart.get("ok") and (((cj.get("readiness") or {}).get("auxEnabled")) is True) and (((cj.get("readiness") or {}).get("auxRuntimeReady")) is True),
      "cartShowcaseDryRun":cart_show.get("ok") and (cart_show.get("json") or {}).get("ok") is True,
      "cartGlowDryRun":cart_glow.get("ok") and (cart_glow.get("json") or {}).get("ok") is True,
      "watchContract":watch.get("ok") and wj.get("version")=="wow-max-v3-audio-aux-ready-v15" and all(x in (wj.get("actions") or []) for x in ("aux_status","uv_full","cart_showcase","cart_all_off")),
    }
    return {"ok":all(checks.values()),"checks":checks,"releaseRisks":rj.get("risks") or [],"transportProductionGrade":rj.get("transportProductionGrade"),"snapshots":{"releaseDoctor":rj,"aux":aj,"auxStatus":asj,"cart":cj,"watch":wj}}

def _accept_prompt(ev,path,key,prompt,details=None):
    if ev.get("accepted",{}).get(key) is True: return True
    if not prompt_yes(prompt): return False
    accept_evidence(ev,key,details if details is not None else {"userConfirmed":True})
    save_evidence(ev,path);return True

def physical_acceptance(args,matrix_ip,aux_ip,history):
    ep=evidence_path(args.evidence);ev=load_evidence(ep)
    ev["matrixIp"]=matrix_ip;ev["auxIp"]=aux_ip
    package=verified_package_firmware(pathlib.Path(args.package_dir).resolve()/"HBNF_SP803E_AUX_R3.bin")
    ev["firmwareSha256"]=package["firmwareSha256"];ev["packageDir"]=str(pathlib.Path(args.package_dir).resolve())
    ev["commissioningMode"]="underglow-only-v1";ev["uvArchitecturePending"]=True
    save_evidence(ev,ep)
    print(f"\nUNDERGLOW ACCEPTANCE — resumable evidence file: {ep}")
    print("UV is explicitly excluded from this acceptance and must remain disconnected.")
    if not _accept_prompt(ev,ep,"hardware_wired","Confirm the SP803E + WS2811 underglow are mounted/wired, insulated and strain-relieved, with ALL UV wiring disconnected."): return ev
    if not _accept_prompt(ev,ep,"power_verified","Confirm the 12V underglow polarity/common-ground path is correct and nothing is abnormally hot at idle."): return ev
    cur=lc.inspect(aux_ip)
    if not hardware_ok(cur): raise RuntimeError("Underglow hardware configuration no longer matches the accepted GPIO/current/segment plan.")
    summary=hardware_summary(cur)
    accept_evidence(ev,"gpio_verified",summary)
    accept_evidence(ev,"current_limit_verified",{"underglowMaxMilliamps":next((x.get("maxpwr") for x in summary["buses"] if x.get("pin")==[16]),None)})
    accept_evidence(ev,"segments_verified",summary["segments"]);save_evidence(ev,ep)
    ac=lc.check_aux(cur);mc=lc.check_matrix(lc.inspect(matrix_ip))
    if not all_true(ac,AUX_SYNC_KEYS) or not all_true(mc,("visualSyncSend","audioSyncSend")):
        raise RuntimeError("Local Matrix→AUX visual/audio sync config is not proven; rerun software commissioning first.")
    if not ev.get("accepted",{}).get("underglow_sync_verified"):
        print("\nPlay normal music through the cart speakers. Matrix is the audio/visual master.")
        if not prompt_yes("Confirm the underglow visibly follows the Matrix/music response rather than running an unrelated generic animation."): return ev
        for k in ("audio_input_verified","udp_sync_verified","underglow_sync_verified"):
            accept_evidence(ev,k,{"userConfirmed":True,"matrixMaster":True,"audioPort":11988})
        save_evidence(ev,ep)
    if not ev.get("accepted",{}).get("underglow_thermal_verified"):
        print("\nUNDERGLOW THERMAL TEST")
        print("Run representative music/looks for at least 10 minutes with UV still disconnected. Check the power bank, PD cable/plug, SP803E, connectors and wiring.")
        if not prompt_yes("Start/continue the underglow-only thermal test now?"): return ev
        input("After >=10 minutes, press Return. If anything becomes VERY hot, resets, flickers or smells wrong, disconnect power first. ")
        if not prompt_yes("Confirm there were NO resets/interference and all power/control parts stayed within normal safe warmth."): return ev
        accept_evidence(ev,"underglow_thermal_verified",{"userConfirmed":True,"representativeMinutes":10,"uvDisconnected":True});save_evidence(ev,ep)
    if not ev.get("accepted",{}).get("mqtt_cloud_path_prepared"):
        print("\nUNIFIED CLOUD CONTROL PREPARATION")
        r=configure_aux_mqtt_from_matrix(matrix_ip,aux_ip)
        accept_evidence(ev,"mqtt_cloud_path_prepared",r);save_evidence(ev,ep)
    if not ev.get("accepted",{}).get("field_wifi_prepared"):
        r=ensure_field_wifi_profile(matrix_ip,aux_ip,args.field_ssid)
        if r.get("prepared"): accept_evidence(ev,"field_wifi_prepared",r)
        else: ev.setdefault("observations",{})["field_wifi_prepared"]=r
        save_evidence(ev,ep)
    if not ev.get("accepted",{}).get("cold_boot_verified"):
        print("\nCOLD-BOOT PERSISTENCE")
        if prompt_yes("Ready to power BOTH controllers fully off for at least 10 seconds, then power them back on?"):
            input("Power both off >=10 seconds, power them back on, wait for normal startup, then press Return. ")
            post=preflight(args)
            if post.get("nextAction")!="BEGIN_UNDERGLOW_ACCEPTANCE": raise RuntimeError("Cold-boot recheck did not return to prepared underglow state: "+str(post.get("nextAction")))
            accept_evidence(ev,"cold_boot_verified",{"matrixIp":post["matrix"]["ip"],"auxIp":post["aux"]["ip"],"nextAction":post["nextAction"]});save_evidence(ev,ep)
    underglow_keys=("hardware_wired","power_verified","gpio_verified","current_limit_verified","segments_verified","audio_input_verified","udp_sync_verified","underglow_sync_verified","underglow_thermal_verified")
    ev["underglowPhysicalReady"]=all(ev.get("accepted",{}).get(k) is True for k in underglow_keys)
    # Full AUX gate intentionally stays closed until both UV channels' exact paths are verified and their real tests pass.
    ev["physicalGateReady"]=False
    ev["readyForGateImport"]=False
    ev["courseFieldReady"]=False
    ev["fullyReady"]=False
    ev["cloudSnapshot"]={"releaseDoctor":cloud_json("hbnf-release-doctor"),"aux":cloud_json("hbnf-aux-control"),"cart":cloud_json("hbnf-cart-orchestrator")}
    save_evidence(ev,ep)
    print(json.dumps({"underglowPhysicalReady":ev["underglowPhysicalReady"],"uvArchitecturePending":True,"physicalGateReady":False,"evidence":str(ep)},indent=2))
    return ev

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

def require_aux_ready(pf):
    if not pf.get("package",{}).get("ok"): raise RuntimeError("Package verification failed.")
    m,a=pf.get("matrix",{}).get("ip"),pf.get("aux",{}).get("ip")
    if not a: raise RuntimeError("Aux WLED node not uniquely identified.")
    if m and m==a: raise RuntimeError("Matrix and Aux resolved to same IP.")
    return a

def require_ready(pf):
    a=require_aux_ready(pf);m=pf.get("matrix",{}).get("ip")
    if not m: raise RuntimeError("Exact Matrix R3 node not uniquely identified.")
    return m,a

def interactive(args):
    history=[];pf=preflight(args);history.append({"phase":"preflight","result":pf});write_report({"history":history,"current":pf},report_path(args.report));print(json.dumps(pf,indent=2,sort_keys=True))
    if pf["nextAction"] in ("PACKAGE_INVALID","POWER_OR_IDENTIFY_AUX","DISAMBIGUATE_AUX","RELEASE_REVIEW_ONLY"): return {"history":history,"current":pf}
    if pf["nextAction"]=="INSTALL_EXACT_AUX_FIRMWARE" and not args.backup:
        raise RuntimeError("AUX firmware install requires the pre-install device snapshot; remove --no-backup and rerun.")
    a=require_aux_ready(pf)
    if pf["nextAction"]=="INSTALL_EXACT_AUX_FIRMWARE":
        print(f"\nTarget AUX: {a}. Fresh backups were created. Matrix is not required for this phase.")
        print("This uploads the exact proven AUX firmware and reboots ONLY the identified AUX node.")
        if not prompt_yes("Install exact AUX firmware now?"): return {"history":history,"current":pf}
        r=ota_install(a,pathlib.Path(args.package_dir).resolve()/"HBNF_SP803E_AUX_R3.bin",preflight_result=pf);history.append({"phase":"install-firmware","result":r});pf=preflight(args);history.append({"phase":"post-firmware-preflight","result":pf});write_report({"history":history,"current":pf},report_path(args.report))
        return {"history":history,"current":pf,"releaseStatus":r["releaseStatus"],"releaseAccepted":False}
    if pf["nextAction"]=="APPLY_HARDWARE_PLAN":
        print("\nUnderglow config needs the ACTUAL installed WS2811 logical group count. UV stays excluded/disconnected.")
        pixels=int(input("Actual installed WS2811 logical pixel/group count: ").strip())
        reverse=input("Is the strip data direction intentionally reversed from controller→far end? [y/N]: ").strip().lower()=="y"
        if not prompt_yes("Run a low-current three-color calibration to determine strip color order?"): return {"history":history,"current":pf}
        cal=calibrate_color_order(a,pixels,reverse);history.append({"phase":"color-order-calibration","result":{"order":cal["order"],"observed":cal["observed"]}})
        order=cal["order"]
        plan=hp.build(pixels,order,reverse,900,55);print(json.dumps({"inputs":plan["inputs"],"postApplyChecks":plan["postApplyChecks"]},indent=2))
        if not prompt_yes("Apply this final underglow-only hardware/segment plan to AUX?"): return {"history":history,"current":pf,"pendingPlan":plan}
        r=apply_hardware(a,plan);history.append({"phase":"apply-hardware","result":r});pf=preflight(args);history.append({"phase":"post-hardware-preflight","result":pf});write_report({"history":history,"current":pf},report_path(args.report))
    if pf["nextAction"]=="POWER_OR_IDENTIFY_MATRIX":
        return {"history":history,"current":pf}
    if pf["nextAction"]=="RUN_GUARDED_PREPARE_SYNC":
        m,a=require_ready(pf)
        print("\nNext change configures Matrix SEND + AUX RECEIVE local sync only; it does not open cloud/Supabase AUX actuation.")
        if not prompt_yes("Apply guarded sync configuration now?"): return {"history":history,"current":pf}
        r=prepare_sync_with_rollback(m,a);history.append({"phase":"prepare-sync","result":r});pf=preflight(args);history.append({"phase":"post-sync-preflight","result":pf});write_report({"history":history,"current":pf},report_path(args.report))
    if pf["nextAction"]=="BEGIN_UNDERGLOW_ACCEPTANCE":
        m,a=require_ready(pf)
        ev=physical_acceptance(args,m,a,history);history.append({"phase":"underglow-acceptance","result":{"evidence":str(evidence_path(args.evidence)),"underglowPhysicalReady":ev.get("underglowPhysicalReady"),"uvArchitecturePending":True}})
    return {"history":history,"current":pf,"evidence":str(evidence_path(args.evidence))}

def selftest():
    import tempfile, shutil
    with tempfile.TemporaryDirectory() as td:
        root=pathlib.Path(td);probe=root/"probe.bin";probe.write_bytes(b"HBNF")
        body,ctype=multipart_firmware(probe)
        try:
            verified_package_firmware(probe)
            raise AssertionError("incomplete firmware package passed verification")
        except RuntimeError as e:
            assert "package verification failed" in str(e)
        package_dir=root/"valid-package";package_dir.mkdir()
        fw=package_dir/"HBNF_SP803E_AUX_R3.bin";fw.write_bytes(b"verified-firmware-fixture")
        shutil.copy2(HERE/"contract.json",package_dir/"contract.json")
        shutil.copy2(HERE/"local_commission.py",package_dir/"local_commission.py")
        for name in ("RELEASE_RECEIPT.schema.json","RELEASE_RECEIPT.template.json","validate_release_receipt.py","generate_release_receipt.py","generate_release_admission.py"):
            shutil.copy2(HERE/name,package_dir/name)
        repo_root=HERE.parents[1]
        shutil.copy2(repo_root/"hbnf-wow-bundle/config/WOW_SCENES_V2.json",package_dir/"WOW_SCENES_V2.json")
        metrics=(f"release={lc.AUX_RELEASE}\nengine={lc.AUX_ENGINE}\nbuild_witness={lc.AUX_WITNESS}\n"
                 f"github_sha={'a'*40}\ngithub_run_id=123\ngithub_run_url=https://github.com/example/repo/actions/runs/123\ngithub_ref=refs/heads/test\nworkflow_path=.github/workflows/build.yml\n"
                 f"github_run_attempt=1\n"
                 f"toolchain_python=3.12\ntoolchain_platformio=6.1.17\ntoolchain_node=20\ntoolchain_pip=pip-24\n"
                 f"input_wled_commit={'b'*40}\ninput_source_bundle_sha256={'c'*64}\ninput_wled_requirements_sha256={'d'*64}\ninput_aux_patch_sha256={'e'*64}\n"
                 f"firmware_sha256={op.sha256(fw)}\nfirmware_bytes={fw.stat().st_size}\n")
        (package_dir/"FINAL_METRICS.txt").write_text(metrics)
        (package_dir/"ARTIFACT_POINTER.json").write_text(json.dumps({"schema":"hbnf-aux-run-artifact-pointer-v1","run_id":"123",
            "run_attempt":1,"run_url":"https://github.com/example/repo/actions/runs/123","source_commit":"a"*40,
            "workflow_ref":"refs/heads/test","workflow_path":".github/workflows/build.yml",
            "firmware_sha256":op.sha256(fw),"firmware_bytes":fw.stat().st_size}))
        from generate_release_receipt import generate as generate_receipt
        generate_receipt(fw,package_dir/"FINAL_METRICS.txt",HERE/"RELEASE_RECEIPT.template.json",package_dir/"RELEASE_RECEIPT.json")
        (package_dir/op.ADMISSION_FILE).write_text(json.dumps({"schema":"hbnf-aux-release-admission-v1",
            "status":"REVIEW_ONLY","candidate_source_commit":"a"*40,
            "candidate_firmware_sha256":op.sha256(fw),
            "installed_firmware_sha256":"c44298bb4b80a0e3d36d094f8270a1959708997571784803592e257ecdef054a",
            "installed_baseline_evidence":"fixture","rollback_artifact":None,
            "blocker_code":"EXACT_INSTALLED_FIRMWARE_ROLLBACK_MISSING",
            "resumption_condition":"Provide exact matching rollback bytes."}))
        archive_path=package_dir/"HBNF_SP803E_AUX_R3_COMMISSIONING.zip"
        with zipfile.ZipFile(archive_path,"w",zipfile.ZIP_DEFLATED) as z:
            for item in package_dir.iterdir():
                if item.name!=archive_path.name:z.write(item,item.name)
        pointer=json.loads((package_dir/"ARTIFACT_POINTER.json").read_text())
        pointer.update(package_file=archive_path.name,package_sha256=op.sha256(archive_path))
        (package_dir/"ARTIFACT_POINTER.json").write_text(json.dumps(pointer))
        verified=verified_package_firmware(fw)
        assert verified["firmwareSha256"]==op.sha256(fw)
        assert verified["firmwareBytes"]==fw.stat().st_size
        assert verified["ok"] and not verified["installAdmissible"]
        try:
            require_install_admission(verified,package_dir);raise AssertionError("review-only package passed OTA guard")
        except RuntimeError as e:
            assert "EXACT_INSTALLED_FIRMWARE_ROLLBACK_MISSING" in str(e)
        original_inspect=lc.inspect
        try:
            lc.inspect=lambda _ip: (_ for _ in ()).throw(AssertionError("OTA guard contacted the target before admission"))
            try: ota_install("192.0.2.1",fw);raise AssertionError("review-only package reached OTA request path")
            except RuntimeError as e: assert "AUX firmware OTA blocked" in str(e)
        finally:
            lc.inspect=original_inspect
        admission=json.loads((package_dir/op.ADMISSION_FILE).read_text())
        admission["candidate_source_commit"]="b"*40
        (package_dir/op.ADMISSION_FILE).write_text(json.dumps(admission))
        assert not op.verify_package(package_dir)["ok"]
    with tempfile.TemporaryDirectory() as td:
        root=pathlib.Path(td);source="a"*40;run_id="123456789"
        candidate_fw=root/"HBNF_SP803E_AUX_R3.bin";candidate_fw.write_bytes(b"candidate firmware fixture")
        candidate_sha=op.sha256(candidate_fw);candidate_bytes=candidate_fw.stat().st_size
        run_url=f"https://github.com/oookkkaaayyy/local-roots/actions/runs/{run_id}"
        (root/"FINAL_METRICS.txt").write_text(
            f"github_sha={source}\ngithub_run_id={run_id}\ngithub_run_attempt=1\ngithub_run_url={run_url}\ngithub_ref={EXPECTED_WORKFLOW_REF}\n"
            f"workflow_path={EXPECTED_WORKFLOW_PATH}\nfirmware_sha256={candidate_sha}\nfirmware_bytes={candidate_bytes}\n"
            "UV_OUTPUTS_VERIFIED=NO\nUV_COMPILE_GATE_DEFAULT=0\n")
        receipt={"status":"INCOMPLETE","source":{"commit":source},"candidate":{"sha256":candidate_sha,"size":candidate_bytes},
                 "build":{"run_id":run_id,"run_url":run_url,"workflow_ref":EXPECTED_WORKFLOW_REF,"workflow_path":EXPECTED_WORKFLOW_PATH}}
        (root/"RELEASE_RECEIPT.json").write_text(json.dumps(receipt))
        (root/"ARTIFACT_POINTER.json").write_text(json.dumps({"schema":"hbnf-aux-run-artifact-pointer-v1","run_id":run_id,
            "run_attempt":1,"run_url":run_url,"source_commit":source,"workflow_ref":EXPECTED_WORKFLOW_REF,
            "workflow_path":EXPECTED_WORKFLOW_PATH,"firmware_sha256":candidate_sha,"firmware_bytes":candidate_bytes}))
        archive_path=root/"HBNF_SP803E_AUX_R3_COMMISSIONING.zip"
        with zipfile.ZipFile(archive_path,"w",zipfile.ZIP_DEFLATED) as z:
            for name in ("HBNF_SP803E_AUX_R3.bin","FINAL_METRICS.txt","RELEASE_RECEIPT.json","ARTIFACT_POINTER.json"):
                z.write(root/name,name)
        sidecar=json.loads((root/"ARTIFACT_POINTER.json").read_text())
        sidecar.update(package_file=archive_path.name,package_sha256=op.sha256(archive_path))
        (root/"ARTIFACT_POINTER.json").write_text(json.dumps(sidecar))
        baseline_manifest=json.loads((HERE/"AUX_V7_RECOVERY_MANIFEST.json").read_text())
        shutil.copy2(HERE/"AUX_V7_RECOVERY_MANIFEST.json",root/"AUX_V7_RECOVERY_MANIFEST.json")
        shutil.copy2(HERE/"HBNF_SP803E_AUX_V7_ROLLBACK.bin",root/"HBNF_SP803E_AUX_V7_ROLLBACK.bin")
        v7sha=baseline_manifest["firmware_sha256"];v7bytes=baseline_manifest["firmware_bytes"]
        v7prov=baseline_manifest["provenance"]
        rollback_artifact={"file":"HBNF_SP803E_AUX_V7_ROLLBACK.bin","manifest_file":"AUX_V7_RECOVERY_MANIFEST.json",
            "sha256":v7sha,"bytes":v7bytes,"manifest_sha256":op.sha256(root/"AUX_V7_RECOVERY_MANIFEST.json"),
            "source_commit":v7prov["source_commit"],"workflow_run_id":v7prov["workflow_run_id"],
            "artifact_zip_sha256":baseline_manifest["recovery_bundle"]["sha256"]}
        package={"ok":True,"installAdmissible":False,"firmwareSha256":candidate_sha,"firmwareBytes":candidate_bytes,
            "releaseAdmission":{"status":"REVIEW_ONLY","reason":"FRESH_CURRENT_DEVICE_PREFLIGHT_REQUIRED","rollbackVerified":True,
                "candidate_source_commit":source,"installed_firmware_sha256":v7sha,"rollbackArtifact":rollback_artifact}}
        device={"ip":"192.168.77.11","info":{"mac":INSTALLED_AUX_MAC,"arch":"esp32","flash":4},
            "state":{"HBNFAUX":{"release":baseline_manifest["firmware_release"],"engine":baseline_manifest["engine"],
                "buildWitness":baseline_manifest["build_witness"]}}}
        assert _candidate_actions_receipt(root,package)
        assert _installed_current_baseline(device,root,package)
        admission=require_install_admission(package,root,device)
        assert admission["status"]=="PASS" and admission["uv_output_enabled"] is False
        assert admission["rollback_sha256"]==package["releaseAdmission"]["installed_firmware_sha256"]
        device["info"]["mac"]="001122334455"
        assert not _installed_current_baseline(device,root,package)
        device["info"]["mac"]=INSTALLED_AUX_MAC
        (root/"FINAL_METRICS.txt").write_text((root/"FINAL_METRICS.txt").read_text().replace("UV_COMPILE_GATE_DEFAULT=0","UV_COMPILE_GATE_DEFAULT=1"))
        assert not _candidate_actions_receipt(root,package)
    with tempfile.TemporaryDirectory() as td:
        lock=pathlib.Path(td)/"install.json"
        payload={"status":"STARTED","attempts_used":1}
        write_install_admission_once(payload,lock)
        assert json.loads(lock.read_text())==payload and lock.stat().st_mode & 0o777==0o600
        try:
            write_install_admission_once(payload,lock);raise AssertionError("second OTA attempt was not blocked")
        except RuntimeError as e:
            assert "already exists" in str(e)
    assert b'name="skipValidation"' in body and b'name="update"' in body and "multipart/form-data" in ctype
    wire_prefix=body[:512]
    assert b"\r\nContent-Disposition" in wire_prefix and b"\\r\\nContent-Disposition" not in wire_prefix
    fake={"cfg":{"def":{"ps":199,"on":False,"bri":64},"hw":{"led":{"total":37,"maxpwr":900,"ins":[{"pin":[16],"start":0,"len":37,"type":22,"order":1,"rev":False,"maxpwr":900}]}}},"state":{"mainseg":0,"seg":[{"id":0,"start":0,"stop":37,"sel":True,"on":True}]}}
    assert hardware_ok(fake)
    extra=json.loads(json.dumps(fake));extra["cfg"]["hw"]["led"]["ins"].append({"pin":[25],"start":37,"len":1,"type":41});assert not hardware_ok(extra)
    low=json.loads(json.dumps(fake));low["cfg"]["hw"]["led"]["ins"][0]["maxpwr"]=300;assert not hardware_ok(low)
    p=hp.build(37,"RGB",False,900,55);assert hardware_matches_plan(fake,p)
    wrong=json.loads(json.dumps(fake));wrong["cfg"]["hw"]["led"]["ins"][0]["order"]=0;assert not hardware_matches_plan(wrong,p)
    unsafe=json.loads(json.dumps(fake));unsafe["cfg"]["def"]["on"]=True;assert not hardware_ok(unsafe)
    safe_preset={"n":SAFE_BOOT_NAME,"on":False,"seg":[{"id":0,"start":0,"stop":37,"on":True}]}
    assert safe_boot_preset_valid(safe_preset,37)
    bad_preset=json.loads(json.dumps(safe_preset));bad_preset["seg"].append({"id":1,"start":37,"stop":38,"on":False});assert not safe_boot_preset_valid(bad_preset,37)
    assert candidate_subnets("192.168.1.0/24",None)==["192.168.1.0/24"]
    pending=pending_release_result("192.0.2.1",{"state":{"HBNFAUX":{}}})
    assert pending["releaseAccepted"] is False and pending["releaseStatus"]=="PENDING_COMPLETE_DURABLE_RECEIPT" and "ok" not in pending
    sample="en0: flags=8863<UP>\n\tinet 192.168.68.77 netmask 0xfffffc00 broadcast 192.168.71.255\nlo0: flags=8049<UP>\n\tinet 127.0.0.1 netmask 0xff000000\n"
    assert parse_ifconfig_networks(sample)==["192.168.68.0/22"]
    assert infer_color_order(["G","R","B"])=="GRB"
    assert infer_color_order(["R","G","B"])=="RGB"
    try:
        infer_color_order(["R","R","B"]);raise AssertionError("duplicate observed color accepted")
    except ValueError: pass
    pf={"package":{"ok":True},"matrix":{"ip":None},"aux":{"ip":"192.168.1.9"}}
    assert require_aux_ready(pf)=="192.168.1.9"
    try:
        require_ready(pf);raise AssertionError("Matrix-dependent phase accepted without Matrix")
    except RuntimeError: pass
    print("HBNF_AUX_COMMISSION_GUARD_SELFTEST_PASS")

def main():
    p=argparse.ArgumentParser(description="Guarded HBNF AUX commissioning state machine")
    p.add_argument("--phase",choices=["preflight","install-firmware","apply-hardware","prepare-sync","verify","interactive","validate-release-receipt"],default="preflight")
    p.add_argument("--matrix-hint",default="192.168.68.89");p.add_argument("--aux",default="auto");p.add_argument("--subnet")
    p.add_argument("--package-dir",default=str(HERE));p.add_argument("--backup",action="store_true",default=True);p.add_argument("--no-backup",dest="backup",action="store_false")
    p.add_argument("--backup-root",default="~/Desktop");p.add_argument("--report");p.add_argument("--evidence");p.add_argument("--release-receipt");p.add_argument("--field-ssid")
    p.add_argument("--pixels",type=int);p.add_argument("--order",choices=list(hp.ORDER_CODES));p.add_argument("--reverse",action="store_true");p.add_argument("--yes",action="store_true");p.add_argument("--selftest",action="store_true")
    a=p.parse_args()
    if a.selftest: selftest();return 0
    if a.phase=="validate-release-receipt":
        if not a.release_receipt: raise SystemExit("--phase validate-release-receipt requires --release-receipt")
        receipt_path=pathlib.Path(a.release_receipt).expanduser().resolve()
        try:receipt=json.loads(receipt_path.read_text())
        except Exception as e:raise SystemExit(f"release receipt unreadable: {type(e).__name__}")
        errors=op.receipt_validator.validate(receipt,receipt_path.parent,receipt_path)
        result={"valid":not errors,"status":"COMPLETE" if not errors else "INCOMPLETE_OR_INVALID","errors":errors}
        print(json.dumps(result,indent=2,sort_keys=True))
        return 0 if not errors else 3
    rp=report_path(a.report)
    if a.phase=="interactive":
        result=interactive(a);write_report(result,rp);print(f"\nReport: {rp}");return 3 if result.get("releaseAccepted") is False else 0
    pf=preflight(a)
    if a.phase in ("preflight","verify"): write_report(pf,rp);print(json.dumps(pf,indent=2,sort_keys=True));return 0 if pf.get("package",{}).get("ok") else 2
    if not a.yes: raise SystemExit("Mutation phase requires --yes, or use --phase interactive.")
    if a.phase=="install-firmware":
        if not a.backup: raise SystemExit("Firmware install requires the pre-install device snapshot; remove --no-backup.")
        aip=require_aux_ready(pf);result=ota_install(aip,pathlib.Path(a.package_dir).resolve()/"HBNF_SP803E_AUX_R3.bin",preflight_result=pf)
    elif a.phase=="apply-hardware":
        aip=require_aux_ready(pf)
        if a.pixels is None or a.order is None: raise SystemExit("apply-hardware requires --pixels and --order")
        result=apply_hardware(aip,hp.build(a.pixels,a.order,a.reverse,900,55))
    elif a.phase=="prepare-sync":
        m,aip=require_ready(pf);result=prepare_sync_with_rollback(m,aip)
    final=preflight(a);out={"mutationIssued":True,"phase":a.phase,"result":result,"current":final};write_report(out,rp);print(json.dumps(out,indent=2,sort_keys=True));return 3 if a.phase=="install-firmware" and result.get("releaseAccepted") is not True else 0

if __name__=="__main__": raise SystemExit(main())
