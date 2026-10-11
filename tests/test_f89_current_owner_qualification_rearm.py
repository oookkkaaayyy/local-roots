#!/usr/bin/env python3
"""Exact, fail-closed host tests for the currently authorized f89 continuation."""
import copy
import importlib.util
import json
import pathlib
import shutil
import tempfile
import time

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("hbnf_control",ROOT/"scripts/hbnf_control.py")
control=importlib.util.module_from_spec(spec);spec.loader.exec_module(control)

def proof_for(state):
    return {
        "schema":"hbnf-cart2-qualification-prelive-v1","captured_unix":time.time(),"pass":True,
        "operation_scope":"QUALIFICATION_ONLY","candidate_release_id":state["installed_release"],
        "candidate_sha256":state["installed_firmware_sha256"],"candidate_attempts_used":1,
        "recovery_attempts_used":0,"candidate_install_permitted":False,"read_only":True,
        "device_mutations":0,"host_on_ac":True,"cart_lan_interface":"en0",
        "owner_brightness_baseline":{"matrixBrightness":147,"auxBrightness":255,"vibe":0},
        "owner_settings_restore_required":True,
        "matrix":{"release_id":state["installed_release"],"candidate_sha256":state["installed_firmware_sha256"],
            "mac":"70:4b:ca:5b:34:5c","brightness":44,"on":True,"diagnostic_off":True,"telemetry_off":True},
        "brightness_baseline":{"runtime":{"matrixBrightness":44,"auxBrightness":255,"vibe":0},
            "persisted":{"matrixBrightness":44,"auxBrightness":255,"vibe":1}},
        "aux":{"live":True,"mode":"DDP","source":"192.168.77.10","led_count":22,"on":True,"lor":0},
        "rollback":{"sha256":"338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c",
            "opal_ledger":"55 hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1 338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"},
        "single_worker":{"pass":True,"worker_count":1,"conflicting_pids":[]},
    }

def main():
    state=control.load(control.DEFAULT_STATE)
    state["live_mutation_authorized"]=False
    state["live_mutation_authorization"]["authorized"]=False
    binding=state["live_authorization_binding"]
    qual_root=(ROOT/"evidence/cart2-r6-audio-cache-20261010/live-qualification").resolve()
    tmp=pathlib.Path(tempfile.mkdtemp(prefix="f89-owner-continuation-test-",dir=qual_root))
    try:
        proof=proof_for(state)
        prelive=tmp/"QUALIFICATION_PRELIVE_READONLY.json"
        prelive.write_text(json.dumps(proof))
        owner_receipt={"binding":binding,"continuation_authorization":{
            "authorization_id":"OWNER-20261011-CART2-F89-QUALIFICATION-CONTINUATION-01",
            "source_message_ref":"Direct user instruction in this conversation, 2026-10-11: CART 2.0 — FINISH QUALIFICATION AND RELEASE FOR FIELD TESTING.",
            "scope":"QUALIFICATION_ONLY_FOR_EXACT_INSTALLED_F89_ONE_SOAK_NO_REINSTALL",
            "candidate_sha256":state["installed_firmware_sha256"],
            "rollback_sha256":"338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c",
            "matrix_mac":"70:4b:ca:5b:34:5c",
            "owner_settings_baseline":{"matrixBrightness":147,"auxBrightness":255,"vibe":0},
            "candidate_install_permitted":False,"soak_seconds":5400,"exact_r4_recovery_attempts":1}}
        authpath=tmp/"CONTINUATION_AUTHORIZATION.json"
        authpath.write_text(json.dumps(owner_receipt))

        resumed=control.reconcile_installed_qualification(copy.deepcopy(state),prelive,authpath)
        assert resumed["live_mutation_authorized"] is True
        assert resumed["live_mutation_authorization"]["operation_scope"]=="QUALIFICATION_ONLY"
        assert resumed["live_mutation_authorization"]["candidate_install_permitted"] is False
        assert resumed["live_mutation_authorization"]["owner_brightness_baseline"]==owner_receipt["continuation_authorization"]["owner_settings_baseline"]

        manifest=control.load(ROOT/"evidence/cart2-r6-audio-cache-20261010/live-qualification/f89-field-reauthorization-20261011/LIVE_APPROVED_ADMISSION.json")
        manifest["stage"]="LIVE_QUALIFICATION"
        candidate=manifest["identities"]["candidate_release_id"]
        sha=manifest["identities"]["candidate_bin_sha256"]
        manifest["identities"]["expected_installed_release"]=candidate
        manifest["identities"]["expected_installed_bin_sha256"]=sha
        prelive_rel=str(prelive.relative_to(ROOT))
        prelive_sha=control.sha256_file(prelive)
        for key in ("preflight_read_only_hardware_state_and_identity",
                    "consumed_exact_candidate_install_receipt",
                    "fresh_installed_candidate_runtime_identity"):
            manifest["checks"][key]={"pass":True,"evidence_file":prelive_rel,"sha256":prelive_sha}
        recovery="evidence/cart2-r7-performance-repair-20261009/artifact/hbnf-matrix-foundation-r4-exact.bin"
        manifest["checks"]["exact_recovery_bytes_available"]={"pass":True,"evidence_file":recovery,
            "sha256":control.sha256_file(ROOT/recovery)}
        admission_errors=control.release_admission_errors(control.load(control.DEFAULT_MODEL),resumed,manifest,"LIVE_QUALIFICATION")
        assert admission_errors==[],admission_errors

        bad_auth=copy.deepcopy(owner_receipt)
        bad_auth["continuation_authorization"]["candidate_install_permitted"]=True
        badpath=tmp/"BAD_AUTHORIZATION.json";badpath.write_text(json.dumps(bad_auth))
        try:control.reconcile_installed_qualification(copy.deepcopy(state),prelive,badpath)
        except ValueError:pass
        else:raise AssertionError("continuation must reject any candidate-install permission")

        bad_proof=copy.deepcopy(proof);bad_proof["brightness_baseline"]["persisted"]["auxBrightness"]=254
        badpre=tmp/"BAD_PREFLIGHT.json";badpre.write_text(json.dumps(bad_proof))
        try:control.reconcile_installed_qualification(copy.deepcopy(state),badpre,authpath)
        except ValueError:pass
        else:raise AssertionError("continuation must reject an AUX brightness mismatch")
        print("PASS: exact f89 continuation admits only the direct owner scope, current R4 recovery, and bound settings repair; install and bad-state paths reject")
    finally:
        shutil.rmtree(tmp,ignore_errors=True)

if __name__=="__main__":main()
