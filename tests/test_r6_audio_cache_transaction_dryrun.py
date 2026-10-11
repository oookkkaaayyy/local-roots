#!/usr/bin/env python3
"""Exercise the production R6 transaction coordinator without device I/O."""
from __future__ import annotations

import importlib.util
import json
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/hbnf_r6_audio_cache_live_transaction.py"
spec = importlib.util.spec_from_file_location("r6_audio_cache_transaction", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


class FakePort:
    def __init__(self, *, admission=True, stage=True, installed=True,
                 qualification=True, recovery=True, device_failure=False,
                 candidate=None, brightness_setup=True, brightness_restore=True):
        self.candidate = candidate or module.LEGACY_R6_PROFILE
        self.admission = admission
        self.stage = stage
        self.installed = installed
        self.qualification = qualification
        self.recovery_ok = recovery
        self.device_failure = device_failure
        self.brightness_setup_ok=brightness_setup
        self.brightness_restore_ok=brightness_restore
        self.device_requests = 0
        self.install_attempts = 0
        self.recovery_attempts = 0
        self.closed = False
        self.admission_stage = None
        self.outdir = None
        self.events = []

    def admit(self, stage="LIVE_APPROVED"):
        if not self.admission:
            raise RuntimeError("invalid-live-admission")
        self.admission_stage = stage

    def verify_local_artifacts(self):
        pass

    def preflight(self):
        self.device_requests += 6
        return {"pass": True,"brightness_baseline":{"runtime":{"matrixBrightness":52,"auxBrightness":245,"vibe":0}}}

    def preflight_candidate(self):
        self.device_requests += 5
        return {"pass": True,"release_id":self.candidate.release_id,
            "brightness_baseline":{"runtime":{"matrixBrightness":52,"auxBrightness":245,"vibe":0},
                "persisted":{"matrixBrightness":52,"auxBrightness":245,"vibe":0}}}

    def apply_qualification_brightness(self, baseline):
        self.events.append("brightness_setup")
        self.device_requests += 1
        assert baseline["matrixBrightness"] == 52
        return {"verified": self.brightness_setup_ok, "target_matrix_brightness": 44}

    def restore_qualification_brightness(self, baseline):
        self.events.append("brightness_restore")
        self.device_requests += 1
        assert baseline["matrixBrightness"] == 52
        return {"verified": self.brightness_restore_ok, "target_matrix_brightness": 52}

    def stage_candidate(self):
        self.device_requests += 1  # Temporary Opal staging, not a Matrix request.
        if not self.stage:
            raise RuntimeError("stage-hash-mismatch")
        return {"sha256": self.candidate.sha256, "bytes": self.candidate.size_bytes}

    def consume_install_attempt(self):
        self.install_attempts += 1

    def upload_candidate(self):
        self.device_requests += 1
        return {"confirmed": self.installed}

    def resolve_runtime(self, upload):
        if self.installed is None:
            return {"installed": None, "error": "readback-unavailable"}
        if not self.installed:
            return {"installed": False, "runtime": {"release_id": module.R4}}
        return {"installed": True, "runtime": {"release_id": self.candidate.release_id}}

    def qualify(self):
        self.events.append("qualify")
        if self.qualification:
            return {"passed": True, "report": {"status": "PASS"}}
        if self.device_failure:
            return {"passed": False, "abort": {"run_error": "kernel-0-kernel-gate-failed"}}
        return {"passed": False, "abort": {"run_error": "collector timeout; no performance conclusion"}}

    def recover_r4(self):
        self.recovery_attempts += 1
        if self.recovery_attempts > 1:
            raise RuntimeError("recovery-limit")
        if not self.recovery_ok:
            raise RuntimeError("R4-readback-not-proven")
        self.device_requests += 3
        return {"status": "R4_READBACK_VERIFIED", "runtime": {"release_id": module.R4}}

    def close(self, result):
        self.closed = True


class SuccessorAdmissionFakePort(FakePort):
    """Route candidate-specific offline identity checks through the real coordinator."""
    def __init__(self, admission_path):
        super().__init__(candidate=module.SUCCESSOR_PROFILE)
        self.admission_path = pathlib.Path(admission_path)

    def admit(self, stage="LIVE_APPROVED"):
        admission=json.loads(self.admission_path.read_text())
        module.verify_candidate_binding(admission,module.SUCCESSOR_PROFILE)
        self.admission_stage = stage


def run_case(name, port, expected_status, installs, recoveries, min_requests=0):
    result = module.coordinate(port)
    assert result["status"] == expected_status, (name, result)
    assert result["candidate_install_attempts"] == installs, (name, result)
    assert result["recovery_attempts"] == recoveries, (name, result)
    assert result["device_requests"] == port.device_requests, (name, result)
    assert port.closed
    assert port.device_requests >= min_requests
    assert port.install_attempts <= 1 and port.recovery_attempts <= 1
    return result


def main():
    # The outer supervisor must not kill the sweep before its restore finally;
    # the full 5400-second soak remains part of the exact command.
    port = module.LivePort("unused-admission", "unused-capsule", "unused-proof")
    with tempfile.TemporaryDirectory() as td:
        port.outdir = pathlib.Path(td)
        original_command = module.qualification_command
        original_subprocess_run = module.subprocess.run
        calls = []
        def qualification_command(_outdir,_profile=None):
            return ["qualification-runner", "--soak-seconds", "5400"]
        def subprocess_run(argv, **kwargs):
            calls.append((list(argv), dict(kwargs)))
            return subprocess.CompletedProcess(argv, 0, stdout="done", stderr="")
        try:
            module.qualification_command = qualification_command
            module.subprocess.run = subprocess_run
            result = port.qualify()
        finally:
            module.qualification_command = original_command
            module.subprocess.run = original_subprocess_run
        assert result["passed"] is True
        assert calls[0][0][-1] == "5400"
        assert "timeout" not in calls[0][1], "outer timeout can kill the child before renderer restoration"

    cases = []

    # Candidate successor binding is rehearsed through the same transaction
    # coordinator with a fake port. Missing or mismatched admissions fail
    # before preflight/staging, so the fake observes zero device requests.
    successor_ids = {
        "candidate_release_id": module.SUCCESSOR_RELEASE,
        "candidate_bin_sha256": module.SUCCESSOR_SHA,
        "candidate_bin_path": str(module.SUCCESSOR_BIN),
        "candidate_bin_size_bytes": module.SUCCESSOR_SIZE,
        "rollback_bin_sha256": module.R4_SHA,
        "rollback_bin_path": str(module.R4_BIN),
        "matrix_mac": "70:4b:ca:5b:34:5c",
    }
    with tempfile.TemporaryDirectory(prefix="r6-successor-admission-") as tmp:
        root = pathlib.Path(tmp)
        valid_path = root / "candidate-bound.json"
        valid_path.write_text(json.dumps({"identities": successor_ids}) + "\n")
        module.verify_candidate_binding({"identities":successor_ids},module.SUCCESSOR_PROFILE)

        # Exercise the existing transaction coordinator's complete fake-port
        # candidate path with the successor's exact identity. This verifies
        # only local orchestration; the port never performs real I/O and this
        # does not create LIVE_APPROVED admission or qualify the firmware.
        successor_success = SuccessorAdmissionFakePort(valid_path)
        passed = run_case("successor fake-port coordinator pass", successor_success,
                          "QUALIFIED_OBJECTIVE_GATES_PASS", 1, 0, 10)
        assert passed["candidate_release_id"] == module.SUCCESSOR_RELEASE
        assert passed["candidate_sha256"] == module.SUCCESSOR_SHA
        assert successor_success.install_attempts == 1
        assert successor_success.events.index("brightness_setup") < successor_success.events.index("qualify") < successor_success.events.index("brightness_restore")
        cases.append({"case": "exact successor fake-port transaction reaches qualification pass",
                      "pass": True, "result": passed,
                      "simulated_port_requests": successor_success.device_requests})

        successor_gate_fail = SuccessorAdmissionFakePort(valid_path)
        successor_gate_fail.qualification = False
        successor_gate_fail.device_failure = True
        recovered = run_case("successor fake-port gate failure recovers exact R4",
                             successor_gate_fail, "QUALIFICATION_FAILED_R4_RECOVERED", 1, 1, 13)
        assert recovered["candidate_sha256"] == module.SUCCESSOR_SHA
        assert recovered["recovery"]["runtime"]["release_id"] == module.R4
        cases.append({"case": "exact successor fake-port gate failure invokes exact R4 recovery once",
                      "pass": True, "result": recovered,
                      "simulated_port_requests": successor_gate_fail.device_requests})

        missing = SuccessorAdmissionFakePort(root / "missing.json")
        result = run_case("successor admission missing zero requests", missing,
                          "BLOCKED_OR_FAILED", 0, 0)
        assert missing.device_requests == 0
        cases.append({"case": "successor admission missing rejected before fake-port I/O",
                      "pass": True, "device_requests": 0})

        tampered_ids = dict(successor_ids, candidate_bin_sha256=module.CANDIDATE_SHA)
        tampered_path = root / "wrong-candidate.json"
        tampered_path.write_text(json.dumps({"identities": tampered_ids}) + "\n")
        wrong = SuccessorAdmissionFakePort(tampered_path)
        run_case("successor admission wrong artifact zero requests", wrong,
                 "BLOCKED_OR_FAILED", 0, 0)
        assert wrong.device_requests == 0
        cases.append({"case": "successor admission for prior artifact rejected before fake-port I/O",
                      "pass": True, "device_requests": 0})

    rejected = FakePort(admission=False)
    cases.append(run_case("invalid admission zero requests", rejected, "BLOCKED_OR_FAILED", 0, 0))
    assert rejected.device_requests == 0

    # Continuation is a separate qualification-only path and never installs.
    with tempfile.TemporaryDirectory(prefix="r6-qual-resume-") as tmp:
        resume=FakePort(); resume.outdir=pathlib.Path(tmp)
        result=module.coordinate_qualification(resume)
        assert result["status"]=="QUALIFIED_OBJECTIVE_GATES_PASS"
        assert result["candidate_install_attempts"]==0 and resume.install_attempts==0
        assert resume.admission_stage=="LIVE_QUALIFICATION" and resume.device_requests==7
        cases.append({"case":"qualification-only continuation has zero firmware installs","pass":True,"device_requests":resume.device_requests})

    stage_fail = FakePort(stage=False)
    cases.append(run_case("stage failure no Matrix post", stage_fail, "BLOCKED_OR_FAILED", 0, 0, 7))
    assert stage_fail.device_requests == 7  # six read-only checks plus Opal staging

    good = FakePort()
    cases.append(run_case("full objective pass", good, "QUALIFIED_OBJECTIVE_GATES_PASS", 1, 0, 10))

    unchanged = FakePort(installed=False)
    cases.append(run_case("upload response but R4 remains", unchanged,
             "OTA_NOT_INSTALLED_R4_REMAINS_NO_RETRY", 1, 0, 8))

    gate_fail = FakePort(qualification=False, device_failure=True)
    cases.append(run_case("frozen device gate failure", gate_fail,
             "QUALIFICATION_FAILED_R4_RECOVERED", 1, 1, 13))

    collector_fail = FakePort(qualification=False, device_failure=False)
    cases.append(run_case("host collector failure does not consume recovery", collector_fail,
             "QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED", 1, 0, 10))

    brightness_restore_fail=FakePort(brightness_restore=False)
    restore_result=run_case("unverified brightness restore invalidates qualification",brightness_restore_fail,
        "QUALIFICATION_BRIGHTNESS_RESTORE_FAILED",1,0,10)
    assert restore_result.get("captured_qualification_invalidated",{}).get("profiles_not_accepted") is True
    cases.append({"case":"candidate qualification rejected until exact owner brightness baseline restores","pass":True})

    brightness_setup_fail=FakePort(brightness_setup=False)
    setup_result=run_case("unverified brightness setup starts no profiles",brightness_setup_fail,
        "QUALIFICATION_BRIGHTNESS_SETUP_FAILED_NO_PROFILES",1,0,10)
    assert "qualify" not in brightness_setup_fail.events and "brightness_restore" in brightness_setup_fail.events
    cases.append({"case":"uncertain brightness setup is restored and no profile is accepted","pass":True})

    uncertain = FakePort(installed=None)
    cases.append(run_case("identity uncertainty uses one exact recovery", uncertain,
             "RUNTIME_IDENTITY_UNRESOLVED_R4_RECOVERED", 1, 1, 11))

    recovery_fail = FakePort(installed=None, recovery=False)
    cases.append(run_case("failed recovery stops without retry", recovery_fail,
             "RECOVERY_UNVERIFIED_STOP", 1, 1, 8))

    binding = {
        "authorization_id": "OWNER-TEST-EXACT-R6",
        "candidate_release_id": module.RELEASE,
        "candidate_bin_sha256": module.CANDIDATE_SHA,
        "rollback_bin_sha256": module.R4_SHA,
        "matrix_mac": "70:4b:ca:5b:34:5c",
        "candidate_install_limit": 1,
        "recovery_install_limit": 1,
    }
    with tempfile.TemporaryDirectory(prefix="r6-state-replay-",dir=ROOT) as tmp:
        root = pathlib.Path(tmp)
        state_path = root / "state.json"
        out = root / "out"
        out.mkdir()
        (out / "FRESH_PRELIVE_READONLY.json").write_text("{}\n")
        state_path.write_text(json.dumps({
        "live_mutation_authorized": True,
        "live_authorization_binding": binding,
        "live_mutation_authorization": {"candidate_attempts_used": 0},
            "r6_audio_cache_successor": {"conditional_authority": {
                "candidate_attempts_used": 0,
                "recovery_attempts_used": 0,
            }},
        }))
        real = module.LivePort(root / "admission.json", root / "capsule.json", root / "proof.json")
        real.admission = {"fresh_owner_authorization": binding}
        real.state_path = state_path
        real.outdir = out
        real.consume_install_attempt()
        consumed = json.loads(state_path.read_text())
        assert consumed["live_mutation_authorization"]["transaction_consumed"] is True
        assert consumed["live_mutation_authorization"]["hardware_writes_permitted_now"] is True
        assert consumed["r6_audio_cache_successor"]["conditional_authority"]["candidate_attempts_used"] == 0
        assert consumed["live_mutation_authorization"]["candidate_attempts_used"] == 1
        real.close({"status": "QUALIFIED_OBJECTIVE_GATES_PASS", "recovery": {}})
        closed = json.loads(state_path.read_text())
        assert closed["live_mutation_authorized"] is False
        assert closed["live_mutation_authorization"]["hardware_writes_permitted_now"] is False
        assert closed["live_mutation_authorization"]["transaction_consumed"] is True
        assert closed["live_mutation_authorization"]["current_gate"] == "QUALIFIED_OBJECTIVE_GATES_PASS"
        cases.append({"case": "exact authority durably consumed pre-request and closed post-transaction", "pass": True})

    # The R4 recovery limit must be persisted before the recovery transport can
    # issue its first request, and prior R6 attempt history remains untouched.
    with tempfile.TemporaryDirectory(prefix="successor-r4-consumption-",dir=ROOT) as tmp:
        root=pathlib.Path(tmp); state_path=root/"state.json"
        binding={"authorization_id":"OWNER-TEST-SUCCESSOR","candidate_release_id":module.SUCCESSOR_RELEASE,
            "candidate_bin_sha256":module.SUCCESSOR_SHA,"rollback_bin_sha256":module.R4_SHA,
            "matrix_mac":"70:4b:ca:5b:34:5c","candidate_install_limit":1,"recovery_install_limit":1}
        legacy_record={"status":"HISTORICAL_R6_FAILURE","conditional_authority":{"candidate_attempts_used":1,"recovery_attempts_used":1}}
        state={"live_mutation_authorized":True,"live_authorization_binding":binding,
            "live_mutation_authorization":{"candidate_release_id":module.SUCCESSOR_RELEASE,
                "candidate_sha256":module.SUCCESSOR_SHA,"rollback_sha256":module.R4_SHA,
                "candidate_attempts_used":1,"candidate_install_limit":1,"recovery_attempts_used":0,
                "recovery_install_limit":1},"r6_audio_cache_successor":legacy_record}
        state_path.write_text(json.dumps(state))
        port=module.LivePort(root/"admission.json",root/"capsule.json",root/"proof.json",candidate=module.SUCCESSOR_PROFILE)
        port.admission={"fresh_owner_authorization":binding}; port.state_path=state_path
        original_restore=module.restore_r4_once; entered=[]
        def observe_consumed(outdir):
            durable=json.loads(state_path.read_text())
            current=durable["live_mutation_authorization"]
            assert current["recovery_attempts_used"]==1
            assert current["status"]=="EXACT_R4_RECOVERY_ATTEMPT_CONSUMED"
            assert durable["r6_audio_cache_successor"]==legacy_record
            entered.append(True)
            return {"status":"R4_READBACK_VERIFIED"}
        module.restore_r4_once=observe_consumed
        try:
            result=port.recover_r4()
        finally:
            module.restore_r4_once=original_restore
        assert result["status"]=="R4_READBACK_VERIFIED" and entered==[True]
        closed_bytes=state_path.read_bytes()
        retry=module.LivePort(root/"admission.json",root/"capsule.json",root/"proof.json",candidate=module.SUCCESSOR_PROFILE)
        retry.admission={"fresh_owner_authorization":binding}; retry.state_path=state_path
        try:
            retry.recover_r4()
        except RuntimeError as exc:
            assert "authorization-or-attempt-binding-failed" in str(exc)
        else:
            raise AssertionError("persisted recovery attempt must reject a second recovery after host restart")
        assert state_path.read_bytes()==closed_bytes and entered==[True]
        cases.append({"case":"successor recovery attempt durably consumed before transport; historical R6 record unchanged","pass":True})

    # A qualification retry must write into a new evidence directory under
    # the exact run root and point control state at that run; it cannot reuse
    # the failed run or write evidence elsewhere.
    with tempfile.TemporaryDirectory(prefix="r6-qualification-output-") as tmp:
        root=pathlib.Path(tmp); new=module.OUT/("unit-output-"+root.name)
        try:
            module.prepare_qualification_output(root/"outside")
        except RuntimeError as exc:
            assert "inside the exact candidate qualification evidence directory" in str(exc)
        else:
            raise AssertionError("qualification output outside the evidence root must be rejected")
        old=module.OUT/"preserved-failure-fixture";old.mkdir(parents=True,exist_ok=True)
        sentinel=old/"FAILURE.json";sentinel.write_text("preserve\n")
        try:
            module.prepare_qualification_output(old)
        except RuntimeError as exc:
            assert "not empty" in str(exc)
        else:
            raise AssertionError("nonempty qualification output must be rejected")
        try:
            output=module.prepare_qualification_output(new)
            assert output==new.resolve() and sentinel.read_text()=="preserve\n"
        finally:
            import shutil
            shutil.rmtree(old,ignore_errors=True);shutil.rmtree(new,ignore_errors=True)
        cases.append({"case":"qualification retry requires a new empty in-root evidence directory","pass":True})

    successor_cases = [case for case in cases if case.get("case", "").startswith("exact successor fake-port")]
    assert len(successor_cases) == 2, "both exact-success and exact-R4-recovery successor replays are required"
    for case in successor_cases:
        result = case["result"]
        assert result["candidate_release_id"] == module.SUCCESSOR_RELEASE
        assert result["candidate_sha256"] == module.SUCCESSOR_SHA
        assert case["pass"] is True

    receipt = {
        "schema": "hbnf-r6-successor-transaction-rehearsal-v1",
        "candidate_release_id": module.SUCCESSOR_RELEASE,
        "candidate_sha256": module.SUCCESSOR_SHA,
        "launcher_candidate_selection": {
            "source": "checked phase2-live-qualification workflow capsule",
            "candidate_release_id": module.SUCCESSOR_RELEASE,
            "candidate_sha256": module.SUCCESSOR_SHA,
            "note": "The supported transaction launcher resolves candidate identity and adapter from the capsule-bound current workflow."
        },
        "successor_fake_port_cases": [case["case"] for case in successor_cases],
        "successor_fake_port_actual_device_calls": 0,
        "successor_fake_port_simulated_requests": (
            successor_success.device_requests + successor_gate_fail.device_requests
        ),
        "rollback_sha256": module.R4_SHA,
        "device_or_cloud_mutation": False,
        "cases": cases,
        "invalid_admission_device_requests": rejected.device_requests,
        "assertions": "PASS",
    }
    evidence = ROOT / "evidence/cart2-r6-compositor-hoist-20261011/SUCCESSOR_TRANSACTION_DRYRUN.json"
    evidence.parent.mkdir(parents=True, exist_ok=True)
    evidence.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")

    print("PASS: actual transaction coordinator replayed admission, stage, one install, readback, qualification, exact recovery, host failure, and recovery failure; invalid admission made zero device requests")


if __name__ == "__main__":
    main()
