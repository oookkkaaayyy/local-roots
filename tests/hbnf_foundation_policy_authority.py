#!/usr/bin/env python3
"""Current-authority guard for consumed Foundation sequence 41/42 evidence."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = ROOT / "config/HBNF_CONTROL_STATE.json"
RECEIPT_PATH = ROOT / "evidence/hbnf-foundation-qualification-20261005/seq41/THRESHOLD_FREEZE_RECEIPT.json"
RETIRED_POLICY_PATH = ROOT / "config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006.json"
IMMUTABLE_RECEIPT_SHA256 = "77a1985081e29f74e104eb1b032499aefa6c58bda4021e4d0c0420783804801b"


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def verify_consumed_seq41_policy():
    state = json.loads(STATE_PATH.read_text())
    foundation = state["current_task"]["foundation_metrics_run"]
    result = foundation["seq41_42_result"]
    assert foundation["next_sequences"] == "SEQ41/42_CONSUMED__NO_NEXT_PAIR_AUTHORIZED"
    assert result["sequence_pair_status"] == "SEQ41_SEQ42_CONSUMED__NO_NEW_PAIR_AUTHORIZED"
    assert state["live_mutation_authorized"] is False

    current = state["bounded_phase2_r4_live_qualification_authorization"]["qualification"]
    current_path = current["frozen_policy_path"]
    current_policy = ROOT / current_path
    assert current_path == "config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006_SUSTAINED_R1.json"
    assert sha256(current_policy) == current["frozen_policy_sha256"]

    import sys
    sys.path.insert(0, str(ROOT / "scripts"))
    from hbnf_foundation_threshold_freeze import validate_policy
    assert validate_policy(json.loads(current_policy.read_text())) == []

    receipt_raw = RECEIPT_PATH.read_bytes()
    assert hashlib.sha256(receipt_raw).hexdigest() == IMMUTABLE_RECEIPT_SHA256
    receipt = json.loads(receipt_raw)
    assert receipt["policy"]["sha256"] == sha256(RETIRED_POLICY_PATH)
    assert receipt["policy"]["sha256"] != current["frozen_policy_sha256"]

    for name in ("seq41", "seq43"):
        source = (ROOT / f"scripts/hbnf_foundation_{name}_transaction.py").read_text()
        assert "receipt.get(\"policy\",{}).get(\"sha256\")!=digest(policy)" in source
        assert "not bound to the current AUX-corrected policy" in source


if __name__ == "__main__":
    verify_consumed_seq41_policy()
    print("PASS: seq41/42 are consumed; current sustained policy is valid; immutable historical freeze is not reusable; live mutation remains unauthorized")
