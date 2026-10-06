#!/usr/bin/env python3
"""Temporary seq51 resource/AUX collector. Per sample it requires only Matrix state + AUX info."""
from __future__ import annotations
import argparse, hashlib, json, pathlib, sys, time, urllib.request, urllib.error

ROOT=pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/"scripts"))
import hbnf_foundation_live_adapter as adapter

EXPECTED="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
CANDIDATE_SHA="338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
BASELINE=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq49-offline-reconciliation/SEQ39_COMPARABLE_SETTLED_RESOURCE_BASELINE.json"
INVENTORY=ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"
MATRIX="http://192.168.77.10/json/state"
AUX_INFO="http://192.168.77.11/json/info"

class MissingEvidence(RuntimeError): pass
class GateFailure(RuntimeError): pass

def source_bound_restore_pass(p20, snapshot_id, snapshot_hash):
    """Firmware emits restoreVerified, not the adapter-only packet20Same alias."""
    return (isinstance(p20,dict)
        and p20.get("restoreVerified") is True
        and p20.get("lastCommand")=="restore"
        and p20.get("lastCommandAccepted") is True
        and int(p20.get("snapshotId",-1))==int(snapshot_id)
        and int(p20.get("snapshotHash",-1))==int(snapshot_hash))

def restore_assertion_fixture():
    good={"restoreVerified":True,"lastCommand":"restore","lastCommandAccepted":True,"snapshotId":7,"snapshotHash":99}
    checks={"source_bound_restore_pass":source_bound_restore_pass(good,7,99),
        "restore_false_fails":not source_bound_restore_pass({**good,"restoreVerified":False},7,99),
        "command_mismatch_fails":not source_bound_restore_pass({**good,"lastCommand":"snapshot"},7,99),
        "snapshot_mismatch_fails":not source_bound_restore_pass({**good,"snapshotHash":100},7,99)}
    if not all(checks.values()): raise RuntimeError("minimal source-bound restore fixture failed: "+json.dumps(checks))
    return {"schema":"hbnf-source-bound-restore-fixture-v1","status":"PASS","checks":checks,"json_packet20Same_required":False}

def get_json(url,timeout=5.0):
    req=urllib.request.Request(url,headers={"Accept":"application/json","Cache-Control":"no-store"})
    try:
        with urllib.request.urlopen(req,timeout=timeout) as r:
            status=r.status; raw=r.read()
        if status!=200: raise MissingEvidence(f"HTTP {status} for {url}")
        return json.loads(raw.decode("utf-8")),hashlib.sha256(raw).hexdigest()
    except (TimeoutError,urllib.error.URLError,ConnectionError,OSError,json.JSONDecodeError) as e:
        raise MissingEvidence(f"required read unavailable {url}: {type(e).__name__}: {e}") from e

def validate_pair(matrix_state,aux_info,baseline,expected_kernel,last_uptime,aux_state_error=None):
    """Validate only the two required bodies; optional AUX-state failure is ignored."""
    if not isinstance(matrix_state,dict): raise MissingEvidence("Matrix state payload missing")
    if not isinstance(aux_info,dict): raise MissingEvidence("AUX info payload missing")
    h=matrix_state.get("HBNF",{}); timing=h.get("timing",{}); ft=h.get("foundationTelemetry",{})
    if h.get("candidate")!=EXPECTED: raise GateFailure("candidate identity mismatch in Matrix state")
    if not isinstance(timing,dict) or not isinstance(ft,dict): raise MissingEvidence("Matrix state lacks required timing/foundationTelemetry")
    try:
        uptime=int(timing["uptimeSec"]); kernel=int(timing["kernel"]); free=int(timing["freeHeap"])
        largest=int(ft["largestFreeBlockBytes"])
    except (KeyError,TypeError,ValueError) as e: raise MissingEvidence(f"Matrix resource fields unavailable: {e}") from e
    if kernel!=expected_kernel: raise GateFailure(f"kernel identity mismatch: expected {expected_kernel}, got {kernel}")
    if last_uptime is not None and uptime<last_uptime: raise GateFailure(f"Matrix uptime regression/restart: {uptime} < {last_uptime}")
    if not ft.get("enabled"): raise MissingEvidence("resource telemetry not enabled")
    resources=baseline["kernels"][str(expected_kernel)]["comparable_settled_resources"]
    policy=json.loads((ROOT/"config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006_SUSTAINED_R1.json").read_text())
    cmp=policy["comparison"]["candidate_vs_baseline"]
    min_heap=resources["current_free_heap_min"]*cmp["minimum_free_heap_min_ratio"]
    min_largest=resources["largest_free_block_min"]*cmp["largest_free_block_min_ratio"]
    if free<min_heap: raise GateFailure(f"current free heap {free} < frozen minimum {min_heap:.2f}")
    if largest<min_largest: raise GateFailure(f"largest free block {largest} < frozen minimum {min_largest:.2f}")
    if aux_info.get("live") is not True: raise GateFailure("successful AUX info payload says live is not true")
    if aux_info.get("lm")!="DDP": raise GateFailure(f"successful AUX info payload mode is {aux_info.get('lm')!r}, expected DDP")
    if aux_info.get("lip")!="192.168.77.10": raise GateFailure(f"successful AUX info payload source is {aux_info.get('lip')!r}, expected Matrix")
    return {"kernel_id":kernel,"uptime_seconds":uptime,"restart_count":0,"free_heap_bytes":free,
        "largest_free_block_bytes":largest,"free_heap_min_required":min_heap,"largest_block_min_required":min_largest,
        "aux_live":True,"aux_mode":"DDP","aux_source":"192.168.77.10","optional_aux_state_error_ignored":aux_state_error}

