#!/usr/bin/env python3
"""Direct-LAN adapter for the bounded R4 Foundation-metrics transaction."""
from __future__ import annotations
import argparse, hashlib, json, pathlib, socket, statistics, sys, time, urllib.error, urllib.request

MATRIX="http://192.168.77.10"
AUX="http://192.168.77.11"
EXPECTED="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
MAC="704bca5b345c"
CACHE=pathlib.Path("/tmp/hbnf-foundation-telemetry-cache.json")
HTTP_TIMEOUT_SECONDS=10
POST_TIMEOUT_SECONDS=25
COMMAND_ACK_TIMEOUT_SECONDS=30
SNAPSHOT_READY_TIMEOUT_SECONDS=45
RESTORE_VERIFY_TIMEOUT_SECONDS=90
TAIL_HISTOGRAM_BINS=512
EXPECTED_TAIL_BIN_US=250
MIN_HTTP_REMAINING_BUDGET_SECONDS=1.0

def get(url, timeout=HTTP_TIMEOUT_SECONDS, deadline=None):
    attempts=2 if url.endswith("/json/state") else 1
    last=None
    for attempt in range(attempts):
        request_timeout=timeout
        if deadline is not None:
            remaining=deadline-time.monotonic()
            if remaining<MIN_HTTP_REMAINING_BUDGET_SECONDS:
                last=RuntimeError(f"deadline leaves {remaining:.6f}s; below minimum HTTP request budget {MIN_HTTP_REMAINING_BUDGET_SECONDS:g}s; no request started")
                break
            request_timeout=min(timeout,remaining)
        req=urllib.request.Request(url,headers={"Accept":"application/json","Cache-Control":"no-store"})
        try:
            with urllib.request.urlopen(req,timeout=request_timeout) as r:
                raw=r.read().decode()
                try:return json.loads(raw)
                except Exception as e:
                    raise RuntimeError(f"GET {url} returned invalid JSON after {request_timeout:g}s: {type(e).__name__}: {e}; body_tail={raw[-1000:]!r}") from e
        except RuntimeError as e:
            if str(e).startswith(f"GET {url} returned invalid JSON"):raise
            last=e
        except Exception as e:
            reason=getattr(e,"reason",None)
            transient=isinstance(e,(TimeoutError,socket.timeout,ConnectionResetError,ConnectionAbortedError)) or isinstance(reason,(TimeoutError,socket.timeout,ConnectionResetError,ConnectionAbortedError))
            if attempt+1<attempts and url.endswith("/json/state") and transient:
                time.sleep(.25)
                last=e
                continue
            last=e
        break
    raise RuntimeError(f"GET {url} failed after {request_timeout if 'request_timeout' in locals() else timeout:g}s (attempts={attempts}): {type(last).__name__}: {last}") from last

