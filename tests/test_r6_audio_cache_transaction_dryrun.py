#!/usr/bin/env python3
"""Exercise the production R6 transaction coordinator without device I/O."""
from __future__ import annotations

import importlib.util
import json
import pathlib
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/hbnf_r6_audio_cache_live_transaction.py"
spec = importlib.util.spec_from_file_location("r6_audio_cache_transaction", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


class FakePort:
    def __init__(self, *, admission=True, stage=True, installed=True,
                 qualification=True, recovery=True, device_failure=False):
        self.admission = admission
        self.stage = stage
        self.installed = installed
        self.qualification = qualification
        self.recovery_ok = recovery
        self.device_failure = device_failure
        self.device_requests = 0
        self.install_attempts = 0
        self.recovery_attempts = 0
        self.closed = False
        self.admission_stage = None
        self.outdir = None

    def admit(self, stage="LIVE_APPROVED"):
        if not self.admission:
            raise RuntimeError("invalid-live-admission")
        self.admission_stage = stage

    def verify_local_artifacts(self):
        pass

    def preflight(self):
        self.device_requests += 6
        return {"pass": True}

    def preflight_candidate(self):
        self.device_requests += 5
        return {"pass": True,"release_id":module.RELEASE}

    def stage_candidate(self):
        self.device_requests += 1  # Temporary Opal staging, not a Matrix request.
        if not self.stage:
            raise RuntimeError("stage-hash-mismatch")
        return {"sha256": module.CANDIDATE_SHA, "bytes": module.CANDIDATE_SIZE}

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
        return {"installed": True, "runtime": {"release_id": module.RELEASE}}

    def qualify(self):
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
    cases = []
    rejected = FakePort(admission=False)
    cases.append(run_case("invalid admission zero requests", rejected, "BLOCKED_OR_FAILED", 0, 0))
    assert rejected.device_requests == 0

    # Continuation is a separate qualification-only path and never installs.
    with tempfile.TemporaryDirectory(prefix="r6-qual-resume-") as tmp:
        resume=FakePort(); resume.outdir=pathlib.Path(tmp)
        result=module.coordinate_qualification(resume)
        assert result["status"]=="QUALIFIED_OBJECTIVE_GATES_PASS"
        assert result["candidate_install_attempts"]==0 and resume.install_attempts==0
        assert resume.admission_stage=="LIVE_QUALIFICATION" and resume.device_requests==5
        cases.append({"case":"qualification-only continuation has zero firmware installs","pass":True,"device_requests":resume.device_requests})

    stage_fail = FakePort(stage=False)
    cases.append(run_case("stage failure no Matrix post", stage_fail, "BLOCKED_OR_FAILED", 0, 0, 7))
    assert stage_fail.device_requests == 7  # six read-only checks plus Opal staging

    good = FakePort()
    cases.append(run_case("full objective pass", good, "QUALIFIED_OBJECTIVE_GATES_PASS", 1, 0, 8))

    unchanged = FakePort(installed=False)
    cases.append(run_case("upload response but R4 remains", unchanged,
             "OTA_NOT_INSTALLED_R4_REMAINS_NO_RETRY", 1, 0, 8))

    gate_fail = FakePort(qualification=False, device_failure=True)
    cases.append(run_case("frozen device gate failure", gate_fail,
             "QUALIFICATION_FAILED_R4_RECOVERED", 1, 1, 11))

    collector_fail = FakePort(qualification=False, device_failure=False)
    cases.append(run_case("host collector failure does not consume recovery", collector_fail,
             "QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED", 1, 0, 8))

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
    }
    with tempfile.TemporaryDirectory(prefix="r6-state-replay-") as tmp:
        root = pathlib.Path(tmp)
        state_path = root / "state.json"
        out = root / "out"
        out.mkdir()
        (out / "FRESH_PRELIVE_READONLY.json").write_text("{}\n")
        state_path.write_text(json.dumps({
            "live_mutation_authorized": True,
            "live_authorization_binding": binding,
            "live_mutation_authorization": {},
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
        assert consumed["r6_audio_cache_successor"]["conditional_authority"]["candidate_attempts_used"] == 1
        real.close({"status": "QUALIFIED_OBJECTIVE_GATES_PASS", "recovery": {}})
        closed = json.loads(state_path.read_text())
        assert closed["live_mutation_authorized"] is False
        assert closed["live_mutation_authorization"]["hardware_writes_permitted_now"] is False
        assert closed["live_mutation_authorization"]["transaction_consumed"] is True
        assert closed["live_mutation_authorization"]["current_gate"] == "QUALIFIED_OBJECTIVE_GATES_PASS"
        cases.append({"case": "exact authority durably consumed pre-request and closed post-transaction", "pass": True})

    # A qualification retry must write into a new evidence directory under
    # the exact run root and point control state at that run; it cannot reuse
    # the failed run or write evidence elsewhere.
    with tempfile.TemporaryDirectory(prefix="r6-qualification-output-") as tmp:
        root=pathlib.Path(tmp); new=module.OUT/("unit-output-"+root.name)
        try:
            module.prepare_qualification_output(root/"outside")
        except RuntimeError as exc:
            assert "inside the exact R6 qualification evidence directory" in str(exc)
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

    receipt = {
        "schema": "hbnf-r6-audio-cache-transaction-dryrun-v1",
        "candidate_release_id": module.RELEASE,
        "candidate_sha256": module.CANDIDATE_SHA,
        "rollback_sha256": module.R4_SHA,
        "device_or_cloud_mutation": False,
        "cases": cases,
        "invalid_admission_device_requests": rejected.device_requests,
        "assertions": "PASS",
    }
    evidence = ROOT / "evidence/cart2-r6-audio-cache-20261010/offline-dryrun/R6_TRANSACTION_DRYRUN.json"
    evidence.parent.mkdir(parents=True, exist_ok=True)
    evidence.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")

    print("PASS: actual transaction coordinator replayed admission, stage, one install, readback, qualification, exact recovery, host failure, and recovery failure; invalid admission made zero device requests")


if __name__ == "__main__":
    main()
