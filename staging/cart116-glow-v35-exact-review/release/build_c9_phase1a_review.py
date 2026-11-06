#!/usr/bin/env python3
"""#116 C9 Phase1A exact six-Owner-file REVIEW_ONLY package.

No network, credentials, device access or release admission. Reads the SAME
manifest and accepted six staged source files. Refuses all source/preimage drift.
The output is never an executable live release until a separate exact one-time
manifest receipt and independent off-device backup/download-back are verified.
"""
import hashlib
import json
import pathlib
import sys
import zipfile

STAGE = pathlib.Path(__file__).resolve().parents[1]
REPO = pathlib.Path(__file__).resolve().parents[3]
MANIFEST = STAGE / "admission/ADMISSION.PENDING.json"
EXPECTED = (
    ("/www/mission-control-local/local-transport.js", "local-transport.js"),
    ("/www/mission-control-local/owner-pwa/hbnf-cart-local.js", "hbnf-cart-local.js"),
    ("/www/mission-control-local/owner-pwa/hbnf-cart.js", "hbnf-cart.js"),
    ("/www/mission-control-local/owner-pwa/hbnf-cart.html", "hbnf-cart.html"),
    ("/www/mission-control-local/owner-pwa/.hbnf-payload.sha256", ".hbnf-payload.sha256"),
    ("/www/mission-control-local/owner-pwa/.hbnf-package-version", ".hbnf-package-version"),
)
def sha256(raw):
    return hashlib.sha256(raw).hexdigest()
def gitblob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
def emit(out):
    data = MANIFEST.read_bytes()
    m = json.loads(data)
    assert m["transaction"]["source_gate_change_admitted"] is False, "STOP: live release source gate changed"
    assert m["firmware"]["matrix_flash"] is False, "STOP: firmware gate changed"
    p = m["dora_c9_paired_owner_release_20261105"]
    assert p["status"] == "SOURCE_INTEGRATED_REVIEW_ONLY_NOT_INSTALLABLE"
    assert len(p["changed_targets"]) == 6
    inventory = m["opal_c9_current_authenticated_inventory_20261105"]["six_current_preimage_sha256_by_path"]
    entries = {"candidate/ADMISSION.PENDING.json": data}
    rows = []
    audit = []
    for target, rel in EXPECTED:
        t = next((v for v in p["changed_targets"] if v["target"] == target), None)
        assert t is not None and pathlib.Path(t["target"]).name == rel, "target path mismatch"
        assert t["actual_installed_preimage_sha256"] == inventory[target], "preimage drift"
        assert t["independent_installed_preimage_downloadback"] is True, "independent backup absent"
        assert t["prechange_live_verified"] is False, "no new live prechange readback claim allowed"
        assert "0644 uid=0 gid=0" in t["actual_installed_preimage_mode_owner"]
        raw_path = REPO / t["source_path"]
        assert raw_path.is_file() and not raw_path.is_symlink(), "source inaccessible or symlink"
        raw = raw_path.read_bytes()
        assert sha256(raw) == t["candidate_sha256"], "candidate source SHA drift: " + rel
        rows.append("\t".join((target, rel, inventory[target], sha256(raw), "644")))
        entries["candidate/" + rel] = raw
        audit.append({"target": target, "candidate_sha256": sha256(raw), "preimage_sha256": inventory[target]})
    assert len(entries) == 7 and len({t[0] for t in EXPECTED}) == 6
    entries["six.tsv"] = ("\n".join(rows) + "\n").encode("ascii")
    guard = m["c9_phase1a_opal_transaction_candidate_20261105"]
    for kind, key in (("install_restore_candidate", "c9-six-file-opal.CANDIDATE.sh"),
                      ("standalone_readonly_preflight", "c9-six-file-opal-preflight.REVIEW_ONLY.sh")):
        info = guard["files"][kind]
        raw = (REPO / info["path"]).read_bytes()
        assert gitblob(raw) == info["git_blob_sha"], "release script source drift: " + key
        entries["release/" + key] = raw
    receipt = {
        "schema": "cart116-c9-phase1a-exact-review-package-v1",
        "disposition": "REVIEW_ONLY_NOT_INSTALLABLE_NO_ADMISSION_RECEIPT",
        "manifest_sha256": sha256(data),
        "six_targets_sha256": sha256(entries["six.tsv"]),
        "candidate_files": audit,
        "preimage_full_21_file_independent_drive_backup_sha256": guard["independent_original_21_file_rollback_sha256"],
        "source_firmware": "original R6 only; native C9 firmware excluded",
        "no_live_mutation": True,
        "source_gate_admitted": False,
        "contains_installed_backup_bytes": False,
        "contains_owner_approval": False,
        "contains_live_install_receipt": False
    }
    entries["REVIEW_RECEIPT.json"] = (json.dumps(receipt, sort_keys=True, separators=(",", ":")) + "\n").encode()
    assert len(entries) == 11
    # Reproducible ZIP: fixed member order, timestamps, compression and mode.
    with zipfile.ZipFile(out, mode="w", compression=zipfile.ZIP_STORED, allowZip64=False) as z:
        for name in sorted(entries):
            i = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            i.create_system = 3
            i.external_attr = ((0o755 if name.endswith(".sh") else 0o644) << 16)
            i.compress_type = zipfile.ZIP_STORED
            z.writestr(i, entries[name])
    raw = out.read_bytes()
    with zipfile.ZipFile(out) as z:
        assert z.testzip() is None
        assert set(z.namelist()) == set(entries)
        assert all(z.read(k) == v for k, v in entries.items())
    print(json.dumps({"file": str(out), "bytes": len(raw), "sha256": sha256(raw),
                      "manifest_sha256": receipt["manifest_sha256"],
                      "six_targets_sha256": receipt["six_targets_sha256"],
                      "members": len(entries), "status": receipt["disposition"]}, sort_keys=True))
if __name__ == "__main__":
    assert len(sys.argv) == 2, "usage: build_c9_phase1a_review.py /tmp/cart116-c9-review-*.zip"
    target = pathlib.Path(sys.argv[1]).resolve()
    assert target.parent == pathlib.Path("/tmp").resolve() and target.name.startswith("cart116-c9-review-") and target.suffix == ".zip"
    assert not target.exists(), "refuse overwrite"
    emit(target)
