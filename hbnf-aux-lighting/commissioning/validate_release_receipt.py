#!/usr/bin/env python3
"""Fail-closed validator for completed AUX firmware release receipts."""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, pathlib, re, sys

HEX64=re.compile(r"^[0-9a-f]{64}$")
HEX40=re.compile(r"^[0-9a-f]{40}$")
SECRET_KEY=re.compile(r"password|token|secret|private.?key|credential",re.I)
SECRET_VALUE=re.compile(r"(?i)(?:\bbearer\s+\S+|\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,})\b|[?&](?:access_token|token|api_key|password)=\S+)")

def sha256(path:pathlib.Path)->str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):h.update(chunk)
    return h.hexdigest()

def _hash_file(root:pathlib.Path,rel:str,size:int,digest:str,label:str,errors:list[str])->None:
    if not isinstance(rel,str) or not rel:
        errors.append(label+" path is missing");return
    p=(root/rel).resolve()
    try:p.relative_to(root.resolve())
    except ValueError:errors.append(label+" path escapes evidence root");return
    if not p.is_file():errors.append(label+" file is missing");return
    if p.stat().st_size!=size:errors.append(label+" size mismatch")
    if not HEX64.fullmatch(str(digest)) or sha256(p)!=digest:errors.append(label+" SHA-256 mismatch")

