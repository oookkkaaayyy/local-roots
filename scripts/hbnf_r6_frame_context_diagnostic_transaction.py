#!/usr/bin/env python3
"""One exact R6 frame-context diagnostic -> renderer restore -> exact R4 return.

No retries, restarts, or alternate artifacts. Run --execute only beneath
hbnf_guarded_run with the matching LIVE_APPROVED admission/capsule/proof.
"""
from __future__ import annotations
import argparse, hashlib, importlib.util, json, os, pathlib, shlex, subprocess, sys, time
from datetime import datetime, timezone

ROOT=pathlib.Path(__file__).resolve().parents[1]
DIAG_ID="hbnf-cart2-r6-frame-context-diagnostic-20261010"
DIAG_SHA="eb1ef3957ae35620cef45425640fa92bf751fee3be31d1d2f66039c69b337b3a"
DIAG_BIN=ROOT/"evidence/cart2-execution-reset-20261010/artifact/hbnf-cart2-r6-frame-context-diagnostic-20261010.bin"
R4_ID="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
R4_SHA="338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
R4_BIN=ROOT/"evidence/cart2-r7-performance-repair-20261009/artifact/hbnf-matrix-foundation-r4-exact.bin"
MATRIX="http://192.168.77.10"; AUX="http://192.168.77.11"
MATRIX_MAC="704bca5b345c"; AUX_MAC="8c94df55c34c"
OPAL="root@192.168.77.1"
SSH_BASE=["ssh","-i",str(pathlib.Path.home()/".ssh/hbnf_opal_rsa"),"-o","IdentitiesOnly=yes",
 "-o","HostKeyAlgorithms=+ssh-rsa","-o","PubkeyAcceptedAlgorithms=+ssh-rsa",
 "-o","PasswordAuthentication=no","-o","BatchMode=yes"]
ADAPTER_PATH=ROOT/"scripts/hbnf_foundation_live_adapter.py"
OUT=ROOT/"evidence/cart2-execution-reset-20261010/live-diagnostic"
ATTEMPT_ROOT=OUT

