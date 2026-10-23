#!/usr/bin/env python3
import copy
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("hbnf_control", ROOT/"scripts/hbnf_control.py")
MOD=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)

def change_record(change_class, impact=None, evidence=None, change_id="fixture-change"):
    return {
        "schema":"hbnf-change-governance-v1",
        "change_id":change_id,
        "summary":"Deterministic governance test fixture",
        "change_class":change_class,
        "impact":impact or {"architecture":False,"new_dependency":False,"subjective_design":False,"bespoke":False,"unknown":False},
        "evidence":evidence or {},
    }

def scoped_evidence():
    return {"scoped_evidence":{
        "approved_architecture_reference":"approved-control-plane-v2",
        "affected_subsystem":"existing control validator",
        "evidence_sources":["existing control model"],
        "tests":["host regression fixture"],
        "rollback_reference":"revert the single source commit",
    }}

def full_evidence():
    return {
        "expert_basis":{
            "sources":[{"title":"Official platform documentation","authority_type":"OFFICIAL_PRIMARY_DOCUMENTATION","locator":"https://example.test/docs","relevance":"Defines the supported native capability."},{"title":"Example component upstream release","authority_type":"UPSTREAM_MAINTAINER_GUIDANCE","locator":"https://example.test/project/releases/v2.4.1","relevance":"Pins the mature component version and source identity."}],
            "findings":[{"kind":"ESTABLISHED_FACT","statement":"The current platform already exposes the capability.","source_ref":"Official platform documentation"},{"kind":"INFERENCE","statement":"Reusing the existing validator minimizes maintenance.","source_ref":"Official platform documentation"}],
        },
        "native_capability_check":{"evaluated":True,"capability":"existing platform validator","result":"INSUFFICIENT","source_refs":["Official platform documentation"],"rationale":"The native tool supports the core capability but lacks the project-specific cross-field check."},
        "mature_external_component_check":{"relevant":True,"alternatives":[{"name":"example-component","maturity":"established releases","maintenance":"actively maintained","compatibility":"compatible with current Python runtime","provenance":"Example component upstream release","license":"MIT","documentation_support":"official documentation","dependency_burden":"one pinned runtime dependency","disposition":"REJECTED","rationale":"Structural validation fits, but cross-field evidence semantics still require project-specific checks."}]},
        "decision_rationale":{"selected_path":"extend existing control validator","alternatives_considered":["existing validator","JSON Schema library","new standalone validator"],"challenger_analysis":"The standard schema route covers object structure; it does not remove contextual source, approval, and lifecycle checks.","tradeoffs":"A small amount of code remains in the existing validator; no new runtime dependency is introduced.","simplest_robust_solution":"Reuse the existing control-plane entrypoint and tests.","critical_path_reason":"The validator already gates lifecycle receipts and does not change product scope."},
        "reproducibility":{"source_inputs":["config/HBNF_CONTROL_MODEL.json","scripts/hbnf_control.py"],"version_pins":["repository commit identity"],"configuration_inputs":["change record JSON"],"build_inputs":["Python standard library only"],"tooling_identity":["python3 runtime; git repository source"]},
        "rollback_or_exit_path":{"rollback_path":"revert the governance source commit","uninstall_or_removal_path":"remove the added control-model contract and validator function by revert","replacement_path":"adopt a compatible standard validator after a measured dependency review","recovery_method":"restore the prior commit","prior_known_good_state":"authoritative branch HEAD before this change"},
    }

def architectural_record(change_id="fixture-architecture"):
    return change_record("ARCHITECTURAL_DECISION",{"architecture":True,"new_dependency":False,"subjective_design":False,"bespoke":False,"unknown":False},full_evidence(),change_id)