def validate(receipt:dict,root:pathlib.Path,receipt_path:pathlib.Path|None=None)->list[str]:
    e=[]
    if not isinstance(receipt,dict):return ["receipt must be an object"]
    if receipt.get("schema")!="hbnf-aux-release-receipt-v1":e.append("schema mismatch")
    if receipt.get("status")!="COMPLETE":e.append("status must be COMPLETE")
    allowed={"schema","status","source","build","candidate","pre_install","rollback","installation","post_install","acceptance","evidence_refs"}
    if set(receipt)!=allowed:e.append("receipt has missing or unrecognized top-level fields")
    def obj(name,fields):
        v=receipt.get(name)
        if not isinstance(v,dict):e.append(name+" must be an object");return {}
        if set(v)!=set(fields):e.append(name+" has missing or unrecognized fields")
        return v
    source=obj("source",["commit"]);build=obj("build",["workflow_path","workflow_ref","run_id","run_url","toolchain","pinned_inputs"])
    cand=obj("candidate",["filename","size","sha256","path"])
    pre=obj("pre_install",["release","firmware_sha256","readback_evidence_ref","firmware_image_path"])
    rb=obj("rollback",["filename","size","sha256","path","durable_location","durable_readback_path"])
    inst=obj("installation",["timestamp","operator","action","target_identity","durable_receipt_location","durable_receipt_readback_path"])
    post=obj("post_install",["firmware_version","release","engine","build_witness","firmware_sha256","firmware_image_path","readback_evidence_ref","runtime_readback_path","runtime_readback_sha256"])
    acc=obj("acceptance",["runtime","physical_uv","rollback"])
    if not HEX40.fullmatch(str(source.get("commit",""))):e.append("source commit must be an exact lowercase Git SHA")
    for key in ("workflow_path","workflow_ref","run_id","run_url"):
        if not isinstance(build.get(key),str) or not build[key].strip():e.append("build."+key+" is required")
    if not str(build.get("run_url","")).startswith("https://"):e.append("build.run_url must be HTTPS")
    for key in ("toolchain","pinned_inputs"):
        v=build.get(key)
        if not isinstance(v,dict) or not v or any(not isinstance(x,str) or not x.strip() for x in v.values()):e.append("build."+key+" must contain nonempty pinned values")
    if isinstance(build.get("pinned_inputs"),dict):
        for key in ("wled_commit","source_bundle_sha256","wled_requirements_sha256","aux_patch_sha256"):
            if not build["pinned_inputs"].get(key):e.append("build.pinned_inputs."+key+" is required")
    if not isinstance(cand.get("filename"),str) or pathlib.PurePosixPath(cand.get("filename","/" )).name!=cand.get("filename"):e.append("candidate filename must be a basename")
    if cand.get("path") and pathlib.PurePosixPath(str(cand.get("path"))).name!=cand.get("filename"):e.append("candidate path and filename differ")
    try:csize=int(cand.get("size"));
    except Exception:csize=0;e.append("candidate size must be a positive integer")
    if csize<=0:e.append("candidate size must be positive")
    if not HEX64.fullmatch(str(cand.get("sha256",""))):e.append("candidate SHA-256 is invalid")
    _hash_file(root,str(cand.get("path","")),csize,str(cand.get("sha256","")),"candidate",e)
    for key in ("release","readback_evidence_ref","firmware_image_path"):
        if not isinstance(pre.get(key),str) or not pre[key].strip():e.append("pre_install."+key+" is required")
    if not HEX64.fullmatch(str(pre.get("firmware_sha256",""))):e.append("pre_install firmware SHA-256 is invalid")
    if pre.get("firmware_sha256")!=rb.get("sha256"):e.append("pre-install firmware and rollback hashes differ")
    _hash_file(root,str(pre.get("firmware_image_path","")),int(rb.get("size") or 0),str(pre.get("firmware_sha256","")),"pre-install firmware readback",e)
    if not isinstance(rb.get("filename"),str) or pathlib.PurePosixPath(rb.get("filename","/")).name!=rb.get("filename"):e.append("rollback filename must be a basename")
    if rb.get("path") and pathlib.PurePosixPath(str(rb.get("path"))).name!=rb.get("filename"):e.append("rollback path and filename differ")
    try:rsize=int(rb.get("size"));
    except Exception:rsize=0;e.append("rollback size must be a positive integer")
    if rsize<=0:e.append("rollback size must be positive")
    if not HEX64.fullmatch(str(rb.get("sha256",""))):e.append("rollback SHA-256 is invalid")
    _hash_file(root,str(rb.get("path","")),rsize,str(rb.get("sha256","")),"rollback",e)
    _hash_file(root,str(rb.get("durable_readback_path","")),rsize,str(rb.get("sha256","")),"durable rollback readback",e)
    loc=str(rb.get("durable_location",""))
    if not loc.startswith(("https://","drive-file-id:")):e.append("rollback durable_location must identify an HTTPS or Drive artifact")
    if rb.get("sha256")!=pre.get("firmware_sha256"):e.append("rollback is not the exact installed pre-state image")
    for key in ("operator","action","target_identity"):
        if not isinstance(inst.get(key),str) or not inst[key].strip():e.append("installation."+key+" is required")
    receipt_location=str(inst.get("durable_receipt_location",""))
    if not receipt_location.startswith(("https://","drive-file-id:")):e.append("installation durable receipt location is invalid")
    if not isinstance(inst.get("durable_receipt_readback_path"),str) or not inst["durable_receipt_readback_path"].strip():e.append("installation durable receipt readback path is required")
    if inst.get("action") not in ("OTA_INSTALL","ROLLBACK_RESTORE"):e.append("installation.action is invalid")
    try:
        stamp=dt.datetime.fromisoformat(str(inst.get("timestamp","Z")).replace("Z","+00:00"))
        if stamp.tzinfo is None:e.append("installation.timestamp must include timezone")
    except Exception:e.append("installation.timestamp must be ISO-8601")
    for key in ("firmware_version","release","engine","build_witness","readback_evidence_ref","runtime_readback_path"):
        if not isinstance(post.get(key),str) or not post[key].strip():e.append("post_install."+key+" is required")
    if not HEX64.fullmatch(str(post.get("runtime_readback_sha256",""))):e.append("post-install runtime readback SHA-256 is invalid")
    expected_post_sha=rb.get("sha256") if acc.get("rollback")=="RESTORED" else cand.get("sha256")
    expected_post_size=rb.get("size") if acc.get("rollback")=="RESTORED" else cand.get("size")
    if post.get("firmware_sha256")!=expected_post_sha:e.append("post-install firmware hash does not match the declared candidate/rollback outcome")
    try:_hash_file(root,str(post.get("firmware_image_path","")),int(expected_post_size or 0),str(post.get("firmware_sha256","")),"post-install firmware readback",e)
    except Exception:e.append("post-install image size is invalid")
    runtime_path=str(post.get("runtime_readback_path",""))
    if runtime_path:
        p=(root/runtime_path).resolve()
        try:p.relative_to(root.resolve())
        except ValueError:e.append("runtime readback path escapes evidence root")
        else:
            if not p.is_file():e.append("runtime readback evidence file is missing")
            else:
                if sha256(p)!=post.get("runtime_readback_sha256"):e.append("post-install runtime readback SHA-256 mismatch")
                try:
                    observed=json.loads(p.read_text())
                    for k in ("release","engine","build_witness"):
                        if observed.get(k)!=post.get(k):e.append("post-install runtime readback "+k+" mismatch")
                    if str(observed.get("version"))!=str(post.get("firmware_version")):e.append("post-install runtime readback firmware version mismatch")
                except Exception:e.append("runtime readback evidence is not valid JSON")
    if acc.get("runtime") not in ("PASS","FAIL"):e.append("acceptance.runtime must be PASS or FAIL")
    if acc.get("physical_uv") not in ("NOT_CHECKED","PASS","FAIL"):e.append("acceptance.physical_uv is invalid")
    if acc.get("rollback") not in ("NOT_NEEDED","RESTORED","FAILED"):e.append("acceptance.rollback is invalid")
    if acc.get("runtime")=="PASS" and acc.get("rollback")!="NOT_NEEDED":e.append("passing runtime outcome must record rollback NOT_NEEDED")
    if acc.get("runtime")=="FAIL" and acc.get("rollback")!="RESTORED":e.append("failed runtime requires verified exact rollback")
    if inst.get("action")=="ROLLBACK_RESTORE" and acc.get("rollback")!="RESTORED":e.append("rollback restore action must record a verified restore")
    if acc.get("runtime")=="PASS" and inst.get("action")!="OTA_INSTALL":e.append("passing candidate runtime must record OTA_INSTALL")
    refs=receipt.get("evidence_refs")
    if not isinstance(refs,list) or len(refs)<2 or any(not isinstance(x,str) or not x.strip() for x in refs):e.append("evidence_refs must contain at least two durable references")
    elif any(not str(x).startswith(("https://","drive-file-id:","github:")) for x in refs):e.append("evidence_refs must be HTTPS, Drive file IDs, or GitHub references")
    elif receipt_location not in refs:e.append("evidence_refs must include the durable receipt location")
    elif loc not in refs:e.append("evidence_refs must include the durable rollback location")
    if receipt_path is not None:
        rel=str(inst.get("durable_receipt_readback_path",""));copy_path=(root/rel).resolve()
        try:copy_path.relative_to(root.resolve())
        except ValueError:e.append("durable receipt readback path escapes evidence root")
        else:
            if not receipt_path.is_file() or not copy_path.is_file():e.append("durable receipt readback file is missing")
            elif receipt_path.read_bytes()!=copy_path.read_bytes():e.append("durable receipt readback bytes do not match the receipt")
    def secrets(v,path=""):
        if isinstance(v,dict):
            for k,x in v.items():
                if SECRET_KEY.search(str(k)):e.append("secret-bearing field is forbidden: "+path+str(k))
                secrets(x,path+str(k)+".")
        elif isinstance(v,list):
            for i,x in enumerate(v):secrets(x,path+str(i)+".")
        elif isinstance(v,str) and SECRET_VALUE.search(v):e.append("secret-like value is forbidden at "+path.rstrip("."))
    secrets(receipt)
    return e

