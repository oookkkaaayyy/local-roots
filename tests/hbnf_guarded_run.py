#!/usr/bin/env python3
import json, pathlib, shutil, subprocess, sys, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
guard=ROOT/"scripts/hbnf_guarded_run.py"
guard_source=guard.read_text()
assert "--capsule" in guard_source
assert "--prelive-proof" in guard_source
assert '"prelive-check"' in guard_source

with tempfile.TemporaryDirectory() as td:
    tmp=pathlib.Path(td)
    (tmp/"scripts").mkdir()
    (tmp/"config").mkdir()
    copied_guard=tmp/"scripts/hbnf_guarded_run.py"
    shutil.copy2(guard,copied_guard)
    shutil.copy2(ROOT/"config/HBNF_CONTROL_MODEL.json",tmp/"config/HBNF_CONTROL_MODEL.json")
    state=json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text())
    state["lifecycle_state"]="DIAGNOSTIC_ACTIVE"
    state["live_mutation_authorized"]=False
    (tmp/"config/HBNF_CONTROL_STATE.json").write_text(json.dumps(state))

    def run(*args):
        return subprocess.run([sys.executable,str(copied_guard),*args],capture_output=True,text=True)

    p=run("--require-state","FOUNDATION_QUALIFIED","--",sys.executable,"-c","print('SHOULD_NOT_RUN')")
    assert p.returncode!=0
    assert "BLOCKED" in (p.stdout+p.stderr)
    assert "SHOULD_NOT_RUN" not in p.stdout

    p=run("--require-state","DIAGNOSTIC_ACTIVE","--",sys.executable,"-c","print('SAFE_READ_ONLY_RUN')")
    assert p.returncode==0,(p.stdout,p.stderr)
    assert "SAFE_READ_ONLY_RUN" in p.stdout

    p=run("--require-state","DIAGNOSTIC_ACTIVE","--mutation","--",sys.executable,"-c","print('MUTATION')")
    assert p.returncode!=0
    assert "live mutation" in (p.stdout+p.stderr)
    assert "MUTATION" not in p.stdout

# Live mutation must also be bound to a current, exact LIVE_APPROVED admission
# before any command (including a device request) can run.
with tempfile.TemporaryDirectory(prefix="hbnf_guard_admission_") as td:
    tmp=pathlib.Path(td)
    (tmp/"scripts").mkdir(); (tmp/"config").mkdir()
    shutil.copy2(guard,tmp/"scripts/hbnf_guarded_run.py")
    shutil.copy2(ROOT/"scripts/hbnf_control.py",tmp/"scripts/hbnf_control.py")
    shutil.copy2(ROOT/"config/HBNF_CONTROL_MODEL.json",tmp/"config/HBNF_CONTROL_MODEL.json")
    state=json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text())
    state["lifecycle_state"]="PHASE2_INTEGRATING"
    state["live_mutation_authorized"]=True
    (tmp/"config/HBNF_CONTROL_STATE.json").write_text(json.dumps(state))
    # The platform checks are isolated stubs: this test proves admission ordering
    # and command gating without accessing a device or external service.
    platform=tmp/"scripts/platform.py"
    platform.write_text("import sys\nprint('STUB_PLATFORM_PASS')\nsys.exit(0)\n")
    artifact=tmp/"candidate.bin"; artifact.write_bytes(b"test candidate bytes")
    rollback=tmp/"rollback.bin"; rollback.write_bytes(b"test rollback bytes")
    evidence=tmp/"proof.json"; evidence.write_text(json.dumps({"fixture":True})+"\n")
    digest=lambda path: __import__("hashlib").sha256(path.read_bytes()).hexdigest()
    required=(
        "device_and_source_authority_reconciled",
        "fully_local_pinned_build_toolchain",
        "known_good_compiler_entry_smoke",
        "exact_source_dependency_generated_input_closure",
        "compiled_embedded_candidate_id_and_sha",
        "flash_and_ram_headroom",
        "committed_feature_scope_preserved",
        "all_historical_host_failures_replayed",
        "entire_release_transaction_dryrun",
        "frozen_performance_soak_and_restore_procedure",
        "rollback_artifact_hash_verified",
        "launcher_rejects_invalid_manifest_before_device_access",
        "matched_tails_off_test_plan",
        "preflight_read_only_hardware_state_and_identity",
    )
    admission={
        "schema":"hbnf-cart2-release-admission-v1",
        "stage":"LIVE_APPROVED",
        "outcome":"PASS",
        "fresh_owner_authorization":"synthetic host-test authorization",
        "identities":{
            "candidate_release_id":"test-candidate-r1",
            "source_commit":"0123456789abcdef0123456789abcdef01234567",
            "candidate_bin_path":str(artifact),
            "candidate_bin_sha256":digest(artifact),
            "rollback_bin_path":str(rollback),
            "rollback_bin_sha256":digest(rollback),
            "expected_installed_release":state["installed_release"],
            "expected_installed_bin_sha256":state["installed_firmware_sha256"],
        },
        "checks":{key:{"pass":True,"evidence_file":str(evidence),"sha256":digest(evidence)} for key in required},
    }
    admission_path=tmp/"admission.json"
    admission_path.write_text(json.dumps(admission))
    marker=tmp/"device_request.marker"
    child=[sys.executable,"-c",f"open({str(marker)!r},'w').write('ran')"]
    base=[sys.executable,str(tmp/"scripts/hbnf_guarded_run.py"),"--require-state","PHASE2_INTEGRATING","--mutation",
          "--capsule","fixture-capsule.json","--prelive-proof","fixture-prelive.json"]

    # Missing admission is rejected before child execution.
    p=subprocess.run(base+["--",*child],capture_output=True,text=True)
    assert p.returncode!=0 and "requires --admission" in (p.stdout+p.stderr)
    assert not marker.exists(),"child/device request ran without admission"

    # Malformed admission is rejected before child execution.
    malformed=tmp/"malformed.json"; malformed.write_text('{"schema":"wrong"}')
    p=subprocess.run(base+["--admission",str(malformed),"--",*child],capture_output=True,text=True)
    assert p.returncode!=0 and "LIVE_APPROVED release admission failed" in (p.stdout+p.stderr)
    assert not marker.exists(),"child/device request ran with malformed admission"

    # A cryptographically intact but stale identity/fence prestate is rejected.
    stale=json.loads(json.dumps(admission))
    stale["identities"]["expected_installed_release"]="older-baseline"
    stale_path=tmp/"stale.json"; stale_path.write_text(json.dumps(stale))
    p=subprocess.run(base+["--admission",str(stale_path),"--",*child],capture_output=True,text=True)
    assert p.returncode!=0 and "installed release differs" in (p.stdout+p.stderr)
    assert not marker.exists(),"child/device request ran with stale admission"

    # A valid exact admission passes all pre-child checks and permits the stub child.
    p=subprocess.run(base+["--admission",str(admission_path),"--",*child],capture_output=True,text=True)
    assert p.returncode==0,(p.stdout,p.stderr)
    assert "CONTROL_PLANE_PASS state=PHASE2_INTEGRATING mutation=True" in p.stdout
    assert marker.read_text()=="ran"

print("PASS: guarded execution blocks wrong-state/unauthorized mutation; exact LIVE_APPROVED admission rejects missing, malformed, and stale identities before child execution")
