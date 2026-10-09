#!/usr/bin/env python3
"""Offline replay of the one-shot R2 diagnostic -> renderer restore -> R4 return.

The fake transport exercises the transaction ordering and failure policy only;
it never opens a socket or invokes a device command.
"""
from __future__ import annotations
import hashlib, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "evidence/cart2-r7-performance-repair-20261009/R2_DIAGNOSTIC_TRANSACTION_DRYRUN.json"
R2 = "9789d9f198699d48f7bf168d7c885d337547724716055e48824072c82c8dfd6b"
R4 = "338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c"
R2_ID = "hbnf-cart2-r7-outlier-trace-diagnostic-r2-20261009"
R4_ID = "hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"


class SimulatedTransaction:
    def __init__(self, scenario: str, restore_ok: bool = True):
        self.scenario = scenario
        self.restore_ok = restore_ok
        self.events: list[str] = []
        self.r2_requests = 0
        self.r4_requests = 0
        self.sample_rows: list[dict] = []
        self.result = "PASS"

    def run(self):
        # Admission and preflight happen before any write-capable operation.
        self.events += ["admission_pass", "artifact_sha_verify", "preflight_exact_r4_aux_ac_single_worker"]
        self.r2_requests += 1
        self.events.append("upload_r2_once")
        self.events.append("verify_exact_r2_identity")
        self.events.append("snapshot_renderer")
        self.events.append("select_kernel13_brightness44_variant_1347100685")
        self.events += ["trace_start", "trace_stop_empty_store", "reset_histogram", "settle_2s", "baseline_60s_8_samples"]

        try:
            self._window("trace_disarmed")
            self.events += ["reset_histogram", "settle_2s", "trace_resume", "armed_60s_8_samples"]
            self._window("trace_armed")
            self.events += ["trace_stop", "final_trace_readback"]
        except RuntimeError as exc:
            self.result = str(exc)
            self.events.append("persist_failure_evidence")
        finally:
            # All collection stops before exact renderer restore; no recovery
            # upload is permitted unless the renderer snapshot verifies.
            self.events.append("stop_collection")
            self.events.append("restore_renderer_snapshot")
            if self.restore_ok:
                self.events.append("verify_renderer_snapshot_exact")
                self.r4_requests += 1
                self.events.append("upload_exact_r4_once")
                self.events += ["verify_exact_r4_identity", "verify_matrix_health_aux_ddp"]
            else:
                self.events.append("stop_no_blind_r4_restore_snapshot_unverified")
                self.result = "BLOCKED_RESTORE_UNVERIFIED"
        return self.as_receipt()

    def _window(self, condition: str):
        if self.scenario == "collector_failure" and condition == "trace_disarmed":
            self.events.append("collector_timeout_recorded_no_sample_skipped")
            raise RuntimeError("INCONCLUSIVE_COLLECTOR_FAILURE")
        for i, t in enumerate((4, 12, 20, 28, 36, 44, 52, 60)):
            row = {"condition": condition, "scheduled_s": t, "read_result": "PASS"}
            if self.scenario == "catastrophic" and condition == "trace_armed" and i < 3:
                row.update(fps=19, frame_ms_p99=76, aux_projection_active=True)
            else:
                row.update(fps=41, frame_ms_p99=42.5, aux_projection_active=True)
            self.sample_rows.append(row)
            self.events.append(f"sample_{condition}_{t}s_persist")
            # Frozen rule: 3 consecutive bad 8-second samples. The 42.03125ms
            # diagnostic threshold remains evidence only, never an abort.
            if len(self.sample_rows) >= 3:
                tail = self.sample_rows[-3:]
                bad = all(float(x.get("fps", 100)) < 20 or float(x.get("frame_ms_p99", 0)) > 75
                          or x.get("aux_projection_active") is not True for x in tail)
                if bad:
                    self.events.append("catastrophic_abort_after_third_persisted_sample")
                    raise RuntimeError("CATASTROPHIC_ABORT")

    def as_receipt(self):
        return {"scenario": self.scenario, "result": self.result,
                "r2_install_requests": self.r2_requests, "r4_restore_requests": self.r4_requests,
                "sample_count": len(self.sample_rows), "events": self.events,
                "sample_rows": self.sample_rows}


def main() -> int:
    scenarios = [
        SimulatedTransaction("success").run(),
        SimulatedTransaction("catastrophic").run(),
        SimulatedTransaction("collector_failure").run(),
        SimulatedTransaction("success", restore_ok=False).run(),
    ]
    success, catastrophic, collector, restore = scenarios
    assert success["result"] == "PASS" and success["r2_install_requests"] == 1 and success["r4_restore_requests"] == 1
    assert success["sample_count"] == 16
    assert catastrophic["result"] == "CATASTROPHIC_ABORT" and catastrophic["r2_install_requests"] == 1 and catastrophic["r4_restore_requests"] == 1
    assert catastrophic["events"].index("catastrophic_abort_after_third_persisted_sample") < catastrophic["events"].index("restore_renderer_snapshot") < catastrophic["events"].index("upload_exact_r4_once")
    assert collector["result"] == "INCONCLUSIVE_COLLECTOR_FAILURE" and collector["r2_install_requests"] == 1 and collector["r4_restore_requests"] == 1
    assert "collector_timeout_recorded_no_sample_skipped" in collector["events"]
    assert restore["result"] == "BLOCKED_RESTORE_UNVERIFIED" and restore["r4_restore_requests"] == 0
    assert "stop_no_blind_r4_restore_snapshot_unverified" in restore["events"]
    for x in scenarios:
        assert x["r2_install_requests"] <= 1 and x["r4_restore_requests"] <= 1
        assert x["events"].index("admission_pass") < x["events"].index("upload_r2_once")
        assert x["events"].index("verify_renderer_snapshot_exact") < x["events"].index("upload_exact_r4_once") if "upload_exact_r4_once" in x["events"] else True
    policy = json.loads((ROOT / "config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006_SUSTAINED_R1.json").read_text())
    assert policy["catastrophic_early_stop"]["consecutive_samples"] == 3
    assert policy["catastrophic_early_stop"]["frame_ms_p99_ceiling_absolute"] == 75
    assert policy["catastrophic_early_stop"]["fps_floor_absolute"] == 20
    receipt = {"schema": "hbnf-r7-diagnostic-transaction-dryrun-v1", "device_requests": 0,
               "firmware_source_changed": False, "candidate": {"release_id": R2_ID, "sha256": R2},
               "mandatory_return": {"release_id": R4_ID, "sha256": R4},
               "unchanged_catastrophic_policy": policy["catastrophic_early_stop"],
               "cases": scenarios, "result": "PASS_OFFLINE_SEQUENCE_POLICY"}
    encoded = json.dumps(receipt, indent=2, sort_keys=True) + "\n"
    OUT.write_text(encoded)
    print("PASS: offline sequence handles success, 3-sample catastrophic abort, collector failure, exact renderer restore, and bounded R4 return; zero device requests")
    print(hashlib.sha256(OUT.read_bytes()).hexdigest())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