def validate_template(template:dict,metrics:dict,firmware:pathlib.Path)->list[str]:
    e=[]
    if template.get("schema")!="hbnf-aux-release-receipt-v1" or template.get("status")!="INCOMPLETE":e.append("receipt template must be marked INCOMPLETE")
    fwsha=sha256(firmware)
    if template.get("source",{}).get("commit")!=metrics.get("github_sha"):e.append("receipt template source mismatch")
    if template.get("candidate",{}).get("sha256")!=fwsha:e.append("receipt template candidate hash mismatch")
    if template.get("candidate",{}).get("size")!=firmware.stat().st_size:e.append("receipt template candidate size mismatch")
    b=template.get("build",{})
    if b.get("run_id")!=metrics.get("github_run_id") or b.get("workflow_ref")!=metrics.get("github_ref") or b.get("run_url")!=metrics.get("github_run_url") or b.get("workflow_path")!=metrics.get("workflow_path"):e.append("receipt template workflow identity mismatch")
    expected_tools={k[10:].lower():v for k,v in metrics.items() if k.startswith("toolchain_") and v}
    expected_pins={k[6:].lower():v for k,v in metrics.items() if k.startswith("input_") and v}
    if b.get("toolchain")!=expected_tools:e.append("receipt template toolchain mismatch")
    if b.get("pinned_inputs")!=expected_pins:e.append("receipt template pinned inputs mismatch")
    return e

