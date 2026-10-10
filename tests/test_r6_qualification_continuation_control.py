#!/usr/bin/env python3
"""Fail-closed tests for continuing qualification after a late OTA reboot."""
import copy
import importlib.util
import json
import pathlib

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("hbnf_control",ROOT/"scripts/hbnf_control.py")
control=importlib.util.module_from_spec(spec); spec.loader.exec_module(control)

def base():
    state=json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text())
    manifest=json.loads((ROOT/"evidence/cart2-r6-audio-cache-20261010/R6_LIVE_APPROVED_ADMISSION.json").read_text())
    receipt="evidence/cart2-r6-audio-cache-20261010/live-qualification/INSTALLED_RUNTIME_RECONCILIATION.json"
    receipt_sha=control.sha256_file(ROOT/receipt)
    manifest["stage"]="LIVE_QUALIFICATION"
    manifest["identities"]["expected_installed_release"]=manifest["identities"]["candidate_release_id"]
    manifest["identities"]["expected_installed_bin_sha256"]=manifest["identities"]["candidate_bin_sha256"]
    manifest["checks"]["preflight_read_only_hardware_state_and_identity"]={"pass":True,"evidence_file":receipt,"sha256":receipt_sha}
    for key in ("consumed_exact_candidate_install_receipt","fresh_installed_candidate_runtime_identity"):
        manifest["checks"][key]={"pass":True,"evidence_file":receipt,"sha256":receipt_sha}
    rb="evidence/cart2-r7-performance-repair-20261009/artifact/hbnf-matrix-foundation-r4-exact.bin"
    manifest["checks"]["exact_recovery_bytes_available"]={"pass":True,"evidence_file":rb,"sha256":control.sha256_file(ROOT/rb)}
    dry="evidence/cart2-r6-audio-cache-20261010/offline-dryrun/R6_TRANSACTION_DRYRUN.json"
    dry_sha=control.sha256_file(ROOT/dry)
    for key in ("all_historical_host_failures_replayed","entire_release_transaction_dryrun","launcher_rejects_invalid_manifest_before_device_access"):
        manifest["checks"][key]={"pass":True,"evidence_file":dry,"sha256":dry_sha}
    return state,manifest

def main():
    state,manifest=base()
    assert control.release_admission_errors(control.load(control.DEFAULT_MODEL),state,manifest,"LIVE_QUALIFICATION")==[]
    stale=copy.deepcopy(state)
    stale["installed_release"]="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
    stale["installed_firmware_sha256"]="338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
    stale["r6_audio_cache_successor"]["conditional_authority"]["status"]="OTA_NOT_INSTALLED_R4_REMAINS_NO_RETRY"
    reconciled=control.reconcile_installed_r6(stale,"evidence/cart2-r6-audio-cache-20261010/live-qualification/INSTALLED_RUNTIME_RECONCILIATION.json")
    assert reconciled["installed_release"]==manifest["identities"]["candidate_release_id"]
    assert reconciled["live_mutation_authorization"]["operation_scope"]=="QUALIFICATION_ONLY"
    bad=copy.deepcopy(stale); badrec=json.loads((ROOT/"evidence/cart2-r6-audio-cache-20261010/live-qualification/INSTALLED_RUNTIME_RECONCILIATION.json").read_text()); badrec["candidate"]["release_id"]="R4"
    original_installed=bad["installed_release"]
    import tempfile
    with tempfile.TemporaryDirectory(prefix="r6-bad-reconcile-") as tmp:
        rp=pathlib.Path(tmp)/"bad.json";rp.write_text(json.dumps(badrec))
        try: control.reconcile_installed_r6(bad,rp)
        except ValueError: pass
        else: raise AssertionError("mismatched runtime identity must fail closed")
    assert bad["installed_release"]==original_installed
    failures=[]
    for mutate in (
        lambda s,m:s["live_mutation_authorization"].update(operation_scope="INSTALL"),
        lambda s,m:s["r6_audio_cache_successor"]["conditional_authority"].update(candidate_attempts_used=0),
        lambda s,m:m["identities"].update(expected_installed_bin_sha256="0"*64),
        lambda s,m:s["r6_audio_cache_successor"]["conditional_authority"].update(status="CLOSED"),
    ):
        s,m=copy.deepcopy(state),copy.deepcopy(manifest); mutate(s,m)
        errors=control.release_admission_errors(control.load(control.DEFAULT_MODEL),s,m,"LIVE_QUALIFICATION")
        assert errors, (mutate,errors); failures.append(errors)
    print("PASS: qualification continuation admission accepts only the consumed exact candidate with remaining recovery and rejects install scope, unconsumed attempt, identity mismatch, and closed transaction")

if __name__=="__main__": main()