def fixture_check():
    baseline=json.loads(BASELINE.read_text()); kid=0
    h={"HBNF":{"candidate":EXPECTED,"timing":{"uptimeSec":100,"kernel":kid,"freeHeap":120000},"foundationTelemetry":{"enabled":True,"largestFreeBlockBytes":70000}}}
    aux={"live":True,"lm":"DDP","lip":"192.168.77.10"}
    out={}
    out["optional_aux_state_failure_ignored"]=validate_pair(h,aux,baseline,kid,99,"timeout") is not None
    for name,ms,ai in (("matrix_state_failure",None,aux),("aux_info_failure",h,None)):
        try: validate_pair(ms,ai,baseline,kid,99); out[name]="ERROR_NOT_REJECTED"
        except (MissingEvidence,GateFailure): out[name]="FAIL_CLOSED"
    for name,ai in (("aux_live_false",{"live":False,"lm":"DDP","lip":"192.168.77.10"}),
                    ("aux_wrong_lm",{"live":True,"lm":"UDP","lip":"192.168.77.10"}),
                    ("aux_wrong_lip",{"live":True,"lm":"DDP","lip":"192.168.77.11"})):
        try: validate_pair(h,ai,baseline,kid,99); out[name]="ERROR_NOT_REJECTED"
        except GateFailure: out[name]="FAIL_CLOSED"
    if out.get("optional_aux_state_failure_ignored") is not True or any(v!="FAIL_CLOSED" for k,v in out.items() if k!="optional_aux_state_failure_ignored"):
        raise RuntimeError("minimal required/optional endpoint fixture failed: "+json.dumps(out,sort_keys=True))
    restore=restore_assertion_fixture()
    result={"schema":"hbnf-seq51-targeted-collector-fixture-v1","status":"PASS","checks":out,"restore_assertion":restore,
            "required_sample_endpoints":[MATRIX,AUX_INFO],"aux_json_state_required":False}
    return result

