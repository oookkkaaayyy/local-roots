#!/usr/bin/env python3
"""Read-only HBNF AUX commissioning operator.

This wrapper intentionally performs NO device mutation. It verifies the frozen
package, discovers Matrix/Aux WLED nodes, saves timestamped WLED configuration,
state and preset readbacks (not firmware), and emits a machine-readable report.
Physical/visible mutation remains delegated to the separately guarded tools.
"""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, re, sys, time, urllib.request
import zipfile

HERE=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import local_commission as lc
import validate_release_receipt as receipt_validator
import generate_release_admission as admission_tools

BACKUP_PATHS=["/json/cfg","/json/state","/json/info","/json/eff","/json/pins","/presets.json"]
ADMISSION_FILE="RELEASE_ADMISSION.json"
RECEIPT_FILE="RELEASE_RECEIPT.json"


def sha256(path:pathlib.Path)->str:
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()


def verify_artifact_archive(root:pathlib.Path,pointer:dict|None=None,require_external:bool=False)->bool:
    try:
        root=pathlib.Path(root).resolve()
        pointer=pointer or json.loads((root/"ARTIFACT_POINTER.json").read_text())
        name=pointer.get("package_file") or "HBNF_SP803E_AUX_R3_COMMISSIONING.zip"
        if name!="HBNF_SP803E_AUX_R3_COMMISSIONING.zip":return False
        archive=root/name
        has_external=bool(pointer.get("package_file") and pointer.get("package_sha256"))
        if require_external and not has_external:return False
        if bool(pointer.get("package_file"))!=bool(pointer.get("package_sha256")):return False
        if not archive.is_file() or (has_external and sha256(archive)!=pointer.get("package_sha256")):return False
        with zipfile.ZipFile(archive) as z:
            if z.testzip() is not None:return False
            names=z.namelist()
            if len(names)!=len(set(names)):return False
            if not {"HBNF_SP803E_AUX_R3.bin","FINAL_METRICS.txt","RELEASE_RECEIPT.json","ARTIFACT_POINTER.json"}.issubset(names):return False
            embedded=json.loads(z.read("ARTIFACT_POINTER.json"))
            outer={k:v for k,v in pointer.items() if k not in ("package_file","package_sha256")}
            if embedded!=outer:return False
            for item in names:
                if pathlib.PurePosixPath(item).name!=item:return False
                local=root/item
                if not local.is_file():return False
                if item=="ARTIFACT_POINTER.json":
                    local_pointer=json.loads(local.read_text())
                    expected_local=pointer if has_external else embedded
                    if local_pointer!=expected_local:return False
                elif local.read_bytes()!=z.read(item):return False
        return True
    except Exception:return False


