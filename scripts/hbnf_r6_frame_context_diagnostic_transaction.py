#!/usr/bin/env python3
"""One exact R6 compositor-timing diagnostic -> renderer restore -> exact R4 return.

No retries, restarts, or alternate artifacts. Run --execute only beneath
hbnf_guarded_run with the matching LIVE_APPROVED admission/capsule/proof.
"""
from __future__ import annotations
import argparse, hashlib, importlib.util, json, math, os, pathlib, shlex, subprocess, sys, time
from datetime import datetime, timezone

ROOT=pathlib.Path(__file__).resolve().parents[1]
DIAG_ID="hbnf-cart2-phase2-vibe-compositor-timing-diagnostic-20261011"
DIAG_SHA="e2e7d2d99e91715509e655117bdbc595b238782706e18ab88c47e64539ed705e"
DIAG_SIZE=1499344
DIAG_BIN=ROOT/"evidence/cart2-r6-compositor-timing-diagnostic-20261011/artifact/hbnf-cart2-phase2-vibe-compositor-timing-diagnostic-20261011.bin"
AUTH_KEY="r6_compositor_timing_diagnostic_authorization"
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
OUT=ROOT/"evidence/cart2-r6-compositor-timing-diagnostic-20261011/live-diagnostic"
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
def load_brightness_transaction():
    path=ROOT/"scripts/hbnf_r6_audio_cache_live_transaction.py"
    spec=importlib.util.spec_from_file_location("hbnf_r6_brightness_transaction",path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
def identity(adapter,release):
    os.environ["HBNF_EXPECTED_RELEASE_ID"]=release
    # The pinned adapter captures EXPECTED at import time. Set the module's
    # contract explicitly before its identity/parallel-reader helpers run.
    adapter.EXPECTED=release
    info,build=adapter.identity()
    if info.get("ip")!="192.168.77.10" or info.get("mac","").replace(":","").lower()!=MATRIX_MAC or info.get("ver")!="16.0.1":
        raise RuntimeError("matrix target/WLED identity mismatch")
    if build.get("release_id")!=release or build.get("candidate")!=release:
        raise RuntimeError(f"exact runtime release identity mismatch: expected {release}; got release={build.get('release_id')} candidate={build.get('candidate')}")
    return info,build
def response_body(value):
    # Current pinned adapter returns flattened JSON bodies; accept its older
    # {body, sha256} wrapper shape too, without mistaking a device JSON field.
    if isinstance(value,dict) and "body" in value and "sha256" in value:
        return value["body"]
    return value
def aux_ok(reads):
    ai=response_body(reads["aux_info"]); ast=response_body(reads["aux_state"])
    return (ai.get("ip")=="192.168.77.11" and ai.get("mac","").replace(":","").lower()==AUX_MAC
      and ai.get("live") is True and ai.get("lm")=="DDP" and ai.get("lip")=="192.168.77.10"
      and ai.get("leds",{}).get("count")==22 and ast.get("on") is True)
def aux_summary(reads):
    ai=response_body(reads["aux_info"])
    return {"aux_mac":ai.get("mac"),"aux_source":ai.get("lip"),"aux_led_count":ai.get("leds",{}).get("count")}
def expected_artifact(path):
    p=pathlib.Path(path).resolve()
    if p==DIAG_BIN.resolve():return (DIAG_SHA,DIAG_SIZE,"hbnf-r6-compositor-timing-diagnostic")
    if p==R4_BIN.resolve():return (R4_SHA,1489008,"hbnf-r4-exact-return")
    raise RuntimeError("unrecognized firmware artifact path; no upload permitted")

COMPOSITOR_METRICS=("kernelMsAvg","kernelMsP95","kernelWithoutCompositorMsAvg",
    "kernelWithoutCompositorMsP95","kernelWithoutCompositorMsP99","vibeCompositorMsAvg",
    "vibeCompositorMsP95","vibeCompositorMsP99","audioMsAvg","audioMsP95",
    "paletteMsAvg","paletteMsP95")

def compositor_timing_sample(telemetry):
    """Require exact diagnostic component fields; never infer missing measurements."""
    if not isinstance(telemetry,dict) or telemetry.get("enabled") is not True:
        raise RuntimeError("compositor-timing-telemetry-disabled-or-missing")
    count=telemetry.get("sampleCount")
    if type(count) is not int or count<=0:
        raise RuntimeError("compositor-timing-telemetry-has-no-samples")
    values={key:telemetry.get(key) for key in COMPOSITOR_METRICS}
    missing=[key for key,value in values.items() if type(value) not in (int,float)]
    if missing:
        raise RuntimeError("compositor-timing-metrics-missing-or-invalid:"+",".join(missing))
    values["sampleCount"]=count
    values["frameTailOverflow"]=telemetry.get("frameTailOverflow")
    values["frameTailBinResolutionUs"]=telemetry.get("frameTailBinResolutionUs")
    return values

def diagnostic_runtime_context(state, build):
    h=state.get("HBNF",{}) if isinstance(state,dict) else {}
    timing=h.get("timing",{}) if isinstance(h,dict) else {}
    variant=timing.get("variantSignature")
    if variant is None:variant=h.get("variantSignature")
    audio=h.get("audio",{}) if isinstance(h.get("audio",{}),dict) else {}
    return {
      "release_id":build.get("release_id"),"matrix_on":state.get("on"),
      "kernel":timing.get("kernel"),"matrix_brightness":h.get("matrixBrightness"),
      "variant_signature":variant,"vibe":h.get("vibe"),"audio_response":h.get("audioResponse"),
      "motion":h.get("motion"),"palette":h.get("palette"),"scene":h.get("scene"),
      "overlay_id":h.get("overlayId"),"active_vibe":h.get("activeVibe"),
      "audio_input":{k:audio.get(k) for k in ("bass","mid","treble","volume","peak") if k in audio},
      "fps":timing.get("fps"),"whole_frame_us":timing.get("wholeFrameUs")}

def diagnostic_control_signature(context):
    keys=("release_id","matrix_on","kernel","matrix_brightness","variant_signature",
          "vibe","audio_response","motion","palette","scene","overlay_id")
    signature={key:context.get(key) for key in keys}
    if any(signature.get(key) is None for key in keys if key!="overlay_id"):
        raise RuntimeError("matched diagnostic control context is incomplete")
    return signature

def verify_matched_control_signature(expected, current):
    actual=diagnostic_control_signature(current)
    if actual!=expected:
        raise RuntimeError("diagnostic runtime controls or variant changed between tails-off/on samples")
    return actual

def complete_timing_capture(samples,candidate_identity_verified,failure,tails_off_samples):
    """Require three matched tails-off polls and all eight tails-on samples."""
    return (candidate_identity_verified and failure is None and len(tails_off_samples)==3 and len(samples)==8
        and all(isinstance(sample,dict)
            and all(type(sample.get(key)) in (int,float) for key in COMPOSITOR_METRICS)
            for sample in samples)
        and all(isinstance(sample,dict) and sample.get("instrumentation")=="tails_off"
            for sample in tails_off_samples))

def diagnostic_sample_decision(fps,p99,max_frame_ms,aux_active):
    """Record qualification failures; stop only when diagnostic safety is lost."""
    performance_failures=[]
    if type(fps) not in (int,float) or not math.isfinite(fps) or fps<20:
        performance_failures.append("fps_below_20_or_missing")
    if type(p99) not in (int,float) or not math.isfinite(p99) or p99>75:
        performance_failures.append("frame_p99_above_75_or_missing")
    stop_reasons=[]
    if type(max_frame_ms) not in (int,float) or not math.isfinite(max_frame_ms):
        stop_reasons.append("frame_max_missing_or_invalid")
    elif max_frame_ms>=1000:
        stop_reasons.append("steady_state_frame_interval_at_least_1000ms")
    if aux_active is not True:
        stop_reasons.append("aux_native_ddp_inactive")
    return {"performance_gate_pass":not performance_failures,
            "performance_gate_failure_reasons":performance_failures,
            "stop":bool(stop_reasons),"stop_reasons":stop_reasons}

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
    expected_sha,expected_size,_=expected_artifact(path)
    if digest(path)!=expected_sha or pathlib.Path(path).stat().st_size!=expected_size:
        raise RuntimeError("artifact hash failed immediately before OTA")
    if transport!="opal":raise RuntimeError("only the evidence-backed Opal-origin transfer is permitted for this attempt")
    remote_path="/tmp/"+pathlib.Path(path).name;remote_response=remote_path+"-ota.html"
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
def exact_recovery_release(info,build):
    if info.get("ip")!="192.168.77.10" or info.get("mac","").replace(":","").lower()!=MATRIX_MAC or info.get("ver")!="16.0.1":
        raise RuntimeError("Matrix recovery target identity/WLED mismatch")
    release=build.get("release_id");candidate=build.get("candidate")
    if release!=candidate or release not in (DIAG_ID,R4_ID):
        raise RuntimeError(f"recovery readback is neither exact diagnostic nor exact R4: release={release} candidate={candidate}")
    return release
def consume_authorization_before_write():
    p=ROOT/"config/HBNF_CONTROL_STATE.json";state=json.loads(p.read_text());a=state.get(AUTH_KEY,{})
    binding=state.get("live_authorization_binding",{})
    if (state.get("live_mutation_authorized") is not True
        or binding.get("candidate_release_id")!=DIAG_ID
        or binding.get("candidate_bin_sha256")!=DIAG_SHA
        or binding.get("rollback_bin_sha256")!=R4_SHA
        or str(binding.get("matrix_mac","" )).replace(":","").lower()!=MATRIX_MAC):
        raise RuntimeError("exact live authority binding missing before write")
    if (a.get("candidate_release_id")!=DIAG_ID or a.get("candidate_sha256")!=DIAG_SHA
        or a.get("mandatory_return_sha256")!=R4_SHA
        or a.get("authorization_consumed") is not False or int(a.get("install_attempts_used",0))!=0):
        raise RuntimeError("diagnostic install authorization is already consumed")
    a["authorization_consumed"]=True;a["install_attempts_used"]=1;a["install_attempt_started_utc"]=stamp()
    a["status"]="CONSUMED_BEFORE_DIAGNOSTIC_NETWORK_REQUEST"
    state[AUTH_KEY]=a
    write_control_state(state)
    save(OUT/"AUTHORIZATION_CONSUMPTION.json",{"schema":"hbnf-r6-compositor-timing-diagnostic-consumption-v1","at_utc":a["install_attempt_started_utc"],"authorization_id":state.get("live_authorization_binding",{}).get("authorization_id"),"attempt_number":state.get("live_authorization_binding",{}).get("attempt_number"),"transport":state.get("live_authorization_binding",{}).get("transport"),"candidate_release_id":DIAG_ID,"candidate_sha256":DIAG_SHA,"candidate_attempt":1,"candidate_attempt_limit":1,"r4_return_limit":1,"recorded_before_network_request":True,"control_state":"config/HBNF_CONTROL_STATE.json"})
def close_authority_after_transaction(receipt):
    p=ROOT/"config/HBNF_CONTROL_STATE.json";state=json.loads(p.read_text());a=state[AUTH_KEY]
    state["live_mutation_authorized"]=False;a["live_mutation_authorized"]=False
    a["status"]=receipt.get("state","TRANSACTION_CLOSED_WITH_FAILURE")
    a["closed_at_utc"]=stamp();a["transaction_result"]=str((OUT/"TRANSACTION_RESULT.json").relative_to(ROOT))
    a["r4_return_attempts_used"]=receipt.get("r4_return_attempts",0)
    a["recovery_attempts_used"]=receipt.get("r4_return_attempts",0)
    exact_r4_verified=(receipt.get("r4_runtime",{}).get("release_id")==R4_ID and receipt.get("aux_return_verification",{}).get("status")=="PASS")
    if exact_r4_verified or receipt.get("state")=="DIAGNOSTIC_NOT_CONFIRMED_INSTALLED__NO_RETRY":
        state["installed_release"]=R4_ID;state["installed_firmware_sha256"]=R4_SHA
        state["installed_firmware_reconciliation"]={"basis":"Fresh post-transaction read-only Matrix build.json/info and AUX native DDP verification","release_id":R4_ID,"sha256":R4_SHA,"evidence_path":str((OUT/"TRANSACTION_RESULT.json").relative_to(ROOT)),"live_mutation_authorized":False}
    state[AUTH_KEY]=a
    state["status"]="R6_COMPOSITOR_TIMING_DIAGNOSTIC_TRANSACTION_CLOSED__LIVE_MUTATION_CLOSED"
    state["execution_cursor"]["current_failure_domain"]="R6_COMPOSITOR_TIMING_DIAGNOSTIC_CLOSED__R4_RETURN_STATUS_RECORDED__LIVE_MUTATION_CLOSED"
    state["execution_cursor"]["current_subject"]={"release_id":state.get("installed_release"),"artifact_sha256":state.get("installed_firmware_sha256"),"status":a["status"]}
    state["execution_cursor"]["exact_next_path"]=["Analyze the hash-bound compositor timing samples to determine whether the Vibe compositor explains the saturated kernel-0 tail; preserve frame-context telemetry and observer-load limits.","Correct the demonstrated performance cause offline, then run the frozen full 28-kernel/combined-feature/90-minute qualification and exact R4 recovery before any acceptance claim."]
    write_control_state(state)

def dry_run():
    # Pure simulation uses exact identity and bounded operation counts; no sockets or subprocesses.
    scenarios={
      "success":["admission","preflight_r4_aux_ac_single_worker","opal_readonly_preflight","capture_r4_hbnf_settings","consume_exact_attempt","stage_hash_size_verified","install_diag_once_via_opal","verify_diag_identity","begin_snapshot","select_kernel0","set_brightness44_with_existing_exact_settings_transaction","capture_matched_tails_off_samples","enable_builtin_timing_tails","capture_component_samples_at_8s","persist_metrics_and_context","restore_renderer_snapshot","restore_captured_hbnf_settings","stage_exact_r4_hash_size_verified","install_r4_once_via_opal","verify_r4_and_aux_and_original_brightness"],
      "performance_gate_failure":["admission","preflight_r4_aux_ac_single_worker","opal_readonly_preflight","capture_r4_hbnf_settings","consume_exact_attempt","stage_hash_size_verified","install_diag_once_via_opal","verify_diag_identity","begin_snapshot","select_kernel0","set_brightness44_with_existing_exact_settings_transaction","capture_matched_tails_off_samples","enable_builtin_timing_tails","record_fps_p99_failure","capture_remaining_component_samples","persist_gate_failure_and_component_metrics","restore_renderer_snapshot","restore_captured_hbnf_settings","stage_exact_r4_hash_size_verified","install_r4_once_via_opal","verify_r4_and_aux_and_original_brightness"],
      "catastrophic":["admission","preflight_r4_aux_ac_single_worker","opal_readonly_preflight","capture_r4_hbnf_settings","consume_exact_attempt","stage_hash_size_verified","install_diag_once_via_opal","verify_diag_identity","begin_snapshot","select_kernel0","set_brightness44_with_existing_exact_settings_transaction","capture_matched_tails_off_samples","enable_builtin_timing_tails","unsafe_frame_or_aux_loss_stop","persist_metrics_and_failure","restore_renderer_snapshot","restore_captured_hbnf_settings","stage_exact_r4_hash_size_verified","install_r4_once_via_opal","verify_r4_and_aux_and_original_brightness"],
      "collector_failure":["admission","preflight_r4_aux_ac_single_worker","opal_readonly_preflight","capture_r4_hbnf_settings","consume_exact_attempt","stage_hash_size_verified","install_diag_once_via_opal","verify_diag_identity","begin_snapshot","select_kernel0","set_brightness44_with_existing_exact_settings_transaction","capture_matched_tails_off_samples","enable_builtin_timing_tails","timeout_recorded_no_sample_skipped","persist_failure_evidence","restore_renderer_snapshot","restore_captured_hbnf_settings","stage_exact_r4_hash_size_verified","install_r4_once_via_opal","verify_r4_and_aux_and_original_brightness"],
      "identity_mismatch":["admission","preflight_r4_aux_ac_single_worker","identity_mismatch_before_write","zero_device_writes"],
      "http200_identity_mismatch_r4_still_installed":["admission","preflight_r4_aux_ac_single_worker","consume_exact_attempt","single_diag_upload_http200","exact_candidate_identity_wait_fails","no_capture_or_renderer_commands_without_exact_candidate_identity","read_only_recovery_identity_R4","no_unnecessary_r4_upload","verify_matrix_and_aux","close_inconclusive_r4_verified"],
      "http200_identity_unknown":["admission","preflight_r4_aux_ac_single_worker","consume_exact_attempt","single_diag_upload_http200","exact_candidate_identity_wait_fails","no_capture_or_renderer_commands_without_exact_candidate_identity","recovery_identity_unavailable","zero_recovery_writes","close_live_authority_and_report_blocker"],
      "opal_stage_hash_mismatch":["admission","preflight_r4_aux_ac_single_worker","opal_readonly_preflight","consume_exact_attempt","stage_hash_mismatch","zero_wled_requests","R4_remains_installed"],
      "opal_upload_broken_pipe":["admission","preflight_r4_aux_ac_single_worker","opal_readonly_preflight","consume_exact_attempt","stage_hash_size_verified","single_opal_origin_upload_curl55","read_only_identity_R4","no_retry"],
      "renderer_restore_failure":["admission","preflight_r4_aux_ac_single_worker","opal_readonly_preflight","consume_exact_attempt","stage_hash_size_verified","install_diag_once_via_opal","verify_diag_identity","snapshot_restore_unverified","stage_exact_r4_hash_size_verified","install_exact_r4_once_via_opal","verify_r4_and_aux_or_stop"],
      "r4_restore_failure":["admission","preflight_r4_aux_ac_single_worker","opal_readonly_preflight","consume_exact_attempt","stage_hash_size_verified","install_diag_once_via_opal","verify_diag_identity","capture_or_abort","restore_renderer_snapshot","stage_exact_r4_hash_size_verified","install_r4_once_via_opal","persist_recovery_failure_stop"]}
    for name,events in scenarios.items():
        assert events.index("admission")<events.index("install_diag_once_via_opal") if "install_diag_once_via_opal" in events else True
        assert events.count("install_diag_once_via_opal")<=1 and events.count("install_r4_once_via_opal")<=1
    assert scenarios["identity_mismatch"].count("zero_device_writes")==1
    assert all("no_capture_or_renderer_commands_without_exact_candidate_identity" in scenarios[k] for k in ("http200_identity_mismatch_r4_still_installed","http200_identity_unknown"))
    assert "no_unnecessary_r4_upload" in scenarios["http200_identity_mismatch_r4_still_installed"]
    assert "zero_recovery_writes" in scenarios["http200_identity_unknown"]
    receipt={"schema":"hbnf-r6-compositor-timing-diagnostic-transaction-dryrun-v2","candidate":{"release_id":DIAG_ID,"sha256":DIAG_SHA,"size_bytes":DIAG_SIZE},
      "mandatory_return":{"release_id":R4_ID,"sha256":R4_SHA},"window_seconds_max":60,"safety_interval_seconds":8,
      "performance_gate":{"fps_floor":20,"frame_p99_ceiling_ms":75,"on_failure":"record the failure and continue all eight scheduled diagnostic samples"},
      "diagnostic_stop_rule":{"stop_on":"invalid/missing frame max, frame max >=1000ms, AUX native DDP loss, identity/runtime mismatch, or Matrix restart","preserves_exact_r4_return":True},
      "runtime_brightness_policy":{"capture_r4_runtime_and_persisted_settings":True,"measure_at":44,"restore_exact_captured_hbnf_settings_on_diagnostic_before_r4_return":True,"verify_r4_returns_at_original_brightness":True},
      "matched_tails_off_test_plan":{"same_candidate_kernel0_brightness44_and_runtime_controls":True,"tails_off_samples":3,"sample_interval_seconds":8,"then_enable_tails_and_capture_component_metrics":True,"variant_signature_and_control_changes_abort":True,"raw_audio_input_context_saved_each_poll":True,"observer_effect_conclusions":"report measurements without attributing causality from nested percentiles"},
      "measurement_metrics":list(COMPOSITOR_METRICS),"observer_instrumentation":"Built-in cycle timing only while tail collection is enabled; no separate frame-context trace commands.",
      "percentile_semantics":"Every read is a cumulative snapshot since tail collection was enabled or kernel changed; snapshots are not independent polling windows.",
      "firmware_source_changed":False,"device_requests":0,"next_attempt_transport":"previously proven SSH-verified Opal staging plus one Opal-origin curl multipart upload; no Mac-origin firmware body transfer","scenarios":scenarios,"result":"PASS_OFFLINE_SEQUENCE_POLICY"}
    save(OUT/"COMPOSITOR_TIMING_DIAGNOSTIC_DRYRUN.json",receipt);print(json.dumps(receipt,sort_keys=True));return 0

def execute():
    global OUT
    adapter=load_adapter();binding=json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text()).get("live_authorization_binding",{});attempt=int(binding.get("attempt_number",0))
    if attempt<1:raise RuntimeError("attempt number missing from exact authorization binding")
    OUT=ATTEMPT_ROOT/f"attempt-{attempt:02d}";OUT.mkdir(parents=True,exist_ok=True)
    receipt={"schema":"hbnf-r6-compositor-timing-diagnostic-live-transaction-v1","candidate":{"release_id":DIAG_ID,"sha256":DIAG_SHA,"size_bytes":DIAG_SIZE},"mandatory_return":{"release_id":R4_ID,"sha256":R4_SHA},"attempt_number":attempt,"authorization_id":binding.get("authorization_id"),"transport":binding.get("transport"),"state":"STARTED","started_at_utc":stamp(),"percentile_semantics":"Cumulative snapshots since tails were enabled or kernel changed; not independent polling windows.","candidate_install_attempts":0,"r4_return_attempts":0,"starting_matrix_brightness":None,"matched_tails_off_samples":[],"safety_samples":[],"compositor_timing_samples":[]}
    save(OUT/"TRANSACTION_STARTED.json",receipt)
    # Repeat all necessary prewrite checks immediately before the first write.
    if digest(DIAG_BIN)!=DIAG_SHA or digest(R4_BIN)!=R4_SHA:raise RuntimeError("exact artifact/rollback SHA mismatch")
    auth=json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text()).get(AUTH_KEY,{})
    if (auth.get("candidate_release_id")!=DIAG_ID or auth.get("candidate_sha256")!=DIAG_SHA
        or auth.get("mandatory_return_sha256")!=R4_SHA
        or auth.get("authorization_consumed") is not False or int(auth.get("install_attempts_used",0))!=0):
        raise RuntimeError("exact compositor timing diagnostic authorization is consumed, absent, or mismatched")
    power=subprocess.run(["pmset","-g","batt"],capture_output=True,text=True,timeout=5).stdout
    route=subprocess.run(["route","-n","get","192.168.77.10"],capture_output=True,text=True,timeout=5).stdout
    if "AC Power" not in power or "interface: en0" not in route:raise RuntimeError("Mac power/LAN preflight failed")
    os.environ["HBNF_EXPECTED_RELEASE_ID"]=R4_ID;os.environ["HBNF_EXPECTED_FIRMWARE_SHA256"]=R4_SHA
    pre=adapter.readonly_preflight("r6-diagnostic-immediate-preflight",expected_brightness=None)
    if pre.get("release_id")!=R4_ID or pre.get("matrix_on") is not True:raise RuntimeError("R4 preflight mismatch")
    baseline_brightness=pre.get("matrix_brightness")
    receipt["starting_matrix_brightness"]=baseline_brightness
    brightness_tx=load_brightness_transaction()
    baseline_context=brightness_tx.read_matrix_context(expected_release=R4_ID)["brightness"]
    brightness_baseline=baseline_context.get("persisted")
    if baseline_context.get("runtime",{}).get("matrixBrightness")!=baseline_brightness:
        raise RuntimeError("R4 runtime/persisted brightness reconciliation failed")
    receipt["starting_hbnf_settings"]={"runtime":baseline_context.get("runtime"),"persisted":brightness_baseline}
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
    receipt["preflight"]={"pass":True,"at_utc":stamp(),"r4":pre,"mac_on_ac":True,"matrix_route_en0":True,"diagnostic_sha256":digest(DIAG_BIN),"rollback_sha256":digest(R4_BIN),"starting_matrix_brightness":baseline_brightness,"measurement_matrix_brightness":44}
    save(OUT/"TRANSACTION_STARTED.json",receipt)
    diag_uploaded=False;candidate_identity_verified=False;snapshot=None;failure=None
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
        candidate_identity_verified=True
        receipt["state"]="DIAGNOSTIC_INSTALLED";save(OUT/"TRANSACTION_STARTED.json",receipt)
        os.environ["HBNF_EXPECTED_RELEASE_ID"]=DIAG_ID
        snapshot=adapter.snapshot(None,"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json")
        receipt["renderer_snapshot"]=snapshot;save(OUT/"RENDERER_SNAPSHOT.json",snapshot)
        adapter.select(0)
        receipt["measurement_brightness_setup"]=brightness_tx.change_matrix_brightness(
            brightness_baseline,operation="measure",expected_release=DIAG_ID)
        state,p20=adapter.p20_state()
        if state.get("HBNF",{}).get("timing",{}).get("kernel")!=0 or state.get("HBNF",{}).get("matrixBrightness")!=44:
            raise RuntimeError("kernel-0 / matrix brightness 44 setup not verified")
        if state.get("HBNF",{}).get("foundationTelemetry",{}).get("enabled") is not False:
            raise RuntimeError("matched tails-off baseline is unavailable")
        matched_signature=None;tails_off_start=time.monotonic()
        for scheduled in (4,12,20):
            target=tails_off_start+scheduled;delay=target-time.monotonic()
            if delay>0:time.sleep(delay)
            reads,elapsed=adapter._parallel_soak_reads("r6-diagnostic-tails-off")
            rows={k:response_body(v) for k,v in reads.items() if not k.startswith("_")}
            info,build,st=rows["matrix_info"],rows["matrix_build"],rows["matrix_state"]
            if build.get("release_id")!=DIAG_ID or info.get("mac","").replace(":","").lower()!=MATRIX_MAC or info.get("ip")!="192.168.77.10":raise RuntimeError("identity mismatch during tails-off baseline")
            if st.get("HBNF",{}).get("foundationTelemetry",{}).get("enabled") is not False:raise RuntimeError("tails-off baseline instrumentation unexpectedly enabled")
            context=diagnostic_runtime_context(st,build)
            signature=diagnostic_control_signature(context)
            if matched_signature is None:matched_signature=signature
            else:verify_matched_control_signature(matched_signature,context)
            if context["matrix_on"] is not True or context["kernel"]!=0 or context["matrix_brightness"]!=44:raise RuntimeError("tails-off runtime control mismatch")
            if type(context["whole_frame_us"]) not in (int,float) or context["whole_frame_us"]>=1000000:raise RuntimeError("unsafe tails-off frame interval")
            if not aux_ok(rows):raise RuntimeError("AUX native DDP loss during tails-off baseline")
            row={"scheduled_seconds":scheduled,"batch_elapsed_seconds":elapsed,"instrumentation":"tails_off","runtime_context":context,"control_signature":signature,"aux_native_ddp_active":True}
            receipt["matched_tails_off_samples"].append(row);save(OUT/"MATCHED_TAILS_OFF_SAMPLES.json",receipt["matched_tails_off_samples"])
        adapter.enable_tails(True)
        capture_start=time.monotonic();receipt["capture_start_utc"]=stamp();receipt["state"]="CAPTURING_KERNEL0";save(OUT/"TRANSACTION_STARTED.json",receipt)
        last_uptime=None;performance_gate_failures=[]
        for scheduled in range(4,61,8):
            target=capture_start+scheduled;delay=target-time.monotonic()
            if delay>0:time.sleep(delay)
            sample_start=time.monotonic_ns()
            reads,elapsed=adapter._parallel_soak_reads("r6-diagnostic-sample")
            rows={k:response_body(v) for k,v in reads.items() if not k.startswith("_")}
            timing=rows["matrix_state"].get("HBNF",{}).get("timing",{})
            ft=rows["matrix_state"].get("HBNF",{}).get("foundationTelemetry",{})
            mi=rows["matrix_info"]; build=rows["matrix_build"]; st=rows["matrix_state"]
            if build.get("release_id")!=DIAG_ID or mi.get("mac","").replace(":","").lower()!=MATRIX_MAC or mi.get("ip")!="192.168.77.10":raise RuntimeError("identity mismatch during capture")
            context=diagnostic_runtime_context(st,build);verify_matched_control_signature(matched_signature,context)
            if st.get("on") is not True or st.get("HBNF",{}).get("matrixBrightness")!=44 or timing.get("kernel")!=0:raise RuntimeError("runtime state mismatch during capture")
            if ft.get("enabled") is not True:raise RuntimeError("tails-on component capture is not enabled")
            uptime=int(mi.get("uptime",0));restarted=last_uptime is not None and uptime<last_uptime;last_uptime=uptime
            if restarted:raise RuntimeError("Matrix restart during diagnostic capture")
            aux=aux_ok(rows);fps=timing.get("fps");p99=ft.get("frameMsP99")
            component_timing=compositor_timing_sample(ft)
            decision=diagnostic_sample_decision(fps,p99,ft.get("frameMsMax"),aux)
            row={"scheduled_seconds":scheduled,"read_started_monotonic_ns":sample_start,"read_completed_monotonic_ns":time.monotonic_ns(),"batch_elapsed_seconds":elapsed,
              "endpoint_reads":reads.get("_endpoint_timing",{}),"uptime_seconds":uptime,"fps":fps,"frame_ms_p99":p99,
              "frame_ms_max":ft.get("frameMsMax"),"frame_tail_overflow":ft.get("frameTailOverflow"),"kernel":timing.get("kernel"),
              "variant_signature":timing.get("variantSignature"),"matrix_brightness":st.get("HBNF",{}).get("matrixBrightness"),"runtime_context":context,"control_signature":matched_signature,"instrumentation":"tails_on","aux_native_ddp_active":aux,
              "aux_physical_output_status":"NOT_OBSERVABLE_FROM_WLED_JSON","component_timing":component_timing,
              "performance_gate_pass":decision["performance_gate_pass"],
              "performance_gate_failure_reasons":decision["performance_gate_failure_reasons"],
              "diagnostic_stop_reasons":decision["stop_reasons"]}
            receipt["safety_samples"].append(row);receipt["compositor_timing_samples"].append(component_timing)
            if not decision["performance_gate_pass"]:
                performance_gate_failures.append({"scheduled_seconds":scheduled,"reasons":decision["performance_gate_failure_reasons"]})
            save(OUT/"SAFETY_SAMPLES.json",receipt["safety_samples"])
            save(OUT/"COMPOSITOR_TIMING_SAMPLES.json",receipt["compositor_timing_samples"])
            receipt["kernel0_performance_gate"]={"pass":not performance_gate_failures,"failures":performance_gate_failures}
            if decision["stop"]:raise RuntimeError("CATASTROPHIC_ABORT: "+",".join(decision["stop_reasons"]))
        receipt["capture_seconds"]=round(time.monotonic()-capture_start,3)
        receipt["matched_tails_off_comparison"]={"control_signature":matched_signature,
          "tails_off":[{"scheduled_seconds":x["scheduled_seconds"],"fps":x["runtime_context"].get("fps"),"whole_frame_us":x["runtime_context"].get("whole_frame_us")} for x in receipt["matched_tails_off_samples"]],
          "tails_on":[{"scheduled_seconds":x["scheduled_seconds"],"fps":x.get("fps"),"frame_ms_avg":x.get("component_timing",{}).get("frameMsAvg")} for x in receipt["safety_samples"]],
          "interpretation":"Raw same-candidate measurements under matched runtime controls; no causal conclusion from cumulative tail percentiles."}
    except Exception as e:
        failure=f"{type(e).__name__}: {e}";receipt["diagnostic_error"]=failure
    finally:
        if candidate_identity_verified and snapshot is None:
            # Recover a snapshot that may have completed just before a host-side
            # acknowledgement failure.
            try:
                _,p20=adapter.p20_state();sid=p20.get("snapshotId");shash=p20.get("snapshotHash")
                if p20.get("snapshotValid") is True and p20.get("snapshotState")=="READY":
                    snapshot={"snapshotId":sid,"snapshotHash":shash,"foundationTelemetryEnabledBefore":pre.get("foundation_telemetry_enabled",False)}
            except Exception:pass
        if candidate_identity_verified and snapshot:
            try:
                receipt["renderer_restore"]=adapter._restore_snapshot(int(snapshot["snapshotId"]),int(snapshot["snapshotHash"]))
                save(OUT/"RENDERER_RESTORE.json",receipt["renderer_restore"])
            except Exception as e:
                receipt["renderer_restore_error"]=f"{type(e).__name__}: {e}";save(OUT/"RENDERER_RESTORE.json",receipt["renderer_restore"])
        if candidate_identity_verified and baseline_context:
            try:
                current_brightness=brightness_tx.read_matrix_context(expected_release=DIAG_ID)["brightness"]
                if current_brightness.get("runtime")==brightness_baseline and current_brightness.get("persisted")==brightness_baseline:
                    receipt["baseline_settings_restore"]={"verified":True,"write_performed":False,"settings":brightness_baseline}
                else:
                    receipt["baseline_settings_restore"]=brightness_tx.change_matrix_brightness(
                        brightness_baseline,operation="restore",expected_release=DIAG_ID)
                save(OUT/"BASELINE_SETTINGS_RESTORE.json",receipt["baseline_settings_restore"])
            except Exception as e:
                receipt["baseline_settings_restore_error"]=f"{type(e).__name__}: {e}"
                save(OUT/"BASELINE_SETTINGS_RESTORE.json",receipt["baseline_settings_restore_error"])
        if diag_uploaded:
            # The exact R4 return is mandatory after the diagnostic; one request, no retry.
            try:
                info,build=current_identity(adapter,seconds=30)
                observed=exact_recovery_release(info,build)
                receipt["recovery_preflight"]={"at_utc":stamp(),"release_id":observed,"candidate":build.get("candidate"),"matrix_mac":info.get("mac"),"wled":info.get("ver"),"read_only":True}
                if observed==DIAG_ID:
                    receipt["r4_return_attempts"]=1;receipt["r4_return_started_at_utc"]=stamp();save(OUT/"TRANSACTION_STARTED.json",receipt)
                    try:receipt["r4_upload"]=upload_once(R4_BIN,OUT/"r4-upload-response.html")
                    except Exception as upload_error:receipt["r4_upload_error"]=f"{type(upload_error).__name__}: {upload_error}"
                    os.environ["HBNF_EXPECTED_RELEASE_ID"]=R4_ID
                    receipt["r4_runtime"]=wait_release(adapter,R4_ID)
                else:
                    # R4 remained active: readback itself satisfies exact recovery,
                    # so avoid an unnecessary second flash/reboot.
                    receipt["r4_runtime"]={"release_id":R4_ID,"candidate":R4_ID,"mac":info.get("mac"),"uptime":info.get("uptime"),"heap":info.get("freeheap"),"at_utc":stamp(),"already_installed":True}
                deadline=time.monotonic()+60;last=None
                while time.monotonic()<deadline:
                    reads,_=adapter._parallel_soak_reads("r4-return-ddp-check")
                    if aux_ok(reads):last={"status":"PASS","at_utc":stamp(),**aux_summary(reads)};break
                    last={"status":"WAITING_FOR_AUX_DDP","at_utc":stamp()};time.sleep(3)
                final_state=adapter.get(MATRIX+"/json/state")
                final_info=adapter.get(MATRIX+"/json/info")
                if final_state.get("on") is not True or final_state.get("HBNF",{}).get("matrixBrightness")!=baseline_brightness or final_info.get("freeheap",0)<20000:
                    raise RuntimeError("exact R4 identity present but Matrix runtime health/prior brightness restore failed")
                if not last or last.get("status")!="PASS":raise RuntimeError("R4 restored but AUX DDP not re-established within 60s")
                receipt["aux_return_verification"]=last
                captured=receipt.get("compositor_timing_samples",[])
                complete_capture=complete_timing_capture(captured,candidate_identity_verified,failure,receipt.get("matched_tails_off_samples",[]))
                receipt["state"]=("COMPOSITOR_TIMING_CAPTURED__EXACT_R4_RESTORED__AUX_DDP_VERIFIED" if complete_capture else "INCONCLUSIVE__EXACT_R4_RESTORED__AUX_DDP_VERIFIED")
            except Exception as e:
                receipt["r4_restore_error"]=f"{type(e).__name__}: {e}";receipt["state"]="BLOCKED_R4_RETURN_NOT_VERIFIED"
        elif not diag_uploaded:
            receipt["state"]="DIAGNOSTIC_NOT_CONFIRMED_INSTALLED__NO_RETRY"
        receipt["completed_at_utc"]=stamp();receipt["diagnostic_error"]=failure
        close_authority_after_transaction(receipt)
        save(OUT/"TRANSACTION_RESULT.json",receipt)
    print(json.dumps({"state":receipt["state"],"candidate_install_attempts":receipt["candidate_install_attempts"],"r4_return_attempts":receipt["r4_return_attempts"],"timing_samples":len(receipt.get("compositor_timing_samples",[])),"diagnostic_error":failure},sort_keys=True))
    return 0 if receipt["state"]=="COMPOSITOR_TIMING_CAPTURED__EXACT_R4_RESTORED__AUX_DDP_VERIFIED" else 2

def main():
    p=argparse.ArgumentParser();p.add_argument("--dry-run",action="store_true");p.add_argument("--execute",action="store_true");p.add_argument("--transport",choices=["opal"],default="opal");a=p.parse_args()
    if a.dry_run==a.execute:raise SystemExit("select exactly one of --dry-run or --execute")
    return dry_run() if a.dry_run else execute()
if __name__=="__main__":raise SystemExit(main())