class ExecutionSystemTests(unittest.TestCase):
    def setUp(self):
        self.model=MOD.load(ROOT/"config/HBNF_CONTROL_MODEL.json")
        self.state=MOD.load(ROOT/"config/HBNF_CONTROL_STATE.json")

    def test_current_authority_is_valid(self):
        self.assertEqual(MOD.validate_model(self.model),[])
        self.assertEqual(MOD.validate_state(self.model,self.state),[])

    def test_reference_staging_gates_are_non_operational(self):
        gates=MOD.load(ROOT/"config/HBNF_CART2_STAGING_GATES.json")
        self.assertEqual(gates["mode"],"REFERENCE_ONLY__NON_OPERATIONAL")
        self.assertTrue(gates["operational_use_forbidden"])
        self.assertEqual(
            gates["operational_authority"],
            "REFERENCE_ONLY__USE_HBNF_CONTROL_MODEL_STATE"
        )

    def test_host_failure_does_not_invalidate_firmware_gates(self):
        p=MOD.failure_policy(self.model,"HOST_HARNESS")
        self.assertEqual(p["invalidates"],["host_harness_result_only"])
        self.assertNotIn("foundation_soak_passed",p["invalidates"])
        self.assertNotIn("all_kernel_sweep_passed",p["invalidates"])

    def test_change_impact_is_selective(self):
        p=MOD.impact_for_change(self.model,"MISSION_CONTROL_OR_PWA")
        self.assertFalse(p["foundation_requalification"])
        p=MOD.impact_for_change(self.model,"MATRIX_RENDERER_OR_SCHEDULER")
        self.assertTrue(p["foundation_requalification"])

    def test_parallel_lanes_fail_closed_in_phase2(self):
        state=copy.deepcopy(self.state)
        state["lifecycle_state"]="PHASE2_INTEGRATING"
        state["execution_cursor"]["current_lifecycle_state"]="PHASE2_INTEGRATING"
        state["execution_cursor"]["current_transition"]="T4_PHASE2_INTEGRATION"
        for lane in state["lane_execution"]["lanes"].values():
            lane["status"]="READY_OFFLINE_AT_FOUNDATION_SOAK"
        p=MOD.parallelism_status(self.model,state)
        self.assertFalse(p["pass"])
        self.assertEqual(len(p["violations"]),4)

    def test_failure_tracking_is_classified_and_nonretroactive(self):
        state=copy.deepcopy(self.state)
        before=copy.deepcopy(state["process_metrics"])
        p=MOD.record_failure(self.model,state,"HOST_HARNESS","fixture-host-1",True)
        self.assertEqual(p["invalidates"],["host_harness_result_only"])
        self.assertEqual(state["process_metrics"]["live_attempt_failures_by_domain"]["HOST_HARNESS"],before["live_attempt_failures_by_domain"]["HOST_HARNESS"]+1)
        self.assertEqual(state["process_metrics"]["host_process_wasted_live_attempts"],before["host_process_wasted_live_attempts"]+1)
        self.assertEqual(state["process_metrics"]["device_runtime_failed_live_attempts"],before["device_runtime_failed_live_attempts"])

    def test_core_acceptance_does_not_require_deferred_guest_scope(self):
        t4=next(t for t in self.model["transitions"] if t["id"]=="T4_PHASE2_INTEGRATION")
        t5=next(t for t in self.model["transitions"] if t["id"]=="T5_RELEASE_ACCEPT")
        self.assertNotIn("guest_platform_integrated",t4["required_checks"])
        self.assertNotIn("guest_shareability_passed",t5["required_checks"])
        self.assertIn("deferred_scope_preserved",t4["required_checks"])
        self.assertIn("owner_operational_acceptance_passed",t5["required_checks"])

    def test_native_capability_decision_with_complete_evidence_passes(self):
        record=architectural_record()
        record["evidence"]["native_capability_check"].update(result="SUFFICIENT",rationale="The existing platform capability meets the requirement without additional components.")
        record["evidence"]["mature_external_component_check"]={"relevant":False,"not_relevant_reason":"The native capability is sufficient.","alternatives":[]}
        self.assertEqual(MOD.validate_change_governance(self.model,record),[])

    def test_mature_external_adoption_requires_identity_reproducibility_and_rollback(self):
        record=architectural_record("fixture-adoption")
        record["impact"]["new_dependency"]=True
        record["evidence"]["mature_external_component_check"]["alternatives"][0]["disposition"]="SELECTED"
        record["evidence"]["decision_rationale"]["selected_path"]="Adopt example-component v2.4.1 through its supported public API."
        record["evidence"]["dependency_identity"]={"dependencies":[{"name":"example-component","upstream_project":"https://example.test/project","version_or_commit":"v2.4.1","source_identity":"tag:v2.4.1","provenance":"Example component upstream release","license":"MIT","compatibility":"tested with current platform"}]}
        self.assertEqual(MOD.validate_change_governance(self.model,record),[])

    def test_bespoke_implementation_without_exception_fails(self):
        record=architectural_record("fixture-bespoke")
        record["change_class"]="BESPOKE_REPLACEMENT"
        record["impact"].update(bespoke=True)
        self.assertTrue(any("bespoke_exception" in e for e in MOD.validate_change_governance(self.model,record)))

    def test_bespoke_exception_missing_native_evaluation_fails(self):
        record=architectural_record("fixture-bespoke-native")
        record["change_class"]="BESPOKE_REPLACEMENT"
        record["impact"].update(bespoke=True)
        record["evidence"]["bespoke_exception"]={"unmet_requirement":"Need X","native_option_evaluated":False,"external_alternatives_evaluated":True,"why_minimal_glue_is_insufficient":"Need X","required_custom_scope":"Small adapter","maintenance_burden":"Low","dependency_burden":"None","technical_debt_implications":"Documented","test_plan":"Host tests","rollback_exit_path":"Revert","owner_approval_reference":"approval-1","owner_approved":True}
        self.assertTrue(any("native" in e for e in MOD.validate_change_governance(self.model,record)))

    def test_bespoke_exception_missing_external_alternative_evaluation_fails(self):
        record=architectural_record("fixture-bespoke-external")
        record["change_class"]="BESPOKE_REPLACEMENT"
        record["impact"].update(bespoke=True)
        record["evidence"]["mature_external_component_check"]={"relevant":True,"alternatives":[]}
        record["evidence"]["bespoke_exception"]={"unmet_requirement":"Need X","native_option_evaluated":True,"external_alternatives_evaluated":True,"why_minimal_glue_is_insufficient":"Need X","required_custom_scope":"Small adapter","maintenance_burden":"Low","dependency_burden":"None","technical_debt_implications":"Documented","test_plan":"Host tests","rollback_exit_path":"Revert","owner_approval_reference":"approval-1","owner_approved":True}
        self.assertTrue(any("alternatives" in e for e in MOD.validate_change_governance(self.model,record)))

    def test_bespoke_exception_missing_owner_approval_fails(self):
        record=architectural_record("fixture-bespoke-owner")
        record["change_class"]="BESPOKE_REPLACEMENT"
        record["impact"].update(bespoke=True)
        record["evidence"]["bespoke_exception"]={"unmet_requirement":"Need X","native_option_evaluated":True,"external_alternatives_evaluated":True,"why_minimal_glue_is_insufficient":"Need X","required_custom_scope":"Small adapter","maintenance_burden":"Low","dependency_burden":"None","technical_debt_implications":"Documented","test_plan":"Host tests","rollback_exit_path":"Revert","owner_approval_reference":"approval-1","owner_approved":False}
        self.assertTrue(any("owner approval" in e for e in MOD.validate_change_governance(self.model,record)))

    def test_complete_bespoke_exception_with_owner_approval_passes(self):
        record=architectural_record("fixture-bespoke-pass")
        record["change_class"]="BESPOKE_REPLACEMENT"
        record["impact"].update(bespoke=True)
        record["evidence"]["bespoke_exception"]={"unmet_requirement":"No mature option satisfies the required offline boundary.","native_option_evaluated":True,"external_alternatives_evaluated":True,"why_minimal_glue_is_insufficient":"The selected compatible component exposes no supported extension point for this boundary.","required_custom_scope":"One narrow adapter around the existing public API.","maintenance_burden":"Own one adapter and regression fixture.","dependency_burden":"No additional runtime dependency.","technical_debt_implications":"Keep the adapter isolated and remove it when upstream adds the needed extension point.","test_plan":"Deterministic host contract tests plus the existing doctor.","rollback_exit_path":"Revert the adapter commit and use the last known-good integration.","owner_approval_reference":"explicit-owner-approval-1","owner_approved":True}
        self.assertEqual(MOD.validate_change_governance(self.model,record),[])

    def test_subjective_design_without_owner_gate_fails(self):
        impact={"architecture":False,"new_dependency":False,"subjective_design":True,"bespoke":False,"unknown":False}
        self.assertTrue(any("owner_design_gate" in e for e in MOD.validate_change_governance(self.model,change_record("SUBJECTIVE_DESIGN",impact,scoped_evidence()))))

    def test_subjective_design_with_explicit_owner_approval_passes(self):
        impact={"architecture":False,"new_dependency":False,"subjective_design":True,"bespoke":False,"unknown":False}
        evidence=scoped_evidence(); evidence["owner_design_gate"]={"decision_status":"APPROVED","approved_by_owner":True,"selected_option":"owner-selected option","approval_reference":"explicit-owner-approval"}
        self.assertEqual(MOD.validate_change_governance(self.model,change_record("SUBJECTIVE_DESIGN",impact,evidence)),[])

    def test_trivial_bounded_edit_passes_without_full_packet(self):
        self.assertEqual(MOD.validate_change_governance(self.model,change_record("TRIVIAL_BOUNDED")),[])

    def test_approved_architecture_implementation_uses_scoped_evidence_only(self):
        self.assertEqual(MOD.validate_change_governance(self.model,change_record("APPROVED_ARCHITECTURE_IMPLEMENTATION",evidence=scoped_evidence())),[])

    def test_new_dependency_missing_source_or_version_identity_fails(self):
        record=architectural_record("fixture-missing-identity")
        record["impact"]["new_dependency"]=True
        record["evidence"]["dependency_identity"]={"dependencies":[{"name":"example-component","upstream_project":"https://example.test/project","version_or_commit":"","source_identity":"","provenance":"upstream","license":"MIT","compatibility":"compatible"}]}
        self.assertTrue(any("version_or_commit" in e or "source_identity" in e for e in MOD.validate_change_governance(self.model,record)))

    def test_unknown_impact_fails_closed(self):
        impact={"architecture":False,"new_dependency":False,"subjective_design":False,"bespoke":False,"unknown":True}
        self.assertTrue(MOD.validate_change_governance(self.model,change_record("UNKNOWN_IMPACT",impact)))

    def test_governance_only_validation_does_not_change_foundation_state(self):
        before=copy.deepcopy(self.state)
        self.assertEqual(MOD.validate_change_governance(self.model,change_record("TRIVIAL_BOUNDED")),[])
        self.assertEqual(self.state,before)
        self.assertEqual(self.state["lifecycle_state"],"PHASE2_INTEGRATING")
        self.assertEqual(len(self.state["completed_receipts"]),3)

    def test_t4_requires_validated_governance_manifest(self):
        state=copy.deepcopy(self.state)
        transition=next(t for t in self.model["transitions"] if t["id"]=="T4_PHASE2_INTEGRATION")
        checks={k:True for k in transition["required_checks"]}
        manifest={"schema":"hbnf-engineering-governance-manifest-v1","records":[change_record("TRIVIAL_BOUNDED",change_id="t4-bounded") ]}
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/self.model["execution_system"]["engineering_change_governance"]["t4_manifest_path"]
            path.parent.mkdir(parents=True); path.write_text(json.dumps(manifest,sort_keys=True))
            digest=hashlib.sha256(path.read_bytes()).hexdigest()
            receipt={"schema":"hbnf-stage-receipt-v1","receipt_type":transition["receipt_type"],"transition_id":transition["id"],"subject":{"release_id":"test","source_identity_type":"source_tree_sha256","source_identity":"c"*64,"artifact_sha256":"a"*64},"checks":checks,"outcome":"PASS","evidence_artifacts":[{"name":self.model["execution_system"]["engineering_change_governance"]["t4_manifest_path"],"sha256":digest}]}
            self.assertEqual(MOD.validate_receipt(self.model,state,receipt,evidence_root=directory),[])
            receipt["checks"]["engineering_governance_complete"]=False
            self.assertTrue(any("governance" in e for e in MOD.validate_receipt(self.model,state,receipt,evidence_root=directory)))

    def test_project_doctor_uses_current_control_authority_without_stdlib_shadowing(self):
        result=subprocess.run([sys.executable,str(ROOT/"scripts/platform.py"),"doctor"],cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60)
        self.assertEqual(result.returncode,0,result.stdout)
        self.assertTrue(json.loads(result.stdout)["ok"])

if __name__=="__main__":
    unittest.main()
