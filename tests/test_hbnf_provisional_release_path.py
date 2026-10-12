#!/usr/bin/env python3
"""Offline guards and failure replays for the candidate-bound provisional OTA path."""
import importlib.util
import json
import pathlib
import tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("transaction",ROOT/"scripts/hbnf_r6_audio_cache_live_transaction.py")
txn=importlib.util.module_from_spec(spec);spec.loader.exec_module(txn)


def test_candidate_workflow_and_artifact_are_exact_and_start_from_f89():
    workflow_path=ROOT/"platform/workflows/phase2-provisional-release.json"
    workflow=json.loads(workflow_path.read_text())
    contract=workflow["provisional_release_contract"]
    capsule=pathlib.Path(tempfile.mkdtemp())/"capsule.json"
    capsule.write_text(json.dumps({"schema":"local-roots-execution-capsule-v1",
        "workflow_id":"phase2-provisional-release",
        "workflow_source":{"path":"platform/workflows/phase2-provisional-release.json",
            "sha256":txn.sha(workflow_path)}}))
    profile=txn.load_candidate_profile(capsule)
    txn.exact_artifacts(profile)
    assert profile.transaction_mode=="provisional"
    assert profile.starting_release_id==contract["starting_release_id"]
    assert profile.release_id=="hbnf-cart2-phase2-r6-incremental-controls-20261011"
    assert profile.sha256=="8afb21b9db6a03420fd6683507ee192168d8f6a13384e308f117911b5bdc6c5d"
    assert profile.size_bytes==1502864
    assert profile.rollback_sha256=="338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
    assert contract["smoke_seconds"]==300 and contract["thresholds_may_be_weakened"] is False
    outputs=" ".join(workflow["stages"][6]["outputs"])
    assert profile.sha256 in outputs and "8afb21b9" in outputs
    assert "f89a55fbc85b8ffda90390c18eb9b09e934e9e73db96884d712c033d4684a35b" not in outputs
    reference=contract["reference_workload"]
    assert reference["kernel_id"]==17 and reference["kernel_name"]=="Center_Field"
    assert reference["variant_signature"]==1347100689 and reference["baseline_fps_median"]==42.0


def test_wrong_artifact_or_matrix_target_rejected_before_port_execution():
    workflow_path=ROOT/"platform/workflows/phase2-provisional-release.json"
    capsule=pathlib.Path(tempfile.mkdtemp())/"capsule.json"
    capsule.write_text(json.dumps({"schema":"local-roots-execution-capsule-v1",
        "workflow_id":"phase2-provisional-release",
        "workflow_source":{"path":"platform/workflows/phase2-provisional-release.json",
            "sha256":txn.sha(workflow_path)}}))
    profile=txn.load_candidate_profile(capsule)
    ids={"candidate_release_id":profile.release_id,"candidate_bin_sha256":profile.sha256,
        "candidate_bin_path":str(profile.binary),"candidate_bin_size_bytes":profile.size_bytes,
        "rollback_bin_sha256":profile.rollback_sha256,"rollback_bin_path":str(profile.rollback_binary),
        "matrix_mac":txn.MATRIX_MAC}
    txn.verify_candidate_binding({"identities":ids},profile)
    for changes in ({"candidate_bin_sha256":"0"*64},{"matrix_mac":"001122334455"}):
        wrong={"identities":dict(ids,**changes)}
        try:txn.verify_candidate_binding(wrong,profile)
        except RuntimeError as exc:assert "admission-artifact-target-binding-mismatch" in str(exc)
        else:raise AssertionError("wrong candidate or target accepted")


