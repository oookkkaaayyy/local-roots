#!/usr/bin/env python3
import copy
import importlib.util
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("hbnf_control", ROOT/"scripts/hbnf_control.py")
MOD=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)

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
            "config/HBNF_CONTROL_MODEL.json + config/HBNF_CONTROL_STATE.json"
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

    def test_core_acceptance_does_not_require_deferred_guest_scope(self):
        t4=next(t for t in self.model["transitions"] if t["id"]=="T4_PHASE2_INTEGRATION")
        t5=next(t for t in self.model["transitions"] if t["id"]=="T5_RELEASE_ACCEPT")
        self.assertNotIn("guest_platform_integrated",t4["required_checks"])
        self.assertNotIn("guest_shareability_passed",t5["required_checks"])
        self.assertIn("deferred_scope_preserved",t4["required_checks"])
        self.assertIn("owner_operational_acceptance_passed",t5["required_checks"])

if __name__=="__main__":
    unittest.main()