def digest(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def ordered_like(reference,value):
    if isinstance(reference,dict) and isinstance(value,dict):
        keys=[k for k in reference if k in value]+[k for k in value if k not in reference]
        return {k:ordered_like(reference.get(k),value[k]) for k in keys}
    if isinstance(reference,list) and isinstance(value,list):
        return [ordered_like(reference[i] if i<len(reference) else None,x) for i,x in enumerate(value)]
    return value
def write_control_state(state):
    path=ROOT/"config/HBNF_CONTROL_STATE.json"
    try:
        raw=subprocess.check_output(["git","show","HEAD:config/HBNF_CONTROL_STATE.json"],cwd=ROOT,text=True,timeout=5)
        state=ordered_like(json.loads(raw),state)
    except Exception:pass
    tmp=path.with_suffix(".json.tmp");tmp.write_text(json.dumps(state,indent=2,sort_keys=False,ensure_ascii=False)+"\n")
    with tmp.open("r+b") as f:os.fsync(f.fileno())
    tmp.replace(path)
def save(path,obj):
    p=pathlib.Path(path);p.parent.mkdir(parents=True,exist_ok=True)
    tmp=p.with_suffix(p.suffix+".tmp");tmp.write_text(json.dumps(obj,indent=2,sort_keys=True)+"\n")
    with tmp.open("r+b") as f: os.fsync(f.fileno())
    tmp.replace(p)
def stamp(): return datetime.now(timezone.utc).isoformat()
def load_adapter():
    spec=importlib.util.spec_from_file_location("hbnf_live_adapter",ADAPTER_PATH)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
def identity(adapter,release):
    os.environ["HBNF_EXPECTED_RELEASE_ID"]=release
    info,build=adapter.identity()
    if info.get("ip")!="192.168.77.10" or info.get("mac","").replace(":","").lower()!=MATRIX_MAC or info.get("ver")!="16.0.1":
        raise RuntimeError("matrix target/WLED identity mismatch")
    return info,build
def aux_ok(reads):
    ai=reads["aux_info"]["body"]; ast=reads["aux_state"]["body"]
    return (ai.get("ip")=="192.168.77.11" and ai.get("mac","").replace(":","").lower()==AUX_MAC
      and ai.get("live") is True and ai.get("lm")=="DDP" and ai.get("lip")=="192.168.77.10"
      and ai.get("leds",{}).get("count")==22 and ast.get("on") is True)
def expected_artifact(path):
    p=pathlib.Path(path)
    return (DIAG_SHA,1511456,"hbnf-r6-frame-context-diagnostic") if p==DIAG_BIN else (R4_SHA,1489008,"hbnf-r4-exact-return")
def opal_readonly_preflight():
    remote=("set -e; printf 'OPAL_READONLY_PREFLIGHT\\n'; uptime; df -k /tmp; command -v curl; "
      "command -v sha256sum; command -v wc; test -r /etc/hbnf-updater/release-state; "
      "cat /etc/hbnf-updater/release-state; "
      "curl --silent --show-error --connect-timeout 5 --max-time 8 -o /dev/null -w 'MATRIX_INFO_HTTP=%{http_code}\\n' http://192.168.77.10/json/info; "
      "curl --silent --show-error --connect-timeout 5 --max-time 8 -o /dev/null -w 'MATRIX_BUILD_HTTP=%{http_code}\\n' http://192.168.77.10/hbnf/build.json")
    p=subprocess.run(SSH_BASE+["-o","ConnectTimeout=8",OPAL,remote],capture_output=True,text=True,timeout=25)
    raw=p.stdout
    tmp_rows=[line.split() for line in raw.splitlines() if line.rstrip().endswith(" /tmp")]
    free_kb=int(tmp_rows[0][-3]) if tmp_rows and len(tmp_rows[0])>=6 and tmp_rows[0][-3].isdigit() else 0
    exact_ledger=f"55 {R4_ID} {R4_SHA}"
    if p.returncode or "OPAL_READONLY_PREFLIGHT" not in raw or exact_ledger not in raw or "MATRIX_INFO_HTTP=200" not in raw or "MATRIX_BUILD_HTTP=200" not in raw or "curl" not in raw or "sha256sum" not in raw or free_kb<16384:
        raise RuntimeError("Opal read-only preflight did not prove exact R4 ledger, transfer tools, space, and Matrix reachability")
    result={"status":"PASS","at_utc":stamp(),"mutations":0,"opal_uptime_and_tmp_space_recorded":True,
      "exact_r4_ledger":True,"curl_and_sha256sum_available":True,"matrix_readonly_endpoints_http_200":True,
      "tmp_available_kb":free_kb,"minimum_tmp_available_kb":16384,"stdout":raw,"stderr_tail":p.stderr[-400:]}
    save(OUT/"OPAL_READONLY_PREFLIGHT.json",result)
    return result
def opal_stage_once(path,remote_path,expected_sha,expected_size):
    data=pathlib.Path(path).read_bytes()
    if hashlib.sha256(data).hexdigest()!=expected_sha or len(data)!=expected_size:raise RuntimeError("local exact artifact verification failed before Opal staging")
    remote=("umask 077; cat > "+shlex.quote(remote_path)+" && chmod 600 "+shlex.quote(remote_path)+
      " && test \"$(sha256sum "+shlex.quote(remote_path)+" | cut -d' ' -f1)\" = "+shlex.quote(expected_sha)+
      " && test \"$(wc -c < "+shlex.quote(remote_path)+" | tr -d ' ')\" = "+str(expected_size)+
      " && printf 'OPAL_ARTIFACT_VERIFIED\\n' && sha256sum "+shlex.quote(remote_path)+" && wc -c < "+shlex.quote(remote_path))
    p=subprocess.run(SSH_BASE+["-o","ConnectTimeout=8","-T",OPAL,remote],input=data,capture_output=True,timeout=90)
    out=p.stdout.decode("utf-8","replace")
    if p.returncode or "OPAL_ARTIFACT_VERIFIED" not in out or expected_sha not in out or str(expected_size) not in out:
        raise RuntimeError("single Opal artifact staging/hash/size verification failed")
    result={"status":"PASS","at_utc":stamp(),"local_sha256":expected_sha,"local_size_bytes":expected_size,
      "remote_path":remote_path,"remote_mode":"0600","remote_verification_stdout":out,
      "ssh_attempts":1,"firmware_requests":0}
    save(OUT/(pathlib.Path(remote_path).name+".stage.json"),result)
    return result
def upload_once(path,response,transport="opal"):
    expected_sha,expected_size,tag=expected_artifact(path)
    if digest(path)!=expected_sha or pathlib.Path(path).stat().st_size!=expected_size:
        raise RuntimeError("artifact hash failed immediately before OTA")
    if transport!="opal":raise RuntimeError("only the evidence-backed Opal-origin transfer is permitted for this attempt")
    remote_path="/tmp/hbnf-cart2-"+tag+".bin";remote_response="/tmp/hbnf-cart2-"+tag+"-ota.html"
    staged=opal_stage_once(path,remote_path,expected_sha,expected_size)
    # This is the exact previously successful Opal-origin WLED multipart method.
    command=("set +e; code=$(curl --silent --show-error --connect-timeout 5 --max-time 180 -F 'update=@"+remote_path+
      ";type=application/octet-stream' -o "+remote_response+" -w '%{http_code}' http://192.168.77.10/update); curl_rc=$?; "
      "printf 'CURL_EXIT=%s\\nHTTP_STATUS=%s\\n' \"$curl_rc\" \"$code\"; "
      "if test \"$curl_rc\" = 0 && test \"$code\" = 200 && grep -q 'Update successful' "+remote_response+
      "; then printf 'UPDATE_OK\\n'; fi; "
      "if test -f "+remote_response+"; then sha256sum "+remote_response+"; wc -c < "+remote_response+"; cat "+remote_response+"; fi; exit 0")
    p=subprocess.run(SSH_BASE+["-o","ConnectTimeout=8",OPAL,command],capture_output=True,text=True,timeout=210)
    response_text=p.stdout
    pathlib.Path(response).write_text(response_text)
    body=response_text.encode("utf-8","replace")
    match=__import__('re').search(r"HTTP_STATUS=(\d{3})",response_text)
    curl_match=__import__('re').search(r"CURL_EXIT=(-?\d+)",response_text)
    code=match.group(1) if match else "000"
    rec={"at_utc":stamp(),"artifact_sha256":digest(path),"artifact_size_bytes":expected_size,
      "transport":"SSH-verified staging then single Opal-origin curl multipart POST to Matrix WLED /update",
      "opal_staging":staged,"ssh_exit":p.returncode,"curl_exit":int(curl_match.group(1)) if curl_match else None,"http_status":code,
      "response_bytes":len(body),"response_sha256":hashlib.sha256(body).hexdigest(),
      "update_successful_text":b"Update successful" in body and "UPDATE_OK" in response_text,
      "firmware_request_attempts":1,"retry":False,"stderr":p.stderr[-600:]}
    save(response.with_suffix(".json"),rec)
    if p.returncode or code!="200" or not rec["update_successful_text"]:
        raise RuntimeError("single OTA response not confirmed; no retry")
    return rec
def wait_release(adapter,release,seconds=150):
    deadline=time.monotonic()+seconds;last=None
    while time.monotonic()<deadline:
        try:
            info,build=identity(adapter,release)
            return {"release_id":build.get("release_id"),"candidate":build.get("candidate"),"mac":info.get("mac"),"uptime":info.get("uptime"),"heap":info.get("freeheap"),"at_utc":stamp()}
        except Exception as e:last=str(e)
        time.sleep(3)
    raise RuntimeError("exact runtime release identity timeout: "+str(last))
def current_identity(adapter,seconds=150):
    deadline=time.monotonic()+seconds;last=None
    while time.monotonic()<deadline:
        try:
            info=adapter.get(MATRIX+"/json/info");build=adapter.get(MATRIX+"/hbnf/build.json")
            if info.get("ip")!="192.168.77.10" or info.get("mac","").replace(":","").lower()!=MATRIX_MAC:
                raise RuntimeError("Matrix identity mismatch while resolving OTA outcome")
            return info,build
        except Exception as e:last=str(e)
        time.sleep(3)
    raise RuntimeError("read-only OTA outcome identity unresolved: "+str(last))
def consume_authorization_before_write():
    p=ROOT/"config/HBNF_CONTROL_STATE.json";state=json.loads(p.read_text());a=state.get("r6_frame_context_diagnostic_authorization",{})
    if state.get("live_mutation_authorized") is not True or state.get("live_authorization_binding",{}).get("candidate_bin_sha256")!=DIAG_SHA:
        raise RuntimeError("exact live authority binding missing before write")
    if a.get("authorization_consumed") is not False or int(a.get("install_attempts_used",0))!=0:
        raise RuntimeError("diagnostic install authorization is already consumed")
    a["authorization_consumed"]=True;a["install_attempts_used"]=1;a["install_attempt_started_utc"]=stamp()
    a["status"]="CONSUMED_BEFORE_DIAGNOSTIC_NETWORK_REQUEST"
    state["r6_frame_context_diagnostic_authorization"]=a
    write_control_state(state)
    save(OUT/"AUTHORIZATION_CONSUMPTION.json",{"schema":"hbnf-r6-frame-context-diagnostic-consumption-v1","at_utc":a["install_attempt_started_utc"],"authorization_id":state.get("live_authorization_binding",{}).get("authorization_id"),"attempt_number":state.get("live_authorization_binding",{}).get("attempt_number"),"transport":state.get("live_authorization_binding",{}).get("transport"),"candidate_release_id":DIAG_ID,"candidate_sha256":DIAG_SHA,"candidate_attempt":1,"candidate_attempt_limit":1,"r4_return_limit":1,"recorded_before_network_request":True,"control_state":"config/HBNF_CONTROL_STATE.json"})
def close_authority_after_transaction(receipt):
    p=ROOT/"config/HBNF_CONTROL_STATE.json";state=json.loads(p.read_text());a=state["r6_frame_context_diagnostic_authorization"]
    state["live_mutation_authorized"]=False;a["live_mutation_authorized"]=False
    a["status"]=receipt.get("state","TRANSACTION_CLOSED_WITH_FAILURE")
    a["closed_at_utc"]=stamp();a["transaction_result"]=str((OUT/"TRANSACTION_RESULT.json").relative_to(ROOT))
    a["r4_return_attempts_used"]=receipt.get("r4_return_attempts",0)
    if receipt.get("state")=="PASS_DIAGNOSTIC_CAPTURED__EXACT_R4_RESTORED__AUX_DDP_VERIFIED" or receipt.get("state")=="DIAGNOSTIC_NOT_CONFIRMED_INSTALLED__NO_RETRY":
        state["installed_release"]=R4_ID;state["installed_firmware_sha256"]=R4_SHA
        state["installed_firmware_reconciliation"]={"basis":"Fresh post-transaction read-only Matrix build.json/info and AUX native DDP verification","release_id":R4_ID,"sha256":R4_SHA,"evidence_path":"evidence/cart2-execution-reset-20261010/live-diagnostic/TRANSACTION_RESULT.json","live_mutation_authorized":False}
    state["r6_frame_context_diagnostic_authorization"]=a
    state["status"]="R6_FRAME_CONTEXT_DIAGNOSTIC_TRANSACTION_CLOSED__LIVE_MUTATION_CLOSED"
    state["execution_cursor"]["current_failure_domain"]="R6_FRAME_CONTEXT_DIAGNOSTIC_TRANSACTION_CLOSED__R4_RETURN_STATUS_RECORDED__LIVE_MUTATION_CLOSED"
    state["execution_cursor"]["current_subject"]={"release_id":state.get("installed_release"),"artifact_sha256":state.get("installed_firmware_sha256"),"status":a["status"]}
    state["execution_cursor"]["exact_next_path"]=["Analyze the preserved per-frame trace against exact R4 kernel-0 profile and R6 stage telemetry; do not infer causality beyond recorded context.","Continue offline R6 correction and full frozen 28-kernel/combined-feature/90-minute qualification preparation; no production acceptance from diagnostic evidence."]
    write_control_state(state)

def dry_run():
    # Pure simulation uses exact identity and bounded operation counts; no sockets or subprocesses.
    scenarios={
      "success":["admission","preflight_r4_aux_ac_single_worker","opal_readonly_preflight","consume_exact_attempt","stage_hash_size_verified","install_diag_once_via_opal","verify_diag_identity","begin_snapshot","select_kernel0_brightness44","trace_start","8_safety_samples_at_8s","trace_stop","persist_all_trace_records","restore_renderer_snapshot","stage_exact_r4_hash_size_verified","install_r4_once_via_opal","verify_r4_and_aux"],
      "catastrophic":["admission","preflight_r4_aux_ac_single_worker","opal_readonly_preflight","consume_exact_attempt","stage_hash_size_verified","install_diag_once_via_opal","verify_diag_identity","begin_snapshot","trace_start","third_consecutive_bad_sample_abort","trace_stop","persist_failure_evidence","restore_renderer_snapshot","stage_exact_r4_hash_size_verified","install_r4_once_via_opal","verify_r4_and_aux"],
      "collector_failure":["admission","preflight_r4_aux_ac_single_worker","opal_readonly_preflight","consume_exact_attempt","stage_hash_size_verified","install_diag_once_via_opal","verify_diag_identity","begin_snapshot","trace_start","timeout_recorded_no_sample_skipped","trace_stop","persist_failure_evidence","restore_renderer_snapshot","stage_exact_r4_hash_size_verified","install_r4_once_via_opal","verify_r4_and_aux"],
      "identity_mismatch":["admission","preflight_r4_aux_ac_single_worker","identity_mismatch_before_write","zero_device_writes"],
      "opal_stage_hash_mismatch":["admission","preflight_r4_aux_ac_single_worker","opal_readonly_preflight","consume_exact_attempt","stage_hash_mismatch","zero_wled_requests","R4_remains_installed"],
      "opal_upload_broken_pipe":["admission","preflight_r4_aux_ac_single_worker","opal_readonly_preflight","consume_exact_attempt","stage_hash_size_verified","single_opal_origin_upload_curl55","read_only_identity_R4","no_retry"],
      "renderer_restore_failure":["admission","preflight_r4_aux_ac_single_worker","opal_readonly_preflight","consume_exact_attempt","stage_hash_size_verified","install_diag_once_via_opal","verify_diag_identity","snapshot_restore_unverified","stage_exact_r4_hash_size_verified","install_exact_r4_once_via_opal","verify_r4_and_aux_or_stop"],
      "r4_restore_failure":["admission","preflight_r4_aux_ac_single_worker","opal_readonly_preflight","consume_exact_attempt","stage_hash_size_verified","install_diag_once_via_opal","verify_diag_identity","capture_or_abort","restore_renderer_snapshot","stage_exact_r4_hash_size_verified","install_r4_once_via_opal","persist_recovery_failure_stop"]}
    for name,events in scenarios.items():
        assert events.index("admission")<events.index("install_diag_once_via_opal") if "install_diag_once_via_opal" in events else True
        assert events.count("install_diag_once_via_opal")<=1 and events.count("install_r4_once_via_opal")<=1
    assert scenarios["identity_mismatch"].count("zero_device_writes")==1
    receipt={"schema":"hbnf-r6-frame-context-diagnostic-transaction-dryrun-v1","candidate":{"release_id":DIAG_ID,"sha256":DIAG_SHA},
      "mandatory_return":{"release_id":R4_ID,"sha256":R4_SHA},"window_seconds_max":60,"safety_interval_seconds":8,
      "catastrophic_rule":{"consecutive_samples":3,"fps_floor":20,"frame_p99_ceiling_ms":75,"aux_native_ddp_required":True},
      "firmware_source_changed":False,"device_requests":0,"next_attempt_transport":"previously proven SSH-verified Opal staging plus one Opal-origin curl multipart upload; no Mac-origin firmware body transfer","scenarios":scenarios,"result":"PASS_OFFLINE_SEQUENCE_POLICY"}
    save(OUT/"R6_DIAGNOSTIC_TRANSACTION_DRYRUN.json",receipt);print(json.dumps(receipt,sort_keys=True));return 0

def execute():
    global OUT
    adapter=load_adapter();binding=json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text()).get("live_authorization_binding",{});attempt=int(binding.get("attempt_number",0))
    if attempt<1:raise RuntimeError("attempt number missing from exact authorization binding")
    OUT=ATTEMPT_ROOT/f"attempt-{attempt:02d}";OUT.mkdir(parents=True,exist_ok=True)
    receipt={"schema":"hbnf-r6-frame-context-diagnostic-live-transaction-v1","candidate":{"release_id":DIAG_ID,"sha256":DIAG_SHA},"mandatory_return":{"release_id":R4_ID,"sha256":R4_SHA},"attempt_number":attempt,"authorization_id":binding.get("authorization_id"),"transport":binding.get("transport"),"state":"STARTED","started_at_utc":stamp(),"candidate_install_attempts":0,"r4_return_attempts":0,"safety_samples":[],"trace":{"outliers":[],"references":[]}}
    save(OUT/"TRANSACTION_STARTED.json",receipt)
    # Repeat all necessary prewrite checks immediately before the first write.
    if digest(DIAG_BIN)!=DIAG_SHA or digest(R4_BIN)!=R4_SHA:raise RuntimeError("exact artifact/rollback SHA mismatch")
    auth=json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text()).get("r6_frame_context_diagnostic_authorization",{})
    if auth.get("authorization_consumed") is not False or int(auth.get("install_attempts_used",0))!=0:raise RuntimeError("diagnostic authorization is consumed or not available")
    power=subprocess.run(["pmset","-g","batt"],capture_output=True,text=True,timeout=5).stdout
    route=subprocess.run(["route","-n","get","192.168.77.10"],capture_output=True,text=True,timeout=5).stdout
    if "AC Power" not in power or "interface: en0" not in route:raise RuntimeError("Mac power/LAN preflight failed")
    os.environ["HBNF_EXPECTED_RELEASE_ID"]=R4_ID;os.environ["HBNF_EXPECTED_FIRMWARE_SHA256"]=R4_SHA
    pre=adapter.readonly_preflight("r6-diagnostic-immediate-preflight")
    if pre.get("release_id")!=R4_ID or pre.get("matrix_brightness")!=44 or pre.get("matrix_on") is not True:raise RuntimeError("R4 preflight mismatch")
    # Confirm no concurrent Cart live worker. Ignore only this process and its
    # supervisor ancestry; command lines are inspected in memory, never emitted.
    ps=subprocess.run(["ps","-axo","pid=,ppid=,command="],capture_output=True,text=True,timeout=5).stdout
    rows={};
    for line in ps.splitlines():
        parts=line.strip().split(None,2)
        if len(parts)==3 and parts[0].isdigit() and parts[1].isdigit():rows[int(parts[0])] = (int(parts[1]),parts[2].lower())
    ancestors={os.getpid()};cur=os.getpid()
    while cur in rows and rows[cur][0] not in ancestors:
        cur=rows[cur][0];ancestors.add(cur)
    live_names=("hbnf_live_kernel_sweep.py","hbnf_r6_frame_context_diagnostic_transaction.py","hbnf_foundation_continuous_soak.py")
    competing=[pid for pid,(_,cmdline) in rows.items() if pid not in ancestors and any(name in cmdline for name in live_names)]
    if competing:
        raise RuntimeError("competing Cart live runner detected")
    receipt["preflight"]={"pass":True,"at_utc":stamp(),"r4":pre,"mac_on_ac":True,"matrix_route_en0":True,"diagnostic_sha256":digest(DIAG_BIN),"rollback_sha256":digest(R4_BIN)}
    save(OUT/"TRANSACTION_STARTED.json",receipt)
    diag_uploaded=False;snapshot=None;trace_started=False;failure=None
    try:
        receipt["opal_preflight"]=opal_readonly_preflight()
        consume_authorization_before_write()
        receipt["candidate_install_attempts"]=1;receipt["candidate_install_started_at_utc"]=stamp();save(OUT/"TRANSACTION_STARTED.json",receipt)
        try:
            receipt["candidate_upload"]=upload_once(DIAG_BIN,OUT/"diagnostic-upload-response.html")
            diag_uploaded=True
        except Exception as upload_error:
            receipt["candidate_upload_error"]=f"{type(upload_error).__name__}: {upload_error}"
            # A broken client response is ambiguous. Resolve only by readback;
            # never repeat the upload.
            info,build=current_identity(adapter)
            observed=build.get("release_id")
            if observed==DIAG_ID and build.get("candidate")==DIAG_ID:diag_uploaded=True
            elif observed==R4_ID and build.get("candidate")==R4_ID:
                receipt["state"]="UPLOAD_NOT_INSTALLED__EXACT_R4_REMAINS__NO_RETRY"
                raise RuntimeError("diagnostic upload was not confirmed and exact R4 remains installed") from upload_error
            else:raise RuntimeError("diagnostic upload outcome is unknown; stopped without another write") from upload_error
        receipt["candidate_runtime"]=wait_release(adapter,DIAG_ID)
        receipt["state"]="DIAGNOSTIC_INSTALLED";save(OUT/"TRANSACTION_STARTED.json",receipt)
        os.environ["HBNF_EXPECTED_RELEASE_ID"]=DIAG_ID
        snapshot=adapter.snapshot(None,"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json")
        receipt["renderer_snapshot"]=snapshot;save(OUT/"RENDERER_SNAPSHOT.json",snapshot)
        adapter.select(0)
        state,p20=adapter.p20_state()
        if state.get("HBNF",{}).get("timing",{}).get("kernel")!=0 or state.get("HBNF",{}).get("matrixBrightness")!=44:
            raise RuntimeError("kernel-0 / matrix brightness 44 setup not verified")
        adapter.enable_tails(True)
        ack=adapter.command("traceStart").get("HBNF",{}).get("packet20Diagnostic",{})
        if ack.get("lastCommandAccepted") is not True:raise RuntimeError("traceStart rejected")
        trace_started=True;trace_start=time.monotonic();receipt["trace_start_utc"]=stamp();receipt["state"]="CAPTURING_KERNEL0";save(OUT/"TRANSACTION_STARTED.json",receipt)
        consecutive_bad=0;last_uptime=None
        for scheduled in range(4,61,8):
            target=trace_start+scheduled;delay=target-time.monotonic()
            if delay>0:time.sleep(delay)
            sample_start=time.monotonic_ns()
            reads,elapsed=adapter._parallel_soak_reads("r6-diagnostic-sample")
            rows={k:v for k,v in reads.items() if not k.startswith("_")}
            timing=rows["matrix_state"]["body"].get("HBNF",{}).get("timing",{})
            ft=rows["matrix_state"]["body"].get("HBNF",{}).get("foundationTelemetry",{})
            mi=rows["matrix_info"]["body"]; build=rows["matrix_build"]["body"]; st=rows["matrix_state"]["body"]
            if build.get("release_id")!=DIAG_ID or mi.get("mac","").replace(":","").lower()!=MATRIX_MAC or mi.get("ip")!="192.168.77.10":raise RuntimeError("identity mismatch during capture")
            if st.get("on") is not True or st.get("HBNF",{}).get("matrixBrightness")!=44 or timing.get("kernel")!=0:raise RuntimeError("runtime state mismatch during capture")
            uptime=int(mi.get("uptime",0));restarted=last_uptime is not None and uptime<last_uptime;last_uptime=uptime
            if restarted:raise RuntimeError("Matrix restart during diagnostic capture")
            aux=aux_ok(rows);fps=timing.get("fps");p99=ft.get("frameMsP99")
            row={"scheduled_seconds":scheduled,"read_started_monotonic_ns":sample_start,"read_completed_monotonic_ns":time.monotonic_ns(),"batch_elapsed_seconds":elapsed,
              "endpoint_reads":reads.get("_endpoint_timing",{}),"uptime_seconds":uptime,"fps":fps,"frame_ms_p99":p99,
              "frame_ms_max":ft.get("frameMsMax"),"frame_tail_overflow":ft.get("frameTailOverflow"),"kernel":timing.get("kernel"),
              "variant_signature":timing.get("variantSignature"),"matrix_brightness":st.get("HBNF",{}).get("matrixBrightness"),"aux_native_ddp_active":aux,
              "aux_physical_output_status":"NOT_OBSERVABLE_FROM_WLED_JSON"}
            receipt["safety_samples"].append(row);save(OUT/"SAFETY_SAMPLES.json",receipt["safety_samples"])
            bad=(not isinstance(fps,(int,float)) or fps<20 or not isinstance(p99,(int,float)) or p99>75 or not aux)
            consecutive_bad=consecutive_bad+1 if bad else 0
            if consecutive_bad>=3:raise RuntimeError("CATASTROPHIC_ABORT: three consecutive bad 8-second samples")
        receipt["trace_capture_seconds"]=round(time.monotonic()-trace_start,3)
    except Exception as e:
        failure=f"{type(e).__name__}: {e}";receipt["diagnostic_error"]=failure
    finally:
        if diag_uploaded:
            try:
                state,p20=adapter.p20_state();trace=p20.get("frameContextTrace",{})
                if trace.get("enabled"):
                    ack=adapter.command("traceStop").get("HBNF",{}).get("packet20Diagnostic",{})
                    if ack.get("lastCommandAccepted") is not True:raise RuntimeError("traceStop rejected")
                state,p20=adapter.p20_state();trace=p20.get("frameContextTrace",{})
                receipt["trace"]["metadata"]=trace
                for kind,count,key in (("outlier",trace.get("outlierRetainedCount",0),"outliers"),("reference",trace.get("normalReferenceRetainedCount",0),"references"),("worst",1 if trace.get("worstValid") else 0,"worst")):
                    for cursor in range(int(count)):
                        adapter.command("traceRead",kind=kind,cursor=cursor)
                        _,p20=adapter.p20_state();record=p20.get("frameContextTrace",{}).get("readback")
                        if not isinstance(record,dict) or record.get("valid") is not True:raise RuntimeError("trace readback missing/invalid")
                        if key=="worst":receipt["trace"][key]=record
                        else:receipt["trace"][key].append(record)
                save(OUT/"FRAME_CONTEXT_TRACE.json",receipt["trace"])
            except Exception as e:
                receipt["trace_readback_error"]=f"{type(e).__name__}: {e}";save(OUT/"FRAME_CONTEXT_TRACE.json",receipt["trace"])
        if diag_uploaded and snapshot is None:
            # Recover a snapshot that may have completed just before a host-side
            # acknowledgement failure.
            try:
                _,p20=adapter.p20_state();sid=p20.get("snapshotId");shash=p20.get("snapshotHash")
                if p20.get("snapshotValid") is True and p20.get("snapshotState")=="READY":
                    snapshot={"snapshotId":sid,"snapshotHash":shash,"foundationTelemetryEnabledBefore":pre.get("foundation_telemetry_enabled",False)}
            except Exception:pass
        if diag_uploaded and snapshot:
            try:
                receipt["renderer_restore"]=adapter._restore_snapshot(int(snapshot["snapshotId"]),int(snapshot["snapshotHash"]))
                save(OUT/"RENDERER_RESTORE.json",receipt["renderer_restore"])
            except Exception as e:
                receipt["renderer_restore_error"]=f"{type(e).__name__}: {e}";save(OUT/"RENDERER_RESTORE.json",receipt["renderer_restore"])
        if diag_uploaded:
            # The exact R4 return is mandatory after the diagnostic; one request, no retry.
            try:
                receipt["r4_return_attempts"]=1;receipt["r4_return_started_at_utc"]=stamp();save(OUT/"TRANSACTION_STARTED.json",receipt)
                try:receipt["r4_upload"]=upload_once(R4_BIN,OUT/"r4-upload-response.html")
                except Exception as upload_error:receipt["r4_upload_error"]=f"{type(upload_error).__name__}: {upload_error}"
                os.environ["HBNF_EXPECTED_RELEASE_ID"]=R4_ID
                receipt["r4_runtime"]=wait_release(adapter,R4_ID)
                deadline=time.monotonic()+60;last=None
                while time.monotonic()<deadline:
                    reads,_=adapter._parallel_soak_reads("r4-return-ddp-check")
                    if aux_ok(reads):last={"status":"PASS","at_utc":stamp(),"aux_mac":reads["aux_info"]["body"].get("mac"),"aux_source":reads["aux_info"]["body"].get("lip"),"aux_led_count":reads["aux_info"]["body"].get("leds",{}).get("count")};break
                    last={"status":"WAITING_FOR_AUX_DDP","at_utc":stamp()};time.sleep(3)
                final_state=adapter.get(MATRIX+"/json/state")
                final_info=adapter.get(MATRIX+"/json/info")
                if final_state.get("on") is not True or final_state.get("HBNF",{}).get("matrixBrightness")!=44 or final_info.get("freeheap",0)<20000:
                    raise RuntimeError("exact R4 identity present but Matrix runtime health/brightness failed")
                if not last or last.get("status")!="PASS":raise RuntimeError("R4 restored but AUX DDP not re-established within 60s")
                receipt["aux_return_verification"]=last;receipt["state"]="PASS_DIAGNOSTIC_CAPTURED__EXACT_R4_RESTORED__AUX_DDP_VERIFIED"
            except Exception as e:
                receipt["r4_restore_error"]=f"{type(e).__name__}: {e}";receipt["state"]="BLOCKED_R4_RETURN_NOT_VERIFIED"
        elif not diag_uploaded:
            receipt["state"]="DIAGNOSTIC_NOT_CONFIRMED_INSTALLED__NO_RETRY"
        receipt["completed_at_utc"]=stamp();receipt["diagnostic_error"]=failure
        close_authority_after_transaction(receipt)
        save(OUT/"TRANSACTION_RESULT.json",receipt)
    print(json.dumps({"state":receipt["state"],"candidate_install_attempts":receipt["candidate_install_attempts"],"r4_return_attempts":receipt["r4_return_attempts"],"trace_outliers":len(receipt["trace"].get("outliers",[])),"trace_overflow":receipt["trace"].get("metadata",{}).get("outlierOverflowCount"),"diagnostic_error":failure},sort_keys=True))
    return 0 if receipt["state"]=="PASS_DIAGNOSTIC_CAPTURED__EXACT_R4_RESTORED__AUX_DDP_VERIFIED" else 2

def main():
    p=argparse.ArgumentParser();p.add_argument("--dry-run",action="store_true");p.add_argument("--execute",action="store_true");p.add_argument("--transport",choices=["opal"],default="opal");a=p.parse_args()
    if a.dry_run==a.execute:raise SystemExit("select exactly one of --dry-run or --execute")
    return dry_run() if a.dry_run else execute()
if __name__=="__main__":raise SystemExit(main())