def verify_package(root:pathlib.Path)->dict:
    fw=root/"HBNF_SP803E_AUX_R3.bin"
    metrics=root/"FINAL_METRICS.txt"
    contract=root/"contract.json"
    scenes=root/"WOW_SCENES_V2.json"
    admission_path=root/ADMISSION_FILE
    receipt_path=root/RECEIPT_FILE
    pointer_path=root/"ARTIFACT_POINTER.json"
    required=[fw,metrics,contract,scenes,root/"local_commission.py",admission_path,receipt_path,pointer_path,root/"RELEASE_RECEIPT.schema.json",root/"RELEASE_RECEIPT.template.json",root/"validate_release_receipt.py",root/"generate_release_admission.py"]
    missing=[p.name for p in required if not p.is_file()]
    if missing: return {"ok":False,"missing":missing}
    got_sha=sha256(fw); got_bytes=fw.stat().st_size
    kv={}
    for line in metrics.read_text().splitlines():
        if '=' in line:
            k,v=line.split('=',1); kv[k]=v
    con=json.loads(contract.read_text()); sc=json.loads(scenes.read_text())
    template=json.loads(receipt_path.read_text())
    pointer=json.loads(pointer_path.read_text())
    receipt_errors=receipt_validator.validate_template(template,kv,fw)
    pointer_matches=(pointer.get("schema")=="hbnf-aux-run-artifact-pointer-v1"
      and pointer.get("run_id")==kv.get("github_run_id")
      and str(pointer.get("run_attempt"))==kv.get("github_run_attempt")
      and pointer.get("run_url")==kv.get("github_run_url")
      and pointer.get("source_commit")==kv.get("github_sha")
      and pointer.get("workflow_ref")==kv.get("github_ref")
      and pointer.get("workflow_path")==kv.get("workflow_path")
      and pointer.get("firmware_sha256")==got_sha==kv.get("firmware_sha256")
      and pointer.get("firmware_bytes")==got_bytes==int(kv.get("firmware_bytes","-1")))
    admission={};admission_valid=False;admission_reason="release admission is missing or invalid"
    if admission_path.is_file():
        try:
            admission=json.loads(admission_path.read_text())
            source=kv.get("github_sha","")
            rollback_artifact=admission.get("rollback_artifact")
            if rollback_artifact is None:
                rollback_verified=(admission.get("blocker_code")=="EXACT_INSTALLED_FIRMWARE_ROLLBACK_MISSING"
                    and not (root/admission_tools.ROLLBACK_FILE).exists())
            else:
                rollback_verified=(admission.get("blocker_code")=="FRESH_CURRENT_DEVICE_PREFLIGHT_REQUIRED"
                    and admission_tools.verify_packaged_rollback(root,rollback_artifact))
            admission_valid=(admission.get("schema")=="hbnf-aux-release-admission-v1"
                and admission.get("status")=="REVIEW_ONLY"
                and re.fullmatch(r"[0-9a-f]{40}",source) is not None
                and admission.get("candidate_source_commit")==source
                and admission.get("candidate_firmware_sha256")==got_sha
                and re.fullmatch(r"[0-9a-f]{64}",str(admission.get("installed_firmware_sha256",""))) is not None
                and bool(str(admission.get("installed_baseline_evidence","")).strip())
                and admission.get("uv_activation",{}).get("owner_opal_database_gates")=="CLOSED"
                and admission.get("uv_activation",{}).get("direct_wled_network_isolation")=="NOT_CHECKED"
                and admission.get("uv_activation",{}).get("physical_uv_acceptance")=="NOT_CHECKED"
                and rollback_verified
                and bool(str(admission.get("resumption_condition","")).strip()))
            admission_reason=str(admission.get("blocker_code") or "review-only")
        except Exception as e:
            admission_reason=f"release admission could not be verified: {type(e).__name__}"
    checks={
      "firmwareSha":got_sha==kv.get("firmware_sha256"),
      "firmwareBytes":got_bytes==int(kv.get("firmware_bytes","-1")),
      "release":kv.get("release")==lc.AUX_RELEASE,
      "engine":kv.get("engine")==lc.AUX_ENGINE,
      "witness":kv.get("build_witness")==lc.AUX_WITNESS,
      "uvOutputBuildProfile":(kv.get("UV_OUTPUTS_VERIFIED"),kv.get("UV_COMPILE_GATE_DEFAULT")) in (("NO","0"),("YES","1")),
      "uvBuildProfileMatchesFlag":kv.get("UV_BUILD_PROFILE")==("uv-follow-output-capable-v1" if kv.get("UV_COMPILE_GATE_DEFAULT")=="1" else "uv-follow-fail-dark-v1"),
      "uvActivationClosed":kv.get("UV_ACTIVATION_GATES")=="CLOSED" and kv.get("UV_DIRECT_WLED_ACCESS")=="NOT_CHECKED",
      "effectRange":con["aux"]["effect_ids"]==[220,247],
      "sceneCount":len(sc.get("scenes",[]))==28,
      "projection":con["aux"].get("projection")=="frame-lock-v1" and con["aux"].get("projection_fallback")=="fold2-1d-v1",
      "brightnessIndependent":con["sync"].get("receive_brightness") is False,
      "audioPort":con["sync"].get("audio_port")==11988,
      "releaseAdmissionValid":admission_valid,
      "releaseReceiptTemplateValid":not receipt_errors,
      "artifactPointerMatchesRunReceipt":pointer_matches,
      "downloadedArchiveMatchesPointer":verify_artifact_archive(root,pointer),
    }
    return {"ok":all(checks.values()) and not receipt_errors,"checks":checks,"firmwareSha256":got_sha,"firmwareBytes":got_bytes,
      "releaseReceiptTemplateErrors":receipt_errors,"releaseReceiptStatus":template.get("status"),"artifactPointer":pointer,
      "installAdmissible":False,"releaseAdmission":{"status":admission.get("status"),"reason":admission_reason,
      "candidate_source_commit":admission.get("candidate_source_commit"),
      "candidate_firmware_sha256":admission.get("candidate_firmware_sha256"),
      "installed_firmware_sha256":admission.get("installed_firmware_sha256"),
      "installed_baseline_evidence":admission.get("installed_baseline_evidence"),
      "resumptionCondition":admission.get("resumption_condition"),
      "rollbackVerified":bool(admission.get("rollback_artifact") and admission_valid),
      "rollbackArtifact":admission.get("rollback_artifact")}}


