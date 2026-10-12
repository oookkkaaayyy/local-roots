#!/usr/bin/env python3
"""Offline guards and failure replays for the candidate-bound provisional OTA path."""
import importlib.util
import hashlib
import json
import pathlib
import tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("transaction",ROOT/"scripts/hbnf_r6_audio_cache_live_transaction.py")
txn=importlib.util.module_from_spec(spec);spec.loader.exec_module(txn)
platform_spec=importlib.util.spec_from_file_location("hbnf_platform",ROOT/"scripts/platform.py")
platform=importlib.util.module_from_spec(platform_spec);platform_spec.loader.exec_module(platform)


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
    assert "reference_workload" not in contract
    smoke=" ".join(contract["smoke_checks"])
    assert "no threshold" in smoke and "self-contained" in smoke


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
    exact_auth={"candidate_release_id":profile.release_id,"candidate_bin_sha256":profile.sha256,
        "rollback_bin_sha256":profile.rollback_sha256,"candidate_install_limit":1,"recovery_install_limit":1}
    txn.verify_candidate_binding({"identities":ids,"fresh_owner_authorization":exact_auth},profile)
    smoke_auth=dict(exact_auth,recovery_install_limit=0)
    txn.verify_candidate_binding({"identities":ids,"fresh_owner_authorization":smoke_auth},profile)
    for changes in ({"candidate_bin_sha256":"0"*64},{"matrix_mac":"001122334455"}):
        wrong={"identities":dict(ids,**changes)}
        try:txn.verify_candidate_binding(wrong,profile)
        except RuntimeError as exc:assert "admission-artifact-target-binding-mismatch" in str(exc)
        else:raise AssertionError("wrong candidate or target accepted")


def test_installed_r6_accepts_new_smoke_authorization_without_repinning_r7_adapter():
    state=json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text())
    pending=state["execution_cursor"]["pending_provisional_candidate"]
    contract=json.loads((ROOT/"platform/workflows/phase2-provisional-release.json").read_text())["provisional_release_contract"]
    auth=state["live_authorization_binding"]
    assert auth["authorization_id"] != pending["authorization_id"]
    assert platform.provisional_pending_authorization_matches(auth,pending,state["installed_release"],contract)
    adapter=json.loads((ROOT/"config/HBNF_PACKET20_LIVE_SWEEP_ADAPTER_20261004.json").read_text())
    assert adapter["expected_release_id"] == "hbnf-cart2-phase2-offline-wow-r7-20261009"


def test_installed_r6_exception_rejects_wrong_candidate_or_rollback():
    state=json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text())
    pending=state["execution_cursor"]["pending_provisional_candidate"]
    contract=json.loads((ROOT/"platform/workflows/phase2-provisional-release.json").read_text())["provisional_release_contract"]
    auth=state["live_authorization_binding"]
    installed=state["installed_release"]
    assert not platform.provisional_pending_authorization_matches(dict(auth,candidate_bin_sha256="0"*64),pending,installed,contract)
    assert not platform.provisional_pending_authorization_matches(dict(auth,rollback_bin_sha256="0"*64),pending,installed,contract)
    assert not platform.provisional_pending_authorization_matches(dict(auth,candidate_release_id="other"),pending,installed,contract)


def test_smoke_runner_never_rolls_back_without_new_owner_authorization():
    source=(ROOT/"scripts/hbnf_r6_audio_cache_live_transaction.py").read_text()
    smoke=source.split("    def provisional_smoke_only(self):",1)[1].split("\n    def stage_candidate",1)[0]
    assert "self.recover_r4()" not in smoke
    assert "self.preflight_failed_candidate_recovery()" not in smoke
    assert 'binding.get("recovery_install_limit")!=0' in smoke
    assert "PROVISIONAL_SMOKE_CRITICAL_DEVICE_HEALTH_FAILURE_RECOVERY_AUTH_REQUIRED" in smoke


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


def test_five_minute_health_window_observes_arbitrary_animation_without_fps_gate():
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
    low=lambda:{**sample(),"fps":10,"kernel_id":18,"variant_signature":1347100706}
    result=txn.run_provisional_health_window(low,clock=lambda:now[0],sleep=sleep)
    assert result["status"]=="PASS" and result["fps_min_observed"]==10
    assert "no FPS acceptance threshold" in result["performance_scope"]


def test_known_slow_animation_is_observed_not_rejected_as_a_mismatched_reference():
    sample={"release_id":txn.PROVISIONAL_RELEASE,"matrix_ip":"192.168.77.10",
        "matrix_mac":txn.MATRIX_MAC,"wled":"16.0.1","matrix_on":True,
        "uptime_seconds":100,"fps":17,"kernel_id":18,
        "variant_signature":1347100706,"render_count":100,
        "aux_ip":"192.168.77.11","aux_mac":txn.AUX_MAC,"aux_on":True,
        "aux_live":True,"aux_mode":"DDP","aux_source":"192.168.77.10","aux_led_count":22}
    result=txn.validate_provisional_health_sample(sample,txn.PROVISIONAL_RELEASE)
    assert result[1]==17 and result[2]==100