def main():
    p=argparse.ArgumentParser();p.add_argument("receipt",type=pathlib.Path);p.add_argument("--root",type=pathlib.Path,default=pathlib.Path.cwd());p.add_argument("--selftest",action="store_true");a=p.parse_args()
    if a.selftest:
        import tempfile,shutil
        with tempfile.TemporaryDirectory() as td:
            root=pathlib.Path(td);fw=b"candidate firmware";rb=b"installed exact firmware";(root/"candidate.bin").write_bytes(fw);(root/"rollback.bin").write_bytes(rb);(root/"durable-rollback.bin").write_bytes(rb);(root/"pre.bin").write_bytes(rb);(root/"post.bin").write_bytes(fw)
            runtime={"version":"0.16.1","release":"candidate-release","engine":"aux-r3","build_witness":"witness-v1"};(root/"runtime.json").write_text(json.dumps(runtime))
            hs=lambda name:sha256(root/name)
            rec={"schema":"hbnf-aux-release-receipt-v1","status":"COMPLETE","source":{"commit":"a"*40},
             "build":{"workflow_path":".github/workflows/build.yml","workflow_ref":"refs/heads/test","run_id":"123","run_url":"https://github.com/example/repo/actions/runs/123","toolchain":{"python":"3.12","platformio":"6.1.17","node":"20"},"pinned_inputs":{"wled_commit":"b"*40,"source_bundle_sha256":"c"*64,"wled_requirements_sha256":"d"*64,"aux_patch_sha256":"e"*64}},
             "candidate":{"filename":"candidate.bin","size":len(fw),"sha256":hs("candidate.bin"),"path":"candidate.bin"},
             "pre_install":{"release":"old","firmware_sha256":hs("pre.bin"),"readback_evidence_ref":"https://example.test/pre","firmware_image_path":"pre.bin"},
             "rollback":{"filename":"rollback.bin","size":len(rb),"sha256":hs("rollback.bin"),"path":"rollback.bin","durable_location":"drive-file-id:abc","durable_readback_path":"durable-rollback.bin"},
          "installation":{"timestamp":"2026-10-25T12:00:00Z","operator":"owner","action":"OTA_INSTALL","target_identity":"MAC:001122334455","durable_receipt_location":"drive-file-id:receipt","durable_receipt_readback_path":"receipt-copy.json"},
             "post_install":{"firmware_version":"0.16.1","release":runtime["release"],"engine":runtime["engine"],"build_witness":runtime["build_witness"],"firmware_sha256":hs("post.bin"),"firmware_image_path":"post.bin","readback_evidence_ref":"https://example.test/post","runtime_readback_path":"runtime.json","runtime_readback_sha256":hs("runtime.json")},
             "acceptance":{"runtime":"PASS","physical_uv":"NOT_CHECKED","rollback":"NOT_NEEDED"},"evidence_refs":["https://example.test/workflow","drive-file-id:receipt","drive-file-id:abc"]}
            rp=root/"receipt.json";rp.write_text(json.dumps(rec,indent=2,sort_keys=True)+"\n");(root/"receipt-copy.json").write_bytes(rp.read_bytes())
            assert not validate(rec,root,rp),validate(rec,root,rp)
            bad=json.loads(json.dumps(rec));bad["rollback"]["sha256"]="0"*64;assert validate(bad,root)
            bad=json.loads(json.dumps(rec));bad["rollback"]["durable_location"]="";assert validate(bad,root)
            bad=json.loads(json.dumps(rec));bad["acceptance"]["runtime"]="PASS";bad["installation"]["operator"]="";assert validate(bad,root)
            bad=json.loads(json.dumps(rec));bad["secrets"]={"access_token":"do-not-log"};assert validate(bad,root)
        print("HBNF_AUX_RELEASE_RECEIPT_VALIDATOR_SELFTEST_PASS");return
    try:receipt=json.loads(a.receipt.read_text())
    except Exception as e:raise SystemExit(f"receipt unreadable: {type(e).__name__}")
    errors=validate(receipt,a.root.resolve(),a.receipt.resolve())
    if errors:
        print(json.dumps({"valid":False,"errors":errors},indent=2));return 2
    print(json.dumps({"valid":True,"status":"COMPLETE","source":receipt["source"]["commit"],"candidate_sha256":receipt["candidate"]["sha256"],"physical_uv":receipt["acceptance"]["physical_uv"]},indent=2));return 0
if __name__=="__main__":raise SystemExit(main())