def raw_get(ip:str,path:str,timeout=4.0)->bytes:
    with lc.DIRECT_OPENER.open(f"http://{ip}{path}",timeout=timeout) as r:
        return r.read()


def backup(ip:str,out_root:pathlib.Path)->pathlib.Path:
    stamp=time.strftime("%Y%m%d-%H%M%S")
    out=out_root/f"HBNF_AUX_BACKUP_{ip.replace('.','-')}_{stamp}"
    out.mkdir(parents=True,exist_ok=False,mode=0o700)
    os.chmod(out,0o700)
    manifest={"ip":ip,"created":stamp,"files":{}}
    for path in BACKUP_PATHS:
        name=path.strip('/').replace('/','__') or 'root'
        dest=out/(name+('.json' if not name.endswith('.json') else ''))
        try:
            data=raw_get(ip,path)
            dest.write_bytes(data)
            os.chmod(dest,0o600)
            manifest["files"][path]={"ok":True,"file":dest.name,"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()}
        except Exception as e:
            manifest["files"][path]={"ok":False,"error":f"{type(e).__name__}: {e}"}
    manifest_path=out/"BACKUP_MANIFEST.json"
    manifest_path.write_text(json.dumps(manifest,indent=2,sort_keys=True)+"\n")
    os.chmod(manifest_path,0o600)
    return out


def install_snapshot_errors(preflight:dict,ip:str)->list[str]:
    backup_dir=((preflight.get("backups") or {}).get("aux"))
    if not backup_dir:return ["AUX pre-install snapshot is missing."]
    root=pathlib.Path(backup_dir).expanduser().resolve()
    try: manifest=json.loads((root/"BACKUP_MANIFEST.json").read_text())
    except Exception:return ["AUX pre-install snapshot manifest is missing or unreadable."]
    errors=[]
    if manifest.get("ip")!=ip:errors.append("Snapshot belongs to a different AUX address.")
    files=manifest.get("files") or {}
    for route in ("/json/cfg","/json/state","/json/info","/presets.json"):
        entry=files.get(route) or {}
        if entry.get("ok") is not True:
            errors.append(f"Snapshot is missing a successful {route} readback.");continue
        item=(root/str(entry.get("file") or "")).resolve()
        if item.parent!=root or not item.is_file():
            errors.append(f"Snapshot file for {route} is missing.");continue
        if item.stat().st_size!=entry.get("bytes") or sha256(item)!=entry.get("sha256"):
            errors.append(f"Snapshot file for {route} does not match its manifest.")
            continue
        try:
            payload=json.loads(item.read_text())
            if not isinstance(payload,dict):raise ValueError("expected object")
            if route=="/json/cfg" and not {"hw","light"}.issubset(payload):
                raise ValueError("missing WLED config sections")
            if route=="/json/state" and not {"on","bri","seg"}.issubset(payload):
                raise ValueError("missing WLED state fields")
            if route=="/json/info" and not any(k in payload for k in ("ver","arch","leds")):
                raise ValueError("missing WLED info fields")
        except Exception:
            errors.append(f"Snapshot file for {route} is not a valid WLED JSON response.")
    return errors


def choose_aux(matrix_ip:str,candidates:list[str],inspected:dict)->tuple[str|None,str]:
    exact=[]
    for ip,d in inspected.items():
        c=lc.check_aux(d)
        if all(c.get(k) for k in ("release","engine","buildWitness","projection","fxRegistered","fxFailed","modeCount","fxFirst","fxLast","uvFollowEffectId","uvFollowRegistered","uvBuildProfileValid","effectMap")):
            exact.append(ip)
    if len(exact)==1: return exact[0],"exact-custom-r3"
    if len(exact)>1: return None,"multiple-exact-aux-nodes"
    nonmatrix=[ip for ip in candidates if ip!=matrix_ip]
    if len(nonmatrix)==1: return nonmatrix[0],"single-wled-candidate"
    return None,"ambiguous" if nonmatrix else "none"


def next_action(aux_ip,aux_checks,selection_reason):
    if not aux_ip: return "POWER_OR_IDENTIFY_AUX" if selection_reason=="none" else "DISAMBIGUATE_AUX"
    exact=all(aux_checks.get(k) for k in ("release","engine","buildWitness","projection","fxRegistered","fxFailed","modeCount","fxFirst","fxLast","uvFollowEffectId","uvFollowRegistered","uvBuildProfileValid","effectMap"))
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
      "backupScope":"WLED config/state/info/effects/pins/presets only; not firmware or rollback",
      "nextAction":next_action(aux_ip,ac or {},reason),
    }
    if report["nextAction"]=="INSTALL_EXACT_AUX_FIRMWARE":
        report["nextAction"]="RELEASE_REVIEW_ONLY"
        report["releaseBlocker"]=(pkg.get("releaseAdmission") or {}).get("reason") or "exact firmware rollback is unavailable"
    out=json.dumps(report,indent=2,sort_keys=True)
    print(out)
    if args.report:
        pathlib.Path(args.report).expanduser().resolve().write_text(out+"\n")
    return 0 if pkg.get("ok") else 2


