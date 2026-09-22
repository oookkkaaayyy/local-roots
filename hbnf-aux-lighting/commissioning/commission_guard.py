#!/usr/bin/env python3
"""Guarded HBNF AUX commissioning state machine.

Default behavior is read-only. Interactive mutation is only performed after an
exact Matrix/Aux target is identified, a fresh backup is written, and the user
explicitly confirms the requested phase.

The script never updates Supabase physical acceptance flags. Those remain a
separate evidence gate after real electrical/visual/thermal testing.
"""
from __future__ import annotations

import argparse, getpass, hashlib, ipaddress, json, pathlib, re, socket, subprocess, sys, time
import urllib.error, urllib.request, uuid

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import local_commission as lc
import commission_operator as op
import generate_aux_hardware_plan as hp

REPORT_NAME = "HBNF_AUX_COMMISSION_LATEST.json"
EVIDENCE_NAME = "HBNF_AUX_ACCEPTANCE_EVIDENCE.json"
CLOUD_BASE = "https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1"
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
    return {"total":hw.get("total"),"maxpwr":hw.get("maxpwr"),"buses":buses,"segments":segs,"mainseg":state.get("mainseg")}

def hardware_ok(d):
    s=hardware_summary(d);by_pin={tuple(x.get("pin") or []):x for x in s["buses"]}
    u,m,sh=by_pin.get((16,)),by_pin.get((25,)),by_pin.get((26,))
    if not (u and m and sh) or len(s["buses"])!=3: return False
    if int(u.get("type") or -1)!=hp.TYPE_DIGITAL_RGB or int(m.get("type") or -1)!=hp.TYPE_ANALOG_1CH or int(sh.get("type") or -1)!=hp.TYPE_ANALOG_1CH: return False
    pixels=int(u.get("len") or 0)
    if pixels<1 or int(u.get("start") or -1)!=0: return False
    if int(u.get("maxpwr") or 0)!=900 or int(s.get("maxpwr") or 0)!=900: return False
    if int(m.get("start") or -1)!=pixels or int(m.get("len") or 0)!=1: return False
    if int(sh.get("start") or -1)!=pixels+1 or int(sh.get("len") or 0)!=1: return False
    if int(s.get("total") or 0)!=pixels+2: return False
    seg={int(x["id"]):x for x in s["segments"]}
    s0,s1,s2=seg.get(0) or {},seg.get(1) or {},seg.get(2) or {}
    bounds=(int(s0.get("start") or 0)==0 and int(s0.get("stop") or -1)==pixels and int(s1.get("start") or -1)==pixels and int(s1.get("stop") or -1)==pixels+1 and int(s2.get("start") or -1)==pixels+1 and int(s2.get("stop") or -1)==pixels+2)
    return bounds and s.get("mainseg")==0 and s0.get("sel") is True and s1.get("sel") is False and s2.get("sel") is False and s1.get("on") is False and s2.get("on") is False

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
    boundary="----HBNF"+uuid.uuid4().hex
    data=fw.read_bytes()
    chunks=[
      f'--{boundary}\\r\\nContent-Disposition: form-data; name="skipValidation"\\r\\n\\r\\n1\\r\\n'.encode(),
      f'--{boundary}\\r\\nContent-Disposition: form-data; name="update"; filename="{fw.name}"\\r\\nContent-Type: application/octet-stream\\r\\n\\r\\n'.encode(),
      data,
      f'\\r\\n--{boundary}--\\r\\n'.encode()
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
    info=before.get("info") or {}
    arch=str(info.get("arch") or "").lower()
    flash_mb=int(info.get("flash") or 0)
    if "esp32" not in arch: raise RuntimeError(f"Aux target architecture is {arch!r}, not ESP32.")
    if flash_mb!=4: raise RuntimeError(f"Aux target reports {flash_mb} MB flash; expected the verified SP803E 4 MB target.")
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

def _observed_color(label):
    while True:
        v=input(f"When commanded {label}, what color is the underglow actually showing? [R/G/B/X=stop]: ").strip().upper()
        if v in ("R","G","B"): return v
        if v=="X": raise RuntimeError("Color-order calibration stopped by user.")
        print("Enter R, G, B, or X.")

def calibrate_color_order(ip,pixels,reverse=False):
    print("\nCOLOR-ORDER CALIBRATION — low-current underglow only; both UV segments remain OFF.")
    print("I will configure a temporary RGB bus at 300 mA and show red, green, then blue.")
    before=lc.inspect(ip);rb=hw_rollback(before)
    temp=hp.build(pixels,"RGB",reverse,300,55)
    applied=apply_hardware(ip,temp)
    observed=[];restore_error=None
    colors=[("RED",[255,0,0]),("GREEN",[0,255,0]),("BLUE",[0,0,255])]
    try:
        for name,rgb in colors:
            state_post(ip,{"on":True,"mainseg":0,"seg":[{"id":0,"on":True,"sel":True,"bri":32,"fx":0,"pal":0,"col":[rgb,[0,0,0],[0,0,0]]},{"id":1,"on":False,"sel":False},{"id":2,"on":False,"sel":False}]})
            time.sleep(.8)
            observed.append(_observed_color(name))
    finally:
        try:
            state_post(ip,{"seg":[{"id":0,"on":False},{"id":1,"on":False},{"id":2,"on":False}]})
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
    main=mode in ("main","full");short=mode in ("short","full")
    return state_post(ip,{"on":True,"mainseg":0,"seg":[{"id":0,"sel":True},{"id":1,"on":main,"bri":255,"sel":False,"col":[[255,255,255]]},{"id":2,"on":short,"bri":255,"sel":False,"col":[[255,255,255]]}]})

def _uv_off(ip):
    try: return state_post(ip,{"seg":[{"id":1,"on":False,"sel":False},{"id":2,"on":False,"sel":False}]})
    except Exception: return None

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
    ev["firmwareSha256"]=op.EXPECTED_FW_SHA;ev["packageDir"]=str(pathlib.Path(args.package_dir).resolve())
    save_evidence(ev,ep)
    print(f"\nPHYSICAL ACCEPTANCE — resumable evidence file: {ep}")
    if not _accept_prompt(ev,ep,"hardware_wired","Confirm physical SP803E + underglow + both UV branches are fully mounted/wired, insulated and strain-relieved."): return ev
    if not _accept_prompt(ev,ep,"power_verified","Confirm 12V polarity/common-ground path is correct and nothing is abnormally hot at idle."): return ev
    cur=lc.inspect(aux_ip)
    if not hardware_ok(cur): raise RuntimeError("Hardware configuration no longer matches the accepted GPIO/current/segment plan.")
    summary=hardware_summary(cur)
    accept_evidence(ev,"gpio_verified",summary);accept_evidence(ev,"current_limit_verified",{"underglowMaxMilliamps":next((x.get("maxpwr") for x in summary["buses"] if x.get("pin")==[16]),None)});accept_evidence(ev,"segments_verified",summary["segments"]);save_evidence(ev,ep)
    ac=lc.check_aux(cur);mc=lc.check_matrix(lc.inspect(matrix_ip))
    if not all_true(ac,AUX_SYNC_KEYS) or not all_true(mc,("visualSyncSend","audioSyncSend")):
        raise RuntimeError("Local Matrix→AUX visual/audio sync config is not proven; rerun software commissioning first.")
    if not ev.get("accepted",{}).get("underglow_sync_verified"):
        print("\nPlay normal music through the cart speakers. Matrix is the audio/visual master; UV should remain off.")
        if not prompt_yes("Confirm the underglow visibly follows the Matrix/music response rather than running an unrelated generic animation."): return ev
        for k in ("audio_input_verified","udp_sync_verified","underglow_sync_verified"): accept_evidence(ev,k,{"userConfirmed":True,"matrixMaster":True,"audioPort":11988})
        save_evidence(ev,ep)
    for key,mode,label in (("uv_main_verified","main","MAIN UV only"),("uv_short_verified","short","SHORT UV only"),("uv_full_verified","full","BOTH UV strips at full power")):
        if ev.get("accepted",{}).get(key) is True: continue
        print(f"\nTesting {label}. Underglow may continue following Matrix; only the requested UV branch(es) should energize.")
        _local_uv(aux_ip,mode);time.sleep(.8)
        ok=prompt_yes(f"Confirm {label} is correct and no wrong UV branch energizes.")
        _uv_off(aux_ip)
        if not ok: return ev
        accept_evidence(ev,key,{"userConfirmed":True,"mode":mode,"uvBrightness":255});save_evidence(ev,ep)
    if not ev.get("accepted",{}).get("thermal_verified") or not ev.get("accepted",{}).get("mixed_load_verified"):
        print("\nMIXED-LOAD / THERMAL TEST")
        print("I will turn BOTH UV strips fully on while the underglow continues its normal Matrix-synced operation.")
        print("Run representative music for at least 10 minutes. Check the power bank, PD cable/plug, SP803E, connectors and wiring.")
        if not prompt_yes("Start the mixed-load test now?"): return ev
        _local_uv(aux_ip,"full")
        try:
            input("After >=10 minutes, press Return. If anything becomes VERY hot, resets, flickers or smells wrong, disconnect power first. ")
            if not prompt_yes("Confirm there were NO resets/interference and all power/control parts stayed within normal safe warmth."): return ev
        finally: _uv_off(aux_ip)
        accept_evidence(ev,"thermal_verified",{"userConfirmed":True,"representativeMinutes":10})
        accept_evidence(ev,"mixed_load_verified",{"userConfirmed":True,"uv":"full","underglow":"matrix-synced"});save_evidence(ev,ep)
    if not ev.get("accepted",{}).get("mqtt_cloud_path_prepared"):
        print("\nUNIFIED CLOUD CONTROL")
        r=configure_aux_mqtt_from_matrix(matrix_ip,aux_ip)
        accept_evidence(ev,"mqtt_cloud_path_prepared",r);save_evidence(ev,ep)
        if r.get("publicTestBroker"):
            print("Current Matrix broker is broker.emqx.io. AUX was matched to it for functional parity; release-doctor will keep flagging this transport as a hardening risk until both nodes migrate together.")
    if not ev.get("accepted",{}).get("field_wifi_prepared"):
        print("\nFIELD/HOTSPOT PROFILE")
        r=ensure_field_wifi_profile(matrix_ip,aux_ip,args.field_ssid)
        if r.get("prepared"):
            accept_evidence(ev,"field_wifi_prepared",r);save_evidence(ev,ep)
        else:
            ev.setdefault("observations",{})["field_wifi_prepared"]=r;save_evidence(ev,ep)
            print("A course/hotspot Wi-Fi profile could not be proven automatically. This can be completed on a later rerun without repeating accepted steps.")
    if not ev.get("accepted",{}).get("cold_boot_verified"):
        print("\nCOLD-BOOT PERSISTENCE")
        if prompt_yes("Ready to power BOTH controllers fully off for at least 10 seconds, then power them back on?"):
            input("Power both off >=10 seconds, power them back on, wait for normal startup, then press Return. ")
            post=preflight(args)
            if post.get("nextAction")!="BEGIN_PHYSICAL_ACCEPTANCE": raise RuntimeError("Cold-boot recheck did not return to fully prepared local state: "+str(post.get("nextAction")))
            accept_evidence(ev,"cold_boot_verified",{"matrixIp":post["matrix"]["ip"],"auxIp":post["aux"]["ip"],"nextAction":post["nextAction"]});save_evidence(ev,ep)
    if ev.get("accepted",{}).get("field_wifi_prepared") and not ev.get("accepted",{}).get("hotspot_verified"):
        print("\nOPTIONAL NOW / REQUIRED BEFORE COURSE-READY: actual iPhone-hotspot failover test.")
        print("Both controllers must REALLY be on the iPhone hotspot; if home Wi-Fi remains available they may stay on home instead.")
        if prompt_yes("Run the real hotspot test now?"):
            input("Enable the iPhone hotspot, ensure both controllers migrate to it, join this Mac to that hotspot, then press Return. ")
            hpflight=preflight(args)
            if hpflight.get("nextAction")!="BEGIN_PHYSICAL_ACCEPTANCE": raise RuntimeError("Hotspot rediscovery did not prove both prepared controllers: "+str(hpflight.get("nextAction")))
            hm,ha=hpflight["matrix"]["ip"],hpflight["aux"]["ip"]
            if not prompt_yes("Confirm underglow still follows Matrix/music on the hotspot and neither controller reset/reverted."): return ev
            cloud={"releaseDoctor":cloud_json("hbnf-release-doctor"),"matrixStatus":cloud_json("hbnf-matrix-control","POST",{"action":"status"})}
            if not cloud["matrixStatus"].get("ok"): raise RuntimeError("Cloud Matrix status failed during hotspot test.")
            accept_evidence(ev,"hotspot_verified",{"matrixIp":hm,"auxIp":ha,"cloud":cloud});save_evidence(ev,ep)
    gate_keys=("hardware_wired","power_verified","gpio_verified","current_limit_verified","segments_verified","audio_input_verified","udp_sync_verified","underglow_sync_verified","uv_main_verified","uv_short_verified","uv_full_verified","thermal_verified","mixed_load_verified")
    ev["physicalGateReady"]=all(ev.get("accepted",{}).get(k) is True for k in gate_keys)
    ev["readyForGateImport"]=ev["physicalGateReady"]
    ev["courseFieldReady"]=bool(ev["physicalGateReady"] and ev.get("accepted",{}).get("cold_boot_verified") and ev.get("accepted",{}).get("field_wifi_prepared") and ev.get("accepted",{}).get("hotspot_verified"))
    ev["cloudSnapshot"]={"releaseDoctor":cloud_json("hbnf-release-doctor"),"aux":cloud_json("hbnf-aux-control"),"cart":cloud_json("hbnf-cart-orchestrator")}
    finalCloud=final_cloud_verification();ev["finalCloudVerification"]=finalCloud
    if finalCloud.get("ok"): accept_evidence(ev,"final_cloud_verified",{"checks":finalCloud.get("checks"),"releaseRisks":finalCloud.get("releaseRisks")})
    ev["fullyReady"]=bool(ev["courseFieldReady"] and ev.get("accepted",{}).get("final_cloud_verified"))
    save_evidence(ev,ep)
    print(json.dumps({"physicalGateReady":ev["physicalGateReady"],"courseFieldReady":ev["courseFieldReady"],"finalCloudVerified":ev.get("accepted",{}).get("final_cloud_verified",False),"fullyReady":ev["fullyReady"],"evidence":str(ep)},indent=2))
    if ev["readyForGateImport"] and not ev.get("accepted",{}).get("final_cloud_verified"):
        print("Physical acceptance evidence is complete. Backend AUX gates remain intentionally closed until ChatGPT imports this evidence into Supabase. Send this single evidence JSON; do not repeat the tests. Then rerun this same launcher once for final cloud verification.")
    if ev.get("fullyReady"):
        print("LOCAL + FIELD + CLOUD acceptance are all complete. Release-doctor may still report the known MQTT public-broker hardening risk until a future broker migration.")
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
        print(f"\nTarget AUX: {a}. Matrix: {m}. Fresh backups were created.")
        print("This uploads the exact proven AUX firmware and reboots ONLY the identified AUX node.")
        if not prompt_yes("Install exact AUX firmware now?"): return {"history":history,"current":pf}
        r=ota_install(a,pathlib.Path(args.package_dir).resolve()/"HBNF_SP803E_AUX_R3.bin");history.append({"phase":"install-firmware","result":r});pf=preflight(args);history.append({"phase":"post-firmware-preflight","result":pf});write_report({"history":history,"current":pf},report_path(args.report))
    if pf["nextAction"]=="APPLY_HARDWARE_PLAN":
        print("\nHardware config needs the ACTUAL installed WS2811 logical group count. Color order will be calibrated for you.")
        pixels=int(input("Actual installed WS2811 logical pixel/group count: ").strip())
        reverse=input("Is the strip data direction intentionally reversed from controller→far end? [y/N]: ").strip().lower()=="y"
        if not prompt_yes("Run a low-current three-color calibration to determine strip color order?"): return {"history":history,"current":pf}
        cal=calibrate_color_order(a,pixels,reverse);history.append({"phase":"color-order-calibration","result":{"order":cal["order"],"observed":cal["observed"]}})
        order=cal["order"]
        plan=hp.build(pixels,order,reverse,900,55);print(json.dumps({"inputs":plan["inputs"],"postApplyChecks":plan["postApplyChecks"]},indent=2))
        if not prompt_yes("Apply this final hardware/segment plan to AUX only?"): return {"history":history,"current":pf,"pendingPlan":plan}
        r=apply_hardware(a,plan);history.append({"phase":"apply-hardware","result":r});pf=preflight(args);history.append({"phase":"post-hardware-preflight","result":pf});write_report({"history":history,"current":pf},report_path(args.report))
    if pf["nextAction"]=="RUN_GUARDED_PREPARE_SYNC":
        print("\nNext change configures Matrix SEND + AUX RECEIVE local sync only; it does not open cloud/Supabase AUX actuation.")
        if not prompt_yes("Apply guarded sync configuration now?"): return {"history":history,"current":pf}
        r=prepare_sync_with_rollback(m,a);history.append({"phase":"prepare-sync","result":r});pf=preflight(args);history.append({"phase":"post-sync-preflight","result":pf});write_report({"history":history,"current":pf},report_path(args.report))
    if pf["nextAction"]=="BEGIN_PHYSICAL_ACCEPTANCE":
        ev=physical_acceptance(args,m,a,history);history.append({"phase":"physical-acceptance","result":{"evidence":str(evidence_path(args.evidence)),"physicalGateReady":ev.get("physicalGateReady"),"courseFieldReady":ev.get("courseFieldReady")}})
    return {"history":history,"current":pf,"evidence":str(evidence_path(args.evidence))}

def selftest():
    body,ctype=multipart_firmware(pathlib.Path(__file__))
    assert b'name="skipValidation"' in body and b'name="update"' in body and "multipart/form-data" in ctype
    fake={"cfg":{"hw":{"led":{"total":39,"maxpwr":900,"ins":[{"pin":[16],"start":0,"len":37,"type":22,"order":1,"rev":False,"maxpwr":900},{"pin":[25],"start":37,"len":1,"type":41,"order":0,"rev":False,"maxpwr":0},{"pin":[26],"start":38,"len":1,"type":41,"order":0,"rev":False,"maxpwr":0}]}}},"state":{"mainseg":0,"seg":[{"id":0,"start":0,"stop":37,"sel":True,"on":True},{"id":1,"start":37,"stop":38,"sel":False,"on":False},{"id":2,"start":38,"stop":39,"sel":False,"on":False}]}}
    assert hardware_ok(fake);bad=json.loads(json.dumps(fake));bad["state"]["seg"][1]["sel"]=True;assert not hardware_ok(bad)
    low=json.loads(json.dumps(fake));low["cfg"]["hw"]["led"]["ins"][0]["maxpwr"]=300;assert not hardware_ok(low)
    drift=json.loads(json.dumps(fake));drift["state"]["seg"][2]["start"]=37;assert not hardware_ok(drift)
    assert candidate_subnets("192.168.1.0/24",None)==["192.168.1.0/24"]
    sample="en0: flags=8863<UP>\n\tinet 192.168.68.77 netmask 0xfffffc00 broadcast 192.168.71.255\nlo0: flags=8049<UP>\n\tinet 127.0.0.1 netmask 0xff000000\n"
    assert parse_ifconfig_networks(sample)==["192.168.68.0/22"]
    assert infer_color_order(["G","R","B"])=="GRB"
    assert infer_color_order(["R","G","B"])=="RGB"
    try:
        infer_color_order(["R","R","B"]);raise AssertionError("duplicate observed color accepted")
    except ValueError: pass
    print("HBNF_AUX_COMMISSION_GUARD_SELFTEST_PASS")

def main():
    p=argparse.ArgumentParser(description="Guarded HBNF AUX commissioning state machine")
    p.add_argument("--phase",choices=["preflight","install-firmware","apply-hardware","prepare-sync","verify","interactive"],default="preflight")
    p.add_argument("--matrix-hint",default="192.168.68.89");p.add_argument("--aux",default="auto");p.add_argument("--subnet")
    p.add_argument("--package-dir",default=str(HERE));p.add_argument("--backup",action="store_true",default=True);p.add_argument("--no-backup",dest="backup",action="store_false")
    p.add_argument("--backup-root",default="~/Desktop");p.add_argument("--report");p.add_argument("--evidence");p.add_argument("--field-ssid")
    p.add_argument("--pixels",type=int);p.add_argument("--order",choices=list(hp.ORDER_CODES));p.add_argument("--reverse",action="store_true");p.add_argument("--yes",action="store_true");p.add_argument("--selftest",action="store_true")
    a=p.parse_args()
    if a.selftest: selftest();return 0
    rp=report_path(a.report)
    if a.phase=="interactive":
        result=interactive(a);write_report(result,rp);print(f"\nReport: {rp}");return 0
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