class FakePort:
    def __init__(self, outcome="success", recovery_ok=True):
        self.candidate=txn.CandidateProfile(txn.PROVISIONAL_RELEASE,"a"*64,10,
            ROOT/"fake.bin",ROOT/"fake-adapter.json",ROOT/"fake-out",
            transaction_mode="provisional",starting_release_id=txn.RELEASE)
        self.device_requests=0;self.install_attempts=0;self.recovery_attempts=0
        self.closed=False;self.outcome=outcome;self.recovery_ok=recovery_ok
    def admit(self):pass
    def verify_local_artifacts(self):pass
    def preflight(self):
        self.device_requests+=1
        return {"pass":True,"brightness_baseline":{"runtime":{"matrixBrightness":66,"auxBrightness":68,"vibe":5}}}
    def stage_candidate(self):self.device_requests+=1;return {"pass":True}
    def consume_install_attempt(self):self.install_attempts=1
    def upload_candidate(self):
        self.device_requests+=1
        if self.outcome=="interrupted":raise TimeoutError("simulated interrupted upload")
        return {"confirmed":True}
    def resolve_runtime(self,upload):
        if self.outcome in ("startup_unknown","recovery_failure"):
            return {"installed":None,"error":"simulated startup/readback unavailable"}
        if self.outcome=="interrupted":
            return {"installed":False,"runtime":{"release_id":self.candidate.starting_release_id},
                "http_response_ambiguous":True,"resolution_window_seconds":150}
        return {"installed":True,"runtime":{"release_id":self.candidate.release_id}}
    def provisional_smoke(self,baseline):
        assert baseline=={"matrixBrightness":66,"auxBrightness":68,"vibe":5}
        self.device_requests+=1
        if self.outcome=="smoke_failure":return {"passed":False,"abort":{"run_error":"provisional-smoke-aux-ddp-health-failure"}}
        return {"passed":True,"health_window":{"status":"PASS","sample_count":11}}
    def recover_r4(self):
        self.recovery_attempts+=1
        if not self.recovery_ok:raise RuntimeError("simulated exact R4 recovery failure")
        self.device_requests+=1
        return {"status":"R4_READBACK_VERIFIED","runtime":{"release_id":txn.R4}}
    def close(self,result):self.closed=True


def test_correct_candidate_reaches_provisional_result_without_full_soak():
    port=FakePort()
    result=txn.coordinate(port)
    assert result["status"]=="PROVISIONAL_INSTALL_SMOKE_PASS_NOT_FULLY_QUALIFIED"
    assert result["candidate_install_attempts"]==1 and result["recovery_attempts"]==0
    assert result["provisional_smoke"]["passed"] is True and port.closed


def test_interrupted_upload_with_starting_release_still_running_does_not_trigger_recovery():
    port=FakePort(outcome="interrupted")
    result=txn.coordinate(port)
    assert result["status"]=="TRANSACTION_EXCEPTION_STARTING_RELEASE_REMAINS"
    assert result["candidate_install_attempts"]==1 and result["recovery_attempts"]==0
    assert port.install_attempts==1 and port.closed


def test_failed_startup_readback_uses_one_exact_recovery_attempt():
    port=FakePort(outcome="startup_unknown")
    result=txn.coordinate(port)
    assert result["status"]=="RUNTIME_IDENTITY_UNRESOLVED_R4_RECOVERED"
    assert result["candidate_install_attempts"]==1 and result["recovery_attempts"]==1


def test_failed_recovery_stops_without_retry():
    port=FakePort(outcome="recovery_failure",recovery_ok=False)
    result=txn.coordinate(port)
    assert result["status"]=="RECOVERY_UNVERIFIED_STOP"
    assert result["candidate_install_attempts"]==1 and result["recovery_attempts"]==1


def test_failed_provisional_health_gate_rolls_back_once():
    port=FakePort(outcome="smoke_failure")
    result=txn.coordinate(port)
    assert result["status"]=="PROVISIONAL_SMOKE_FAILED_R4_RECOVERED"
    assert result["candidate_install_attempts"]==1 and result["recovery_attempts"]==1