def selftest():
    import tempfile, hashlib, json
    with tempfile.TemporaryDirectory() as td:
        root=pathlib.Path(td)
        (root/"HBNF_SP803E_AUX_R3.bin").write_bytes(b'x')
        # Verify negative-path sanity without reproducing frozen firmware bytes.
        assert verify_package(root)["ok"] is False
        assert install_snapshot_errors({},"192.168.77.11")
        snap=root/"snapshot";snap.mkdir()
        files={}
        for route in ("/json/cfg","/json/state","/json/info","/presets.json"):
            name=route.strip('/').replace('/','__')
            target=snap/(name+('.json' if not name.endswith('.json') else ''))
            payload={"ver":"0.16.1"} if route=="/json/info" else ({"hw":{},"light":{}} if route=="/json/cfg" else ({"on":True,"bri":128,"seg":[]} if route=="/json/state" else {}))
            target.write_text(json.dumps(payload)+'\n');data=target.read_bytes()
            files[route]={"ok":True,"file":target.name,"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()}
        (snap/"BACKUP_MANIFEST.json").write_text(json.dumps({"ip":"192.168.77.11","files":files}))
        assert install_snapshot_errors({"backups":{"aux":str(snap)}},"192.168.77.11")==[]
        target=snap/"json__state.json";target.write_text("{}\n");data=target.read_bytes()
        files["/json/state"].update(bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
        (snap/"BACKUP_MANIFEST.json").write_text(json.dumps({"ip":"192.168.77.11","files":files}))
        assert install_snapshot_errors({"backups":{"aux":str(snap)}},"192.168.77.11")
        target.write_text(json.dumps({"on":True,"bri":128,"seg":[]})+'\n');data=target.read_bytes()
        files["/json/state"].update(bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
        (snap/"BACKUP_MANIFEST.json").write_text(json.dumps({"ip":"192.168.77.11","files":files}))
        target=snap/"json__state.json";target.write_text("not-json\n");data=target.read_bytes()
        files["/json/state"].update(bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
        (snap/"BACKUP_MANIFEST.json").write_text(json.dumps({"ip":"192.168.77.11","files":files}))
        assert install_snapshot_errors({"backups":{"aux":str(snap)}},"192.168.77.11")
        (snap/"json__state.json").write_text("tampered\n")
        assert install_snapshot_errors({"backups":{"aux":str(snap)}},"192.168.77.11")
    fx=["x"]*220+lc.EFFECTS
    exact={"state":{"HBNFAUX":{"release":lc.AUX_RELEASE,"engine":lc.AUX_ENGINE,"buildWitness":lc.AUX_WITNESS,"projection":"fold2-1d-v1","fxRegistered":28,"fxFailed":0,"modeCount":249,"fxFirst":220,"fxLast":247,"uvFollowEffectId":248,"uvFollowRegistered":True,"uvOutputsVerified":0}},"info":{"ver":"0.16.1","leds":{"count":40}},"effects":fx,"cfg":{},"pins":{}}
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
