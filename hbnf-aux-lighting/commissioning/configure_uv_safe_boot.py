#!/usr/bin/env python3
"""Save and cold-boot-verify an AUX preset with both UV outputs OFF.

This narrow operation preserves the current mapped buses and underglow state.
It does not alter firmware, GPIO mappings, segment bounds, or UV activation gates.
"""
from __future__ import annotations
import argparse, hashlib, json, pathlib, time, urllib.request, uuid
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo

IP, MAC, VERSION = "192.168.77.11", "8c94df55c34c", "16.0.1"
WITNESS = ("hbnf-wow-aux-r3-2026-10-25-uv-follow-v1", "aux-r3-wow-1d",
           "registry28-tempo-lock-1d-v7-network-no-starve-uv-follow")
BUSES = [([16],22,0,22),([25],41,22,1),([26],41,23,1)]

def req(path, method="GET", body=None, timeout=5):
    data = None if body is None else json.dumps(body,separators=(",",":")).encode()
    headers = {"Accept":"application/json"}
    if data is not None: headers["Content-Type"]="application/json"
    r=urllib.request.Request(f"http://{IP}{path}",data=data,headers=headers,method=method)
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(r,timeout=timeout) as x:
        raw=x.read()
    return json.loads(raw) if raw else {}

def upload_presets(presets):
    """Replace presets.json through WLED's supported filesystem upload route."""
    boundary="----hbnf-uv-"+uuid.uuid4().hex
    payload=json.dumps(presets,separators=(",",":"),ensure_ascii=False).encode()
    body=(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"presets.json\"\r\n"
          "Content-Type: application/json\r\n\r\n").encode()+payload+f"\r\n--{boundary}--\r\n".encode()
    r=urllib.request.Request(f"http://{IP}/upload",data=body,headers={
        "Content-Type":f"multipart/form-data; boundary={boundary}","Accept":"text/plain"},method="POST")
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(r,timeout=10) as x:
        return {"httpStatus":x.status,"body":x.read().decode("utf-8","replace"),
                "payloadSha256":hashlib.sha256(payload).hexdigest(),"payloadBytes":len(payload)}

def save(root,name,obj):
    p=root/f"{name}.json"; p.write_text(json.dumps(obj,indent=2,sort_keys=True)+"\n"); return p

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def write_archive(path,files):
    with ZipFile(path,"w",ZIP_DEFLATED,compresslevel=9) as z:
        for name,source in sorted(files):
            info=ZipInfo(name,(2026,1,1,0,0,0)); info.compress_type=ZIP_DEFLATED
            z.writestr(info,source.read_bytes())

def snapshot(root,prefix="pre"):
    out={}
    for n,path in (("info","/json/info"),("state","/json/state"),("cfg","/json/cfg"),
                   ("pins","/json/pins"),("presets","/presets.json")):
        out[n]=req(path); save(root,f"{prefix}-{n}",out[n])
    return out

def validate(x):
    i,s,c=x["info"],x["state"],x["cfg"]
    if str(i.get("mac","")).replace(":","").lower()!=MAC or str(i.get("ver"))!=VERSION:
        raise RuntimeError("AUX identity/version mismatch")
    w=s.get("HBNFAUX") or {}
    if (w.get("release"),w.get("engine"),w.get("buildWitness"))!=WITNESS:
        raise RuntimeError("AUX firmware witness mismatch")
    if w.get("uvOutputsVerified")!=1 or w.get("uvBuildProfile")!="uv-follow-output-capable-v1":
        raise RuntimeError("Output-capable AUX witness is absent")
    led=((c.get("hw") or {}).get("led") or {})
    got=[(b.get("pin"),b.get("type"),b.get("start"),b.get("len")) for b in led.get("ins",[])]
    if got!=BUSES or led.get("total")!=24 or (c.get("light") or {}).get("aseg") is not True:
        raise RuntimeError("Current three-bus AUX layout differs from the admitted target")
    seg={int(z.get("id",n)):z for n,z in enumerate(s.get("seg",[]))}
    bounds={0:(0,22),1:(22,23),2:(23,24)}
    for sid,(a,b) in bounds.items():
        if (seg.get(sid,{}).get("start"),seg.get(sid,{}).get("stop"))!=(a,b):
            raise RuntimeError(f"Segment {sid} bounds differ")
    if seg[1].get("on") is not False or seg[2].get("on") is not False:
        raise RuntimeError("UV output is currently ON; refusing restart")
    if not isinstance(c.get("def"),dict) or not isinstance(c["def"].get("ps"),int):
        raise RuntimeError("Prior boot preset is unavailable")
    if not isinstance(x["presets"],dict): raise RuntimeError("Preset list is unreadable")
    return seg