def test_provisional_runner_does_not_start_packet20_or_select_a_benchmark_kernel():
    source=(ROOT/"scripts/hbnf_r6_audio_cache_live_transaction.py").read_text()
    smoke=source.split("    def provisional_smoke(self, owner_baseline):",1)[1].split("\n    def recover_r4",1)[0]
    assert '"packet20_instrumentation":"NOT_USED"' in smoke
    assert '"--require-normal-mode"' in smoke
    assert '"snapshot"' not in smoke and '"telemetry-mode"' not in smoke and '"select"' not in smoke
    assert "run_provisional_health_window(health_sample)" in smoke


def test_smoke_continuation_is_distinct_from_install_and_preserves_consumed_attempt():
    source=(ROOT/"scripts/hbnf_r6_audio_cache_live_transaction.py").read_text()
    guarded=(ROOT/"scripts/hbnf_guarded_run.py").read_text()
    smoke=source.split("    def provisional_smoke_only(self):",1)[1].split("\n    def stage_candidate",1)[0]
    close=source.split("    def close(self, result):",1)[1].split("\n\ndef execute(",1)[0]
    assert "self.provisional_smoke(baseline)" in smoke
    assert "self.stage_candidate(" not in smoke and "self.consume_install_attempt(" not in smoke
    assert 'pending["candidate_install_attempts_used"]=1' in close
    assert '"PROVISIONAL_SMOKE_CONTINUATION_RESULT.json"' in close
    assert '"CLOSED_AFTER_PROVISIONAL_SMOKE"' in close
    assert '"hardware_writes_permitted_now": False' in close
    assert "--provisional-smoke-only" in guarded
    preflight=source.split("    def preflight_candidate(",1)[1].split("\n    def ",1)[0]
    assert "capture_fresh_owner_settings" in preflight
    assert "if expected_brightness is None and not capture_fresh_owner_settings" in preflight


def test_feature_failure_does_not_spend_r4_recovery_but_system_health_failure_does():
    assert txn.provisional_device_failure_requires_recovery({"error":"provisional-smoke-combined-feature-check-failed"}) is False
    assert txn.provisional_device_failure_requires_recovery({"error":"provisional-smoke-owner-settings-restore-failed"}) is False
    assert txn.provisional_device_failure_requires_recovery({"error":"provisional-smoke-aux-ddp-health-failure"}) is True
    assert txn.provisional_device_failure_requires_recovery({"error":"provisional-smoke-renderer-stalled"}) is True


def test_new_candidate_attempt_does_not_reuse_consumed_f89_attempt_counter():
    workflow_path=ROOT/"platform/workflows/phase2-provisional-release.json"
    capsule=pathlib.Path(tempfile.mkdtemp())/"capsule.json"
    capsule.write_text(json.dumps({"schema":"local-roots-execution-capsule-v1",
        "workflow_id":"phase2-provisional-release",
        "workflow_source":{"path":"platform/workflows/phase2-provisional-release.json",
            "sha256":txn.sha(workflow_path)}}))
    profile=txn.load_candidate_profile(capsule)
    auth={"authorization_id":"OWNER-TEST-INCREMENTAL-PROVISIONAL",
        "source_message_ref":"test-only exact authorization binding",
        "candidate_release_id":profile.release_id,"candidate_bin_sha256":profile.sha256,
        "rollback_bin_sha256":profile.rollback_sha256,"matrix_mac":"70:4b:ca:5b:34:5c",
        "scope":["exact provisional candidate one install"],
        "candidate_install_limit":1,"recovery_install_limit":1}
    with tempfile.TemporaryDirectory(prefix="provisional-attempt-rebind-",dir=ROOT) as td:
        root=pathlib.Path(td); out=root/"out";out.mkdir()
        preflight=out/"FRESH_PRELIVE_READONLY.json";preflight.write_text('{"read_only":true}\n')
        state_path=root/"state.json"
        pending={"schema":"hbnf-pending-provisional-candidate-v1",
            "candidate_release_id":profile.release_id,"candidate_sha256":profile.sha256,
            "authorization_id":auth["authorization_id"],"candidate_install_attempts_used":0,
            "recovery_attempts_used":0,"preflight_sha256":hashlib.sha256(preflight.read_bytes()).hexdigest()}
        old={"candidate_release_id":txn.RELEASE,"candidate_sha256":txn.CANDIDATE_SHA,
            "candidate_attempts_used":1,"recovery_attempts_used":0,"status":"OLD_F89_CONSUMED"}
        state_path.write_text(json.dumps({"live_mutation_authorized":True,
            "live_authorization_binding":auth,"live_mutation_authorization":old,
            "execution_cursor":{"pending_provisional_candidate":pending}}))
        port=txn.LivePort(root/"admission.json",capsule,root/"proof.json",out,profile)
        port.admission={"fresh_owner_authorization":auth};port.state_path=state_path
        port.owner_brightness_baseline={"matrixBrightness":66,"auxBrightness":68,"vibe":5}
        port.consume_install_attempt()
        after=json.loads(state_path.read_text())
        assert after["execution_cursor"]["pending_provisional_candidate"]["candidate_install_attempts_used"]==1
        assert after["live_mutation_authorization"]==old
        port.consume_recovery_attempt()
        after=json.loads(state_path.read_text())
        assert after["execution_cursor"]["pending_provisional_candidate"]["recovery_attempts_used"]==1
        assert after["live_mutation_authorization"]==old


