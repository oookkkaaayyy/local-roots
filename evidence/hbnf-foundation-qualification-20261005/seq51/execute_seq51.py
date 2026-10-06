#!/usr/bin/env python3
"""Bounded seq51 exact-candidate install and required-endpoint validation."""
import hashlib, json, pathlib, subprocess, sys, time

ROOT=pathlib.Path(__file__).resolve().parents[3]
OUT=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/"scripts"))
import hbnf_foundation_seq41_transaction as tx
import hbnf_foundation_live_adapter as adapter

CANDIDATE=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/artifact/firmware.bin"
RECOVERY=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/artifact/release07.bin"
SHA="338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
BASE_SHA="8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab"
NAME="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
BASE="hbnf-matrix-coordinated-v1-20261002-07"

def write(path,obj):
    p=pathlib.Path(path);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(obj,indent=2,sort_keys=True)+"\n")

def direct_json(url,timeout=4):
    return adapter.get(url,timeout=timeout)

def verify_runtime(expected,minimum_uptime=None):
    info=direct_json(adapter.MATRIX+"/json/info")
    build=direct_json(adapter.MATRIX+"/hbnf/build.json")
    state=direct_json(adapter.MATRIX+"/json/state")
    aux=direct_json(adapter.AUX+"/json/info")
    mac=info.get("mac","").replace(":","").lower()
    if info.get("ip")!="192.168.77.10" or mac!=tx.MAC: raise RuntimeError("matrix-ip-or-mac-mismatch")
    if build.get("release_id")!=expected or build.get("candidate")!=expected: raise RuntimeError("matrix-runtime-identity-mismatch")
    h=state.get("HBNF",{});timing=h.get("timing",{})
    if h.get("candidate")!=expected: raise RuntimeError("matrix-state-candidate-mismatch")
    uptime=int(timing.get("uptimeSec",-1))
    if uptime<0 or (minimum_uptime is not None and uptime<minimum_uptime): raise RuntimeError("matrix-restart-or-uptime-regression")
    if aux.get("ip")!="192.168.77.11" or aux.get("mac","").replace(":","").lower()!=tx.AUX_MAC:
        raise RuntimeError("aux-ip-or-mac-mismatch")
    if aux.get("live") is not True or aux.get("lm")!="DDP" or aux.get("lip")!="192.168.77.10":
        raise RuntimeError("successful-aux-info-shows-ddp-inactive-or-wrong-source")
    return {"release":expected,"uptime_seconds":uptime,"matrix_mac":mac,"aux":{"live":True,"lm":"DDP","lip":"192.168.77.10"}}

def wait(expected, timeout=180):
    deadline=time.monotonic()+timeout;last=None
    while time.monotonic()<deadline:
        try:return verify_runtime(expected)
        except Exception as e:last=f"{type(e).__name__}: {e}";time.sleep(3)
    raise RuntimeError(f"runtime-identity-timeout:{expected}:{last}")

def main():
    if hashlib.sha256(CANDIDATE.read_bytes()).hexdigest()!=SHA or CANDIDATE.stat().st_size!=1489008: raise RuntimeError("candidate-bytes-changed")
    if hashlib.sha256(RECOVERY.read_bytes()).hexdigest()!=BASE_SHA or RECOVERY.stat().st_size!=1458624: raise RuntimeError("Release07-bytes-changed")
    pre=verify_runtime(BASE)
    write(OUT/"SEQ51_PREINSTALL_RUNTIME.json",pre)
    result={"schema":"hbnf-seq51-targeted-transaction-v1","sequence":51,"recovery_sequence":52,"candidate":NAME,"candidate_sha256":SHA,"status":"STARTED","preinstall":pre}
    write(OUT/"SEQ51_TRANSACTION_STARTED.json",result)
    attempted=False
    try:
        attempted=True
        install=tx.opal_install(str(CANDIDATE),51,NAME,SHA,1489008,OUT)
        runtime=wait(NAME)
        tx.ledger_write(51,NAME,SHA)
        write(OUT/"SEQ51_CANDIDATE_INSTALLED.json",{"install":install,"runtime":runtime})
        collector=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq51/targeted_collector.py"
        cp=subprocess.run([sys.executable,str(collector),"--outdir",str(OUT/"targeted")],capture_output=True,text=True,timeout=1200)
        (OUT/"SEQ51_COLLECTOR_STDOUT.txt").write_text(cp.stdout)
        (OUT/"SEQ51_COLLECTOR_STDERR.txt").write_text(cp.stderr)
        payload=json.loads((OUT/"targeted/SEQ51_TARGETED_RESULT.json").read_text())
        if cp.returncode or payload.get("status")!="PASS": raise RuntimeError("targeted-validation-failed:"+str(payload.get("error",cp.returncode)))
        final=verify_runtime(NAME)
        result.update({"status":"PASS","install":install,"runtime_after":final,"collector_result":str(OUT/"targeted/SEQ51_TARGETED_RESULT.json"),"collector_sha256":hashlib.sha256((OUT/"targeted/SEQ51_TARGETED_RESULT.json").read_bytes()).hexdigest(),"renderer_restore":payload.get("renderer_restore"),"candidate_left_installed":True})
        write(OUT/"SEQ51_TRANSACTION_RESULT.json",result)
        return 0
    except Exception as e:
        result.update({"status":"FAIL","error":f"{type(e).__name__}: {e}"})
        write(OUT/"SEQ51_FAILURE.json",result)
        # The user authorizes seq52 only on actual install/runtime/targeted/restore failure.
        if attempted:
            recovery=tx.opal_install(str(RECOVERY),52,BASE,BASE_SHA,1458624,OUT)
            recovered=wait(BASE)
            tx.ledger_write(52,BASE,BASE_SHA)
            result.update({"seq52_recovery":"PASS","recovery":recovery,"verified_release07":recovered})
        result["status"]="FAIL_RECOVERED" if result.get("seq52_recovery")=="PASS" else "FAIL"
        write(OUT/"SEQ51_TRANSACTION_RESULT.json",result)
        return 2

if __name__=="__main__":
    try:raise SystemExit(main())
    except Exception as e:
        print(f"seq51 transaction failed: {type(e).__name__}: {e}",file=sys.stderr);raise SystemExit(2)