def safe_state(s,segments):
    z={k:s[k] for k in ("on","bri") if k in s}; z.update({"on":True,"mainseg":0})
    arr=[]
    for sid in range(3):
        v=dict(segments[sid]); v["id"]=sid; v["sel"]=(sid==0)
        if sid in (1,2): v.update({"on":False,"bri":0,"fx":0,"ix":0})
        arr.append(v)
    z["seg"]=arr
    return z

def check_preset(preset):
    if not isinstance(preset,dict) or preset.get("on") is not True or preset.get("mainseg")!=0:
        raise RuntimeError("Preset does not preserve global ON and underglow selection")
    ss={int(v.get("id",n)):v for n,v in enumerate(preset.get("seg",[]))}
    for sid,a,b,on in ((0,0,22,True),(1,22,23,False),(2,23,24,False)):
        v=ss.get(sid,{})
        if (v.get("start"),v.get("stop"),v.get("on"))!=(a,b,on):
            raise RuntimeError(f"Preset segment {sid} mismatch")

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--evidence-dir",required=True)
    p.add_argument("--apply",action="store_true")
    p.add_argument("--module-confirmed-disconnected",action="store_true")
    p.add_argument("--admission-manifest")
    a=p.parse_args()
    root=pathlib.Path(a.evidence_dir).resolve()
    if a.apply:
        if not root.is_dir() or not all((root/n).is_file() for n in ("candidate.zip","baseline.zip","admission.json")):
            raise SystemExit("apply requires admitted candidate.zip, baseline.zip, and admission.json")
    else:
        root.mkdir(parents=True,exist_ok=False)
    if a.apply and not a.module_confirmed_disconnected:
        raise SystemExit("--apply requires --module-confirmed-disconnected")
    pre=snapshot(root); seg=validate(pre); oldboot=pre["cfg"]["def"]["ps"]
    pid=next((n for n in range(250,0,-1) if str(n) not in pre["presets"]),None)
    if pid is None: raise RuntimeError("No unused WLED preset slot")
    state=safe_state(pre["state"],seg)
    plan={"targetMac":MAC,"wledVersion":VERSION,"presetId":pid,"previousBootPresetId":oldboot,
          "state":state,"moduleMustRemainDisconnected":True}
    planfile=save(root,"candidate-plan",plan)
    if not a.apply:
        print(json.dumps({"result":"READONLY_PLAN_PASS","presetId":pid,"previousBootPresetId":oldboot,
                          "candidatePlanSha256":sha(planfile),"snapshotSha256":
                          {x.name:sha(x) for x in root.glob("pre-*.json")}},indent=2))
        return
    if not a.admission_manifest: raise RuntimeError("release admission manifest is required")
    adm=json.loads(pathlib.Path(a.admission_manifest).read_text())
    if (adm.get("baseline",{}).get("identity")!=f"AUX {MAC} WLED {VERSION}; UV map 16/25/26; boot preset {oldboot}"
        or adm.get("package",{}).get("sha256")!=sha(root/"candidate.zip")):
        raise RuntimeError("admission manifest does not bind the fresh target and candidate")
    if (adm.get("baseline",{}).get("artifactSha256")!=sha(root/"baseline.zip")
        or adm.get("baseline",{}).get("artifactBytes")!=(root/"baseline.zip").stat().st_size):
        raise RuntimeError("rollback snapshot differs from admitted bytes; no change made")
    with ZipFile(root/"baseline.zip") as z:
        old_cfg=json.loads(z.read("pre-cfg.json"))
        old_presets=json.loads(z.read("pre-presets.json"))
    if old_cfg!=pre["cfg"] or old_presets!=pre["presets"]:
        raise RuntimeError("live AUX config/presets changed since admission; no change made")
    with ZipFile(root/"candidate.zip") as z:
        if z.read("candidate-plan.json")!=planfile.read_bytes():
            raise RuntimeError("admitted package does not contain the exact live candidate plan")
        if z.read("configure_uv_safe_boot.py")!=pathlib.Path(__file__).read_bytes():
            raise RuntimeError("admitted operator source differs from the running file")
    uptime=float(pre["info"].get("uptime",0))
    try:
        # First put the safe state in RAM. Under active Matrix DDP, WLED 16.0.1
        # acknowledged psave but did not persist presets.json. Use WLED's own
        # /upload handler for deterministic file persistence without pausing DDP.
        apply_ack=req("/json/state","POST",state)
        save(root,"state-apply-ack",apply_ack)
        if apply_ack.get("success") is False:
            raise RuntimeError(f"WLED rejected safe state: {apply_ack}")
        updated=dict(pre["presets"])
        preset=dict(state);preset["n"]="HBNF AUX UV safe startup"
        updated[str(pid)]=preset
        save_ack=upload_presets(updated);save(root,"preset-save-ack",save_ack)
        if save_ack["httpStatus"]!=200 or "File Uploaded!" not in save_ack["body"]:
            raise RuntimeError(f"WLED filesystem upload rejected: {save_ack}")
        deadline=time.monotonic()+10
        while time.monotonic()<deadline:
            pm=req("/presets.json")
            if pm==updated:
                check_preset(pm[str(pid)]);break
            time.sleep(.25)
        else: raise RuntimeError("uploaded presets.json did not read back byte-equivalent data")
        cfg=req("/json/cfg")
        if (cfg.get("def") or {}).get("ps")!=pid:
            cfg_ack=req("/json/cfg","POST",{"def":{"ps":pid},"sv":True})
            save(root,"boot-preset-save-ack",cfg_ack)
        if (req("/json/cfg").get("def") or {}).get("ps")!=pid: raise RuntimeError("boot preset selection did not persist")
        deadline=time.monotonic()+50
        while time.monotonic()<deadline:
            try:
                info=req("/json/info",timeout=3)
                if info.get("mac","").replace(":","").lower()==MAC and float(info.get("uptime",uptime))<uptime: break
            except Exception: pass
            time.sleep(1)
        else: raise RuntimeError("AUX restart did not complete within 50 seconds")
        post=snapshot(root,"post"); pseg=validate(post)
        if post["cfg"]["def"].get("ps")!=pid: raise RuntimeError("boot preset did not survive restart")
        check_preset(post["presets"].get(str(pid)))
        if pseg[1].get("on") is not False or pseg[2].get("on") is not False:
            raise RuntimeError("a UV segment is ON after restart")
        result={"result":"PASS_SAFE_BOOT","presetId":pid,"previousBootPresetId":oldboot,
                "postReadbackHashes":{x.name:sha(x) for x in root.glob("post-*.json")}}
        save(root,"closeout",result); print(json.dumps(result,indent=2))
    except Exception as e:
        errors=[]
        try:
            rollback_ack=upload_presets(pre["presets"]);save(root,"rollback-presets-upload-ack",rollback_ack)
            if rollback_ack["httpStatus"]!=200: raise RuntimeError(f"preset-file rollback HTTP {rollback_ack['httpStatus']}")
            req("/json/cfg","POST",{"def":{"ps":oldboot},"sv":True})
            req("/json/state","POST",{"on":pre["state"].get("on",True),"bri":pre["state"].get("bri",255),
                "mainseg":pre["state"].get("mainseg",0),"seg":pre["state"].get("seg",[])})
            if req("/json/cfg").get("def",{}).get("ps")!=oldboot: raise RuntimeError("old boot selection mismatch")
            if req("/presets.json")!=pre["presets"]: raise RuntimeError("original presets did not restore exactly")
        except Exception as re: errors.append(str(re))
        raise RuntimeError(f"safe-start update failed: {e}; rollback errors={errors}") from e

if __name__=="__main__": main()
