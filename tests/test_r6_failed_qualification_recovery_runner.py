"""The recovery-only transaction rejects stale or unbound proof before device writes."""
import hashlib
import importlib.util
import json
import tempfile
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("r6_recovery_runner",ROOT/"scripts/hbnf_r6_audio_cache_live_transaction.py")
RUNNER=importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(RUNNER)


def main():
    previous_root=RUNNER.ROOT
    with tempfile.TemporaryDirectory(prefix="r6-recovery-runner-") as td:
        root=Path(td).resolve(); RUNNER.ROOT=root
        out=root/"evidence/run"; out.mkdir(parents=True)
        proof_path=root/"evidence/recovery-proof.json"
        proof={"schema":"hbnf-cart2-qualification-recovery-prelive-v1","captured_unix":time.time()-301,
            "pass":True,"read_only":True,"device_mutations":0,"operation_scope":"EXACT_R4_RECOVERY_ONLY",
            "candidate_release_id":RUNNER.SUCCESSOR_RELEASE,"candidate_sha256":RUNNER.SUCCESSOR_SHA}
        proof_path.write_text(json.dumps(proof)+"\n")
        diagnostic=root/"evidence/diagnostic.json"; diagnostic.write_text("{}\n")
        state_path=root/"state.json"
        state={"live_mutation_authorized":True,"live_mutation_authorization":{
            "qualification_recovery_subscope":"EXACT_R4_RECOVERY_ONLY","candidate_install_permitted":False,
            "candidate_attempts_used":1,"recovery_attempts_used":0,
            "qualification_prelive_receipt":str(proof_path.relative_to(root)),
            "qualification_prelive_sha256":hashlib.sha256(proof_path.read_bytes()).hexdigest(),
            "qualification_recovery_diagnostic_receipt":str(diagnostic.relative_to(root)),
            "qualification_recovery_diagnostic_sha256":hashlib.sha256(diagnostic.read_bytes()).hexdigest()},
            "execution_cursor":{"current_subject":{}},"current_task":{}}
        state_path.write_text(json.dumps(state)+"\n")
        profile=RUNNER.SUCCESSOR_PROFILE
        port=RUNNER.LivePort(None,None,None,out,profile); port.state_path=state_path
        calls=[]
        port.admit=lambda stage="LIVE_APPROVED": setattr(port,"admission",{"fresh_owner_authorization":{}})
        port.verify_local_artifacts=lambda:None
        port.restore_failed_candidate_owner_settings=lambda: calls.append("settings")
        old_restore=RUNNER.restore_r4_once
        RUNNER.restore_r4_once=lambda *a,**k: calls.append("r4")
        try:
            result=port.recover_r4_after_failed_qualification(proof_path)
        finally:
            RUNNER.restore_r4_once=old_restore
            RUNNER.ROOT=previous_root
        assert result["status"]=="RECOVERY_ADMISSION_BLOCKED_NO_WRITE",result
        assert result["recovery_attempts"]==0 and result["device_requests"]==0
        assert calls==[],"stale proof must fail before settings POST or R4 transfer"
    print("PASS: recovery runner rejects stale prelive proof before settings or OTA calls; no recovery attempt is consumed")


if __name__=="__main__":
    main()