def test_five_minute_health_window_preserves_catastrophic_performance_stop():
    now=[0.0];samples=[]
    def sample():
        value={"release_id":txn.PROVISIONAL_RELEASE,"matrix_ip":"192.168.77.10",
            "matrix_mac":txn.MATRIX_MAC,"wled":"16.0.1","matrix_on":True,
            "uptime_seconds":100+now[0],"fps":25,"kernel_id":17,
            "variant_signature":1347100689,"render_count":int(now[0]*42),"aux_ip":"192.168.77.11",
            "aux_mac":txn.AUX_MAC,"aux_on":True,"aux_live":True,"aux_mode":"DDP",
            "aux_source":"192.168.77.10","aux_led_count":22}
        samples.append(value);return value
    def sleep(seconds):now[0]+=seconds
    result=txn.run_provisional_health_window(sample,clock=lambda:now[0],sleep=sleep)
    assert result["status"]=="PASS" and result["duration_seconds"]==300
    assert result["sample_count"]==11
    bad=FakePort()
    now[0]=0
    low=lambda:{**sample(),"fps":10}
    try:txn.run_provisional_health_window(low,clock=lambda:now[0],sleep=sleep)
    except RuntimeError as exc:assert "reference-catastrophic-fps-floor" in str(exc)
    else:raise AssertionError("catastrophic low-FPS sequence accepted")


def test_known_slow_animation_is_never_misclassified_as_reference_workload():
    sample={"release_id":txn.PROVISIONAL_RELEASE,"matrix_ip":"192.168.77.10",
        "matrix_mac":txn.MATRIX_MAC,"wled":"16.0.1","matrix_on":True,
        "uptime_seconds":100,"fps":17,"kernel_id":18,
        "variant_signature":1347100706,"render_count":100,
        "aux_ip":"192.168.77.11","aux_mac":txn.AUX_MAC,"aux_on":True,
        "aux_live":True,"aux_mode":"DDP","aux_source":"192.168.77.10","aux_led_count":22}
    try:txn.validate_provisional_health_sample(sample,txn.PROVISIONAL_RELEASE)
    except RuntimeError as exc:assert "reference-workload-kernel-mismatch" in str(exc)
    else:raise AssertionError("arbitrary slow animation accepted as fixed smoke workload")


def test_reference_workload_controls_match_saved_f89_profile():
    payload=txn.provisional_reference_controls_payload()
    assert payload=={"on":True,"bri":255,"HBNF":{"scene":0,"vibe":0,"motion":50,
        "audioResponse":50,"matrixBrightness":44,"auxBrightness":255,"palette":{"mode":"legacy"}}}
    state={"bri":255,"HBNF":{"kernel":17,"variantSignature":1347100689,
        "scene":0,"vibe":0,"motion":50,"audioResponse":50,
        "matrixBrightness":44,"auxBrightness":255,"palette":{"mode":"legacy"}}}
    assert txn.validate_provisional_reference_context({"state":state}) is True
    state["HBNF"]["kernel"]=8
    try:txn.validate_provisional_reference_context({"state":state})
    except RuntimeError as exc:assert "reference-workload-controls-not-matched" in str(exc)
    else:raise AssertionError("unmatched kernel passed reference smoke setup")


def test_feature_failure_does_not_spend_r4_recovery_but_system_health_failure_does():
    assert txn.device_failure_requires_recovery({"error":"provisional-smoke-combined-feature-check-failed"}) is False
    assert txn.device_failure_requires_recovery({"error":"provisional-smoke-aux-ddp-health-failure"}) is True
    assert txn.device_failure_requires_recovery({"error":"provisional-smoke-reference-catastrophic-fps-floor-failed"}) is True


if __name__=="__main__":
    for name,value in sorted(globals().copy().items()):
        if name.startswith("test_") and callable(value):value()
    print("PASS: exact candidate/target binding, one-attempt install, interruption/readback resolution, one R4 recovery, and 5-minute smoke fail closed")