def post_state(payload, timeout=POST_TIMEOUT_SECONDS):
    req=urllib.request.Request(MATRIX+"/json/state",data=json.dumps(payload,separators=(",",":")).encode(),headers={"Content-Type":"application/json"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=timeout) as r:
            raw=r.read().decode()
            try:return json.loads(raw) if raw.strip() else {}
            except Exception as e:
                raise RuntimeError(f"POST {MATRIX}/json/state returned invalid JSON after {timeout:g}s: {type(e).__name__}: {e}; body_tail={raw[-1000:]!r}") from e
    except Exception as e:
        if isinstance(e,RuntimeError) and str(e).startswith(f"POST {MATRIX}/json/state returned invalid JSON"):raise
        raise RuntimeError(f"POST {MATRIX}/json/state failed after {timeout:g}s: {type(e).__name__}: {e}") from e

def p20_state(deadline=None,stage="packet20-state-read"):
    timeout=HTTP_TIMEOUT_SECONDS
    if deadline is not None:
        remaining=deadline-time.monotonic()
        if remaining<MIN_HTTP_REMAINING_BUDGET_SECONDS:raise RuntimeError(f"{stage} deadline leaves {remaining:.6f}s; below minimum HTTP request budget {MIN_HTTP_REMAINING_BUDGET_SECONDS:g}s; no GET started for {MATRIX}/json/state")
        timeout=min(timeout,remaining)
    state=get(MATRIX+"/json/state",timeout=timeout,deadline=deadline)
    return state,state.get("HBNF",{}).get("packet20Diagnostic",{})

def _ack_timeout(stage, budget, last):
    diag=last if isinstance(last,dict) else {}
    summary={k:diag.get(k) for k in ("lastCommand","lastCommandAccepted","snapshotState","snapshotId","snapshotHash","restoreVerified")}
    return RuntimeError(f"{stage} acknowledgement timed out after {budget}s; last_state={json.dumps(summary,sort_keys=True)}")

def observer_poll_budget_available(deadline, reserve_seconds=1.0):
    """Do not start a telemetry GET that can only receive a near-zero timeout."""
    return deadline-time.monotonic()>=reserve_seconds

def collect_frame_window(stage, window_seconds=30, reserve_seconds=1.0, minimum_samples=20):
    """Collect a bounded frame-average window, failing closed only before minimum."""
    deadline=time.monotonic()+window_seconds
    samples=[]
    while time.monotonic()<deadline and observer_poll_budget_available(deadline,reserve_seconds):
        state,_=p20_state(deadline,stage=stage)
        value=state.get("HBNF",{}).get("timing",{}).get("wholeFrameUs")
        if value is not None:samples.append(float(value)/1000.0)
        if time.monotonic()+1>=deadline:break
        time.sleep(1)
    if len(samples)<minimum_samples:
        raise RuntimeError(f"{stage}-under-sampled:{len(samples)}<{minimum_samples}")
    return samples

def command(op,**kw):
    post_state({"on":True,"HBNF":{"packet20Diagnostic":{"op":op,**kw}}})
    deadline=time.monotonic()+COMMAND_ACK_TIMEOUT_SECONDS;last=None
    while time.monotonic()<deadline:
        _,last=p20_state(deadline,stage=f"command-{op}-ack")
        if last.get("lastCommand")==op:return {"HBNF":{"packet20Diagnostic":last}}
        time.sleep(.1)
    raise _ack_timeout(f"command-{op}",COMMAND_ACK_TIMEOUT_SECONDS,last)

def enable_tails(enabled):
    state,p20=p20_state(); current=state.get("HBNF",{}).get("foundationTelemetry",{}).get("enabled")
    if current is not enabled:
        post_state({"on":True,"HBNF":{"foundationTelemetry":{"enabled":enabled}}})
        deadline=time.monotonic()+COMMAND_ACK_TIMEOUT_SECONDS
        while time.monotonic()<deadline:
            state,p20=p20_state(deadline,stage="foundation-telemetry-mode-ack")
            if state.get("HBNF",{}).get("foundationTelemetry",{}).get("enabled") is enabled:return state,p20
            time.sleep(.25)
        raise _ack_timeout("foundation-telemetry-mode",COMMAND_ACK_TIMEOUT_SECONDS,p20)
    return state,p20

def aux_projection_health(aux_info, aux_state):
    """Report native WLED DDP receipt separately from optional HBNF frame-lock telemetry."""
    hbnfaux = aux_state.get("HBNFAUX") if isinstance(aux_state, dict) else None
    if not isinstance(hbnfaux, dict):hbnfaux={}
    age = hbnfaux.get("projectionRxAgeMs")
    packets = hbnfaux.get("projectionRxPackets")
    sequence = hbnfaux.get("projectionRxSeq")
    hellos = hbnfaux.get("projectionHelloPackets")
    counter_valid=all(isinstance(value,(int,float)) and value>=0 for value in (age,packets,sequence,hellos))
    peer_known = hbnfaux.get("projectionPeerKnown") is True
    frame_lock_active = hbnfaux.get("projectionRxActive") is True and peer_known and isinstance(packets,(int,float)) and int(packets)>0
    wled_live_source=bool(aux_info.get("live") is True and aux_info.get("lm")=="DDP" and aux_info.get("lip")=="192.168.77.10")
    return {
        "active": wled_live_source,
        "age_ms": int(age) if counter_valid else 4294967295,
        "age_valid": bool(counter_valid and frame_lock_active),
        "frame_lock_active": frame_lock_active,
        "rx_packets": int(packets) if isinstance(packets,(int,float)) and packets>=0 else None,
        "rx_sequence": int(sequence) if isinstance(sequence,(int,float)) and sequence>=0 else None,
        "peer_known": peer_known,
        "hello_packets": int(hellos) if isinstance(hellos,(int,float)) and hellos>=0 else None,
        "wled_live_source": wled_live_source,
    }


def identity():
    info=get(MATRIX+"/json/info"); build=get(MATRIX+"/hbnf/build.json")
    if info.get("ip")!="192.168.77.10" or info.get("mac","").replace(":","").lower()!=MAC:raise RuntimeError("matrix-ip-or-mac-mismatch")
    if build.get("release_id")!=EXPECTED or build.get("candidate")!=EXPECTED:raise RuntimeError("foundation-metrics-release-identity-mismatch")
    return info,build

def snapshot(observer_output=None, inventory=None):
    identity(); state,p20=p20_state()
    new_snapshot=not p20.get("snapshotValid")
    if not p20.get("enabled"):
        command("begin"); time.sleep(1); state,p20=p20_state()
    if not p20.get("snapshotValid") and p20.get("snapshotState")=="IDLE":
        if not command("snapshot").get("HBNF",{}).get("packet20Diagnostic",{}).get("lastCommandAccepted",False):raise RuntimeError("packet20-snapshot-command-rejected")
        deadline=time.monotonic()+SNAPSHOT_READY_TIMEOUT_SECONDS
        last_state=None;last_p20=p20
        while time.monotonic()<deadline:
            state,p20=p20_state(deadline,stage="snapshot-ready")
            last_state=state;last_p20=p20
            if p20.get("snapshotState")=="READY" and p20.get("snapshotValid"):break
            if p20.get("snapshotState")=="FAILED":raise RuntimeError("packet20-snapshot-failed")
            time.sleep(.25)
        else:
            raise RuntimeError(
                f"packet20-snapshot-ready-timeout after {SNAPSHOT_READY_TIMEOUT_SECONDS}s; "
                f"last_state={json.dumps({k:last_p20.get(k) for k in ('snapshotState','snapshotValid','snapshotId','snapshotHash')},sort_keys=True)}"
            )
    if not p20.get("snapshotValid") or p20.get("snapshotState")!="READY":raise RuntimeError("packet20-existing-snapshot-not-ready")
    if new_snapshot and observer_output:
        try:foundation_prequal_windows(observer_output,inventory)
        except Exception as exc:
            try:
                restored=_restore_snapshot(p20.get("snapshotId"),p20.get("snapshotHash"))
                result={"schema":"hbnf-observer-effect-failure-v1","status":"OBSERVER_FAILED__RENDERER_RESTORED",
                        "snapshotId":p20.get("snapshotId"),"snapshotHash":p20.get("snapshotHash"),
                        "restore":restored,"error":f"{type(exc).__name__}: {exc}"}
            except Exception as restore_exc:
                result={"schema":"hbnf-observer-effect-failure-v1","status":"OBSERVER_FAILED__RESTORE_UNVERIFIED",
                        "snapshotId":p20.get("snapshotId"),"snapshotHash":p20.get("snapshotHash"),
                        "error":f"{type(exc).__name__}: {exc}","restore_error":f"{type(restore_exc).__name__}: {restore_exc}"}
            sidecar=pathlib.Path(observer_output).with_name("OBSERVER_EFFECT_FAILURE.json")
            sidecar.parent.mkdir(parents=True,exist_ok=True)
            sidecar.write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
            raise RuntimeError(f"foundation-prequal-failed; snapshot={p20.get('snapshotId')} hash={p20.get('snapshotHash')}; sidecar={sidecar}; restore={result.get('status')}; cause={type(exc).__name__}: {exc}") from exc
    return {"snapshotId":p20.get("snapshotId"),"snapshotHash":p20.get("snapshotHash")}

def foundation_prequal_windows(output, inventory):
    """Measure observer effect once on seq39 and use its instrumented window as the sacrificial warm-up."""
    select(0);time.sleep(5)
    enable_tails(False)
    steady=collect_frame_window("foundation-steady-state-tails-off",window_seconds=40,minimum_samples=27)
    enable_tails(True)
    instrumented=collect_frame_window("foundation-observer-instrumented-sacrificial-warmup",window_seconds=40,minimum_samples=27)
    warmup=telemetry(inventory,output,emit=False)
    enable_tails(False)
    light_median=statistics.median(steady);instrumented_median=statistics.median(instrumented)
    delta=(instrumented_median-light_median)/light_median*100.0 if light_median else None
    result={"schema":"hbnf-foundation-prequal-windows-v1","status":"PASS",
      "observer_effect":{"status":"MEASURED_ON_SEQ39_EXACT_ARTIFACT","candidate_release":EXPECTED,"lightweight_samples":len(steady),"instrumented_samples":len(instrumented),"lightweight_frame_average_median_ms":light_median,"instrumented_frame_average_median_ms":instrumented_median,"relative_delta_pct":delta,"metric":"same one-second latest-frame-average source in both modes"},
      "steady_state":{"tails_enabled":False,"duration_seconds":40,"samples":len(steady),"frame_average_ms_min":min(steady),"frame_average_ms_max":max(steady)},
      "sacrificial_warmup":{"tails_enabled":True,"duration_seconds":40,"samples":len(instrumented),"excluded_from_foundation":True,"sample":warmup},
      "qualified_boundary":"observer comparison and sacrificial tails-on warm-up complete; tails disabled before the full 28-kernel sweep; mode transition resets firmware histogram"}
    path=pathlib.Path(output);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    return result

def _restore_snapshot(sid,shash):
    state,p20=p20_state()
    if p20.get("restoreVerified") is not True:
        if not command("restore",snapshotId=int(sid)).get("HBNF",{}).get("packet20Diagnostic",{}).get("lastCommandAccepted",False):raise RuntimeError("packet20-restore-command-rejected")
        deadline=time.monotonic()+RESTORE_VERIFY_TIMEOUT_SECONDS
        last_p20=p20
        while time.monotonic()<deadline:
            state,p20=p20_state(deadline,stage="renderer-restore-verification")
            last_p20=p20
            if p20.get("restoreVerified") is True:break
            if p20.get("snapshotState")=="FAILED":raise RuntimeError("packet20-restore-failed")
            time.sleep(.25)
        else:
            raise RuntimeError(
                f"packet20-restore-verification-timeout after {RESTORE_VERIFY_TIMEOUT_SECONDS}s; "
                f"last_state={json.dumps({k:last_p20.get(k) for k in ('lastCommand','lastCommandAccepted','snapshotState','snapshotId','snapshotHash','restoreVerified')},sort_keys=True)}"
            )
    if int(p20.get("snapshotId",-1))!=int(sid):raise RuntimeError("packet20-snapshot-id-mismatch")
    if int(p20.get("snapshotHash",-1))!=int(shash):raise RuntimeError("packet20-snapshot-hash-mismatch")
    if p20.get("lastCommand")!="restore":raise RuntimeError("packet20-restore-command-identity-mismatch")
    if p20.get("lastCommandAccepted") is not True:raise RuntimeError("packet20-restore-command-not-accepted")
    return {"restoreVerified":True,"snapshotId":int(sid),"snapshotHash":int(shash),"packet20Same":True}

def select(kernel):
    if not command("select",kernel=int(kernel)).get("HBNF",{}).get("packet20Diagnostic",{}).get("lastCommandAccepted",False):raise RuntimeError("packet20-kernel-select-rejected")

def telemetry(inventory,session_id,emit=True):
    info,build=identity(); state,p20=enable_tails(True)
    deadline=time.monotonic()+5
    while state.get("HBNF",{}).get("foundationTelemetry",{}).get("frameMsP99") is None and time.monotonic()<deadline:
        time.sleep(.1);state,p20=p20_state(deadline,stage="foundation-tail-readiness")
    h=state["HBNF"]; timing=h["timing"]; ft=h.get("foundationTelemetry",{})
    if not ft.get("enabled") or ft.get("frameMsP99") is None:raise RuntimeError("foundation-frame-tail-contract-missing")
    resolution_us=ft.get("frameTailBinResolutionUs")
    if not isinstance(resolution_us,(int,float)) or resolution_us<=0:raise RuntimeError("foundation-frame-tail-bin-resolution-invalid")
    if int(resolution_us)!=EXPECTED_TAIL_BIN_US:raise RuntimeError(f"foundation-telemetry-resolution-mismatch:{resolution_us}!={EXPECTED_TAIL_BIN_US}")
    # The firmware overflow bit is global across eight metrics. A rare max can
    # occupy the final histogram bin while every reported percentile remains
    # below it; frameMsMax is maintained exactly outside the histogram. Reject
    # only when a percentile itself is represented by the saturated final bin.
    saturated_quantile_ms=((TAIL_HISTOGRAM_BINS-1)*resolution_us+resolution_us/2)/1000.0
    quantiles={k:ft.get(k) for k in (
      "frameMsP50","frameMsP95","frameMsP99","kernelMsP95","paletteMsP95",
      "audioMsP95","schedulerMsP95","overlayMsP95","auxPrepareSendMsP95","unaccountedMsP95")}
    if any(v is None for v in quantiles.values()):raise RuntimeError("foundation-frame-tail-quantile-contract-missing")
    saturated_fields=[k for k,v in quantiles.items() if float(v)>=saturated_quantile_ms]
    if saturated_fields:
      raw={
        "status":"SATURATED",
        "saturated_fields":saturated_fields,
        "saturated_quantile_ms":saturated_quantile_ms,
        "frame_ms_max":ft.get("frameMsMax"),
        "frame_tail_overflow":ft.get("frameTailOverflow"),
        "frame_tail_sample_count":ft.get("sampleCount"),
        "quantiles":quantiles,
        "foundationTelemetry":ft,
        "timing":timing,
      }
      raw_path=pathlib.Path(str(session_id))/"SATURATED_TELEMETRY_RAW.json"
      raw_path.parent.mkdir(parents=True,exist_ok=True)
      raw_path.write_text(json.dumps(raw,indent=2,sort_keys=True)+"\n")
      raise RuntimeError(f"foundation-frame-tail-quantile-saturated-at-{saturated_quantile_ms:g}ms fields={','.join(saturated_fields)} raw={raw_path}")
    aux=get(AUX+"/json/info"); aux_state=get(AUX+"/json/state"); leds=aux.get("leds",{})
    aux_rx=aux_projection_health(aux,aux_state)
    inv=json.loads(pathlib.Path(inventory).read_text())
    kid=int(timing["kernel"])
    entry=next((x for x in inv["entries"] if int(x["runtime_kernel_index_expected"])==kid),None)
    if entry is None:raise RuntimeError("runtime-kernel-outside-inventory")
    cache={"session_id":str(session_id),"restart_count":0,"uptime":int(timing["uptimeSec"])}
    try: old=json.loads(CACHE.read_text())
    except Exception: old={}
    if old.get("session_id")==cache["session_id"]:
        cache["restart_count"]=int(old.get("restart_count",0))
        if cache["uptime"]<int(old.get("uptime",0)):cache["restart_count"]+=1
    else:cache["restart_count"]=0
    CACHE.write_text(json.dumps(cache))
    sample={
      "release_id":build["release_id"],"uptime_seconds":timing["uptimeSec"],"fps":timing["fps"],
      "frame_ms_avg":ft.get("frameMsAvg"),"frame_ms_p50":ft.get("frameMsP50"),"frame_ms_p95":ft.get("frameMsP95"),"frame_ms_p99":ft.get("frameMsP99"),"frame_ms_max":ft.get("frameMsMax"),
      "kernel_id":kid,"kernel_name":entry["kernel_name"],"variant_id":timing["variantSignature"],
      "free_heap_bytes":timing["freeHeap"],"minimum_free_heap_bytes":ft.get("minimumFreeHeapBytes"),"largest_free_block_bytes":ft.get("largestFreeBlockBytes"),
      "frame_tail_bin_resolution_us":resolution_us,"frame_tail_overflow":ft.get("frameTailOverflow"),"frame_tail_saturated_quantile_ms":saturated_quantile_ms,"frame_tail_sample_count":ft.get("sampleCount"),
      "websocket_clients":info.get("ws"),"aux_projection_active":aux_rx["active"],"aux_projection_age_ms":aux_rx["age_ms"],"aux_render_fps":leds.get("fps"),
      "aux_projection_age_valid":aux_rx["age_valid"],"aux_frame_lock_rx_active":aux_rx["frame_lock_active"],
      "aux_projection_rx_packets":aux_rx["rx_packets"],"aux_projection_rx_sequence":aux_rx["rx_sequence"],"aux_projection_peer_known":aux_rx["peer_known"],"aux_projection_hello_packets":aux_rx["hello_packets"],"aux_wled_live_source":aux_rx["wled_live_source"],
      "wifi_rssi_dbm":timing["rssi"],"restart_count":cache["restart_count"],
      "kernel_ms_avg":ft.get("kernelMsAvg"),"kernel_ms_p95":ft.get("kernelMsP95"),"palette_ms_avg":ft.get("paletteMsAvg"),"palette_ms_p95":ft.get("paletteMsP95"),
      "audio_ms_avg":ft.get("audioMsAvg"),"audio_ms_p95":ft.get("audioMsP95"),"scheduler_ms_avg":ft.get("schedulerMsAvg"),"scheduler_ms_p95":ft.get("schedulerMsP95"),
      "overlay_ms_avg":ft.get("overlayMsAvg"),"overlay_ms_p95":ft.get("overlayMsP95"),"aux_prepare_send_ms_avg":ft.get("auxPrepareSendMsAvg"),"aux_prepare_send_ms_p95":ft.get("auxPrepareSendMsP95"),
      "unaccounted_ms_avg":ft.get("unaccountedMsAvg"),"unaccounted_ms_p95":ft.get("unaccountedMsP95"),
    }
    if emit:print(json.dumps(sample,separators=(",",":")))
    return sample

def restore(path):
    snap=json.loads(pathlib.Path(path).read_text()); sid=int(snap["snapshotId"])
    print(json.dumps(_restore_snapshot(sid,snap["snapshotHash"])))

def main():
    ap=argparse.ArgumentParser();sub=ap.add_subparsers(dest="action",required=True)
    s0=sub.add_parser("snapshot");s0.add_argument("--observer-output");s0.add_argument("--inventory",required=True)
    s=sub.add_parser("select");s.add_argument("--kernel",required=True)
    t=sub.add_parser("telemetry");t.add_argument("--inventory",required=True);t.add_argument("--session-id",default="legacy")
    r=sub.add_parser("restore");r.add_argument("--snapshot-file",required=True)
    a=ap.parse_args()
    if a.action=="snapshot":print(json.dumps(snapshot(a.observer_output,a.inventory),separators=(",",":")))
    elif a.action=="select":select(a.kernel)
    elif a.action=="telemetry":telemetry(a.inventory,a.session_id)
    elif a.action=="restore":restore(a.snapshot_file)
if __name__=="__main__":
    try:main()
    except Exception as e:print(f"foundation adapter error: {type(e).__name__}: {e}",file=sys.stderr);sys.exit(2)