def test_final_readonly_preflight_does_not_invalidate_admitted_receipt():
    workflow_path=ROOT/"platform/workflows/phase2-provisional-release.json"
    capsule=pathlib.Path(tempfile.mkdtemp())/"capsule.json"
    capsule.write_text(json.dumps({"schema":"local-roots-execution-capsule-v1",
        "workflow_id":"phase2-provisional-release",
        "workflow_source":{"path":"platform/workflows/phase2-provisional-release.json",
            "sha256":txn.sha(workflow_path)}}))
    profile=txn.load_candidate_profile(capsule)
    with tempfile.TemporaryDirectory(prefix="provisional-final-preflight-",dir=ROOT) as td:
        out=pathlib.Path(td); admitted=out/"FRESH_PRELIVE_READONLY.json"
        original=b'{"admission_bound_receipt":true}\n';admitted.write_bytes(original)
        port=txn.LivePort(out/"admission.json",capsule,out/"proof.json",out,profile)
        port.admission={"fresh_owner_authorization":{}}
        previous=txn.preflight
        captured={"pass":True,"brightness_baseline":{"runtime":{"matrixBrightness":66,"auxBrightness":68,"vibe":5}}}
        def fake_preflight(candidate,request_counter=None,receipt_name="FRESH_PRELIVE_READONLY.json"):
            assert receipt_name=="PREINSTALL_FINAL_READONLY.json"
            (out/receipt_name).write_text(json.dumps(captured)+"\n")
            return captured
        txn.preflight=fake_preflight
        try: result=port.preflight()
        finally: txn.preflight=previous
        assert result==captured and admitted.read_bytes()==original
        assert json.loads((out/"PREINSTALL_FINAL_READONLY.json").read_text())==captured
        assert port.owner_brightness_baseline==captured["brightness_baseline"]["runtime"]


def test_cleanup_accepts_only_exact_owner_or_smoke_settings():
    owner={"matrixBrightness":66,"auxBrightness":68,"vibe":5}
    assert txn.provisional_smoke_restore_state_safe({"runtime":owner,
        "persisted":{"matrixBrightness":44,"auxBrightness":255,"vibe":0}},owner)
    assert txn.provisional_smoke_restore_state_safe({"runtime":{"matrixBrightness":44,"auxBrightness":68,"vibe":0},
        "persisted":owner},owner)
    assert not txn.provisional_smoke_restore_state_safe({"runtime":{"matrixBrightness":255,"auxBrightness":68,"vibe":5},
        "persisted":owner},owner)
    assert not txn.provisional_smoke_restore_state_safe({"runtime":owner,
        "persisted":{"matrixBrightness":44,"auxBrightness":200,"vibe":0}},owner)
    assert txn.provisional_restore_requires_persist_nudge({"runtime":owner,
        "persisted":{"matrixBrightness":44,"auxBrightness":255,"vibe":0}},owner)
    assert not txn.provisional_restore_requires_persist_nudge({"runtime":owner,"persisted":owner},owner)
    retry={"status":"PROVISIONAL_CLEANUP_AUTHORIZED_PENDING","settings_restore_attempts_used":1,
        "candidate_install_attempts_used":1,"recovery_attempts_used":0,"cleanup_result_sha256":"a"*64}
    assert txn.provisional_cleanup_retry_allowed(retry)
    retry["candidate_install_attempts_used"]=2
    assert not txn.provisional_cleanup_retry_allowed(retry)


if __name__=="__main__":
    for name,value in sorted(globals().copy().items()):
        if name.startswith("test_") and callable(value):value()
    print("PASS: exact candidate/target binding, one-attempt install, fresh settings capture, interruption/readback resolution, one R4 recovery, and 5-minute smoke fail closed")