def collect_all(outdir):
    outdir=pathlib.Path(outdir);outdir.mkdir(parents=True,exist_ok=True)
    baseline=json.loads(BASELINE.read_text()); inv=json.loads(INVENTORY.read_text())
    if len(inv.get("entries",[]))!=28 or len(baseline.get("kernels",{}))!=28: raise GateFailure("28-kernel inventory/baseline invalid")
    samples=[]; last_uptime=None; failures=[]
    try:
        initial,_=get_json(MATRIX); ih=initial.get("HBNF",{});it=ih.get("timing",{})
        if ih.get("candidate")!=EXPECTED: raise GateFailure("candidate identity mismatch at targeted run start")
        last_uptime=int(it["uptimeSec"])
        initial_restart=0
        # Fresh diagnostic session is proven before taking the single renderer snapshot.
        _,p20=adapter.p20_state()
        if p20.get("enabled") or p20.get("snapshotValid"): raise GateFailure("fresh Packet20 session/snapshot precondition is not clean")
        begin=adapter.command("begin").get("HBNF",{}).get("packet20Diagnostic",{})
        _,p20=adapter.p20_state()
        if p20.get("enabled") is not True or p20.get("lastCommandAccepted") is not True:
            raise GateFailure("diagnosticActive=true not proven before renderer selection")
        snapshot=adapter.snapshot(None,str(INVENTORY))
        # Snapshot the fresh boot before the first renderer-affecting operation.
        _,p20=adapter.p20_state()
        if p20.get("enabled") is not True or p20.get("snapshotValid") is not True or p20.get("snapshotState")!="READY":
            raise GateFailure("fresh boot-scoped renderer snapshot not READY")
        if int(p20.get("snapshotId",-1))!=int(snapshot["snapshotId"]) or int(p20.get("snapshotHash",-1))!=int(snapshot["snapshotHash"]):
            raise GateFailure("snapshot receipt does not match firmware-owned Packet20 snapshot")
        snap={"schema":"hbnf-seq51-renderer-snapshot-v1","snapshotId":snapshot["snapshotId"],"snapshotHash":snapshot["snapshotHash"],"diagnosticActive":True,"boot_uptime_seconds":last_uptime}
        (outdir/"PRE_SWEEP_STATE.json").write_text(json.dumps(snap,indent=2,sort_keys=True)+"\n")
        adapter.enable_tails(True)
        for entry in inv["entries"]:
            kid=int(entry["runtime_kernel_index_expected"])
            adapter.select(kid)
            time.sleep(5.0)
            accepted=[]; attempt_log=[]
            for attempt in range(1,4):
                try:
                    ms,msha=get_json(MATRIX); ai,asha=get_json(AUX_INFO)
                    sample=validate_pair(ms,ai,baseline,kid,last_uptime)
                    last_uptime=sample["uptime_seconds"]
                    sample.update({"attempt":attempt,"matrix_state_sha256":msha,"aux_info_sha256":asha,"captured_at_unix":time.time()})
                    accepted.append(sample);samples.append(sample);attempt_log.append({"attempt":attempt,"status":"PASS"})
                    if len(accepted)>=2: break
                except MissingEvidence as e:
                    attempt_log.append({"attempt":attempt,"status":"MISSING_EVIDENCE_RETRY","reason":str(e)})
                except GateFailure as e:
                    attempt_log.append({"attempt":attempt,"status":"GATE_FAIL","reason":str(e)})
                    failures.append({"kernel":kid,"name":entry["kernel_name"],"attempts":attempt_log,"failure":str(e)})
                    raise
            (outdir/f"kernel-{kid:02d}-samples.json").write_text(json.dumps({"kernel_id":kid,"kernel_name":entry["kernel_name"],"settle_seconds":5,"attempts":attempt_log,"accepted":accepted},indent=2,sort_keys=True)+"\n")
            if len(accepted)<2:
                failures.append({"kernel":kid,"name":entry["kernel_name"],"attempts":attempt_log,"failure":"fewer than two required samples after three attempts"})
                raise GateFailure(f"kernel {kid} lacked two successful required samples after 3 attempts")
        status="PASS"
    except Exception as e:
        status="FAIL"; error=f"{type(e).__name__}: {e}"
        try: snap
        except NameError: snap=None
    restore=None
    if 'snapshot' in locals():
        try:
            restore=adapter._restore_snapshot(snapshot["snapshotId"],snapshot["snapshotHash"])
            raw_state=adapter.get(adapter.MATRIX+"/json/state")
            (outdir/"POST_RESTORE_RAW_STATE.json").write_text(json.dumps(raw_state,indent=2,sort_keys=True)+"\n")
            (_,p20)=adapter.p20_state()
            (outdir/"POST_RESTORE_RAW_P20.json").write_text(json.dumps(p20,indent=2,sort_keys=True)+"\n")
            if restore.get("restoreVerified") is not True or restore.get("packet20Same") is not True or not source_bound_restore_pass(p20,snapshot["snapshotId"],snapshot["snapshotHash"]):
                raise GateFailure("source-bound renderer restore verification failed")
        except Exception as e:
            status="FAIL"; error=f"renderer restore failure: {type(e).__name__}: {e}"; restore={"status":"FAIL","error":error}
    result={"schema":"hbnf-seq51-targeted-resource-result-v1","status":status,"candidate":EXPECTED,
      "candidate_sha256":CANDIDATE_SHA,"kernels_completed":len({x['kernel_id'] for x in samples}),
      "samples_accepted":len(samples),"samples":samples,"failures":failures,"renderer_restore":restore}
    if status!="PASS":result["error"]=locals().get("error","targeted collection failed")
    (outdir/"SEQ51_TARGETED_RESULT.json").write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    return result

def main():
    ap=argparse.ArgumentParser();ap.add_argument("--fixture",action="store_true");ap.add_argument("--outdir")
    a=ap.parse_args()
    if a.fixture: print(json.dumps(fixture_check(),indent=2)); return 0
    if not a.outdir: ap.error("--outdir required")
    result=collect_all(a.outdir);print(json.dumps({k:v for k,v in result.items() if k!="samples"},indent=2))
    return 0 if result["status"]=="PASS" else 2

if __name__=="__main__": raise SystemExit(main())
