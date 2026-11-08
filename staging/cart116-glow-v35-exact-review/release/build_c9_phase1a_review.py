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
import re
import shutil
import subprocess
import sys
import tempfile
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
TEXT_DIAGNOSTIC_PATCH = STAGE / "tests/fixtures/c9-text-command-diagnostic.REVIEW_ONLY.patch"
TEXT_DIAGNOSTIC_PATCH_SHA256 = "894ad7811addc16f94918a0c66b9c29ca35a169c21b8a3843b8ede9e46658a5d"
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

def emit_text_diagnostic_review(out):
    """Build a non-installable diagnostic review package from the consumed C9 baseline.

    The original manifest is embedded byte-for-byte. The receipt explicitly records
    that the proposed postimages do not match it and that no new admission exists.
    Six current C9 preimages are bundled for exact restoration of this review delta.
    """
    manifest_bytes = MANIFEST.read_bytes()
    manifest = json.loads(manifest_bytes)
    assert manifest["transaction"]["source_gate_change_admitted"] is False
    assert manifest["firmware"]["matrix_flash"] is False
    release = manifest["dora_c9_paired_owner_release_20261105"]
    assert release["status"] == "SOURCE_INTEGRATED_REVIEW_ONLY_NOT_INSTALLABLE"
    assert hashlib.sha256(TEXT_DIAGNOSTIC_PATCH.read_bytes()).hexdigest() == TEXT_DIAGNOSTIC_PATCH_SHA256
    assert manifest["c9_phase1a_opal_transaction_candidate_20261105"]["phase1a_admission"]["status"] == "OWNER_SIGNATURE_REQUIRED"

    release_by_target = {item["target"]: item for item in release["changed_targets"]}
    assert set(release_by_target) == {target for target, _ in EXPECTED}
    source_paths = {item["source_path"] for item in release["changed_targets"]}
    patch_text = TEXT_DIAGNOSTIC_PATCH.read_text()
    patch_paths = set(re.findall(r"^--- a/(\S+)", patch_text, re.M))
    expected_patch_paths = {
        item["source_path"] for item in release["changed_targets"]
        if item["target"] in {
            "/www/mission-control-local/local-transport.js",
            "/www/mission-control-local/owner-pwa/hbnf-cart-local.js",
            "/www/mission-control-local/owner-pwa/hbnf-cart.js",
        }
    }
    assert patch_paths == expected_patch_paths and patch_paths <= source_paths

    with tempfile.TemporaryDirectory(prefix="c9-text-diagnostic-review-") as td:
        scratch = pathlib.Path(td)
        for item in release["changed_targets"]:
            src = REPO / item["source_path"]
            assert src.is_file() and not src.is_symlink()
            raw = src.read_bytes()
            assert sha256(raw) == item["candidate_sha256"], "base installed C9 postimage mismatch: " + item["target"]
            target = scratch / item["source_path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        subprocess.run(["patch", "-p1", "--batch", "-i", str(TEXT_DIAGNOSTIC_PATCH)],
                       cwd=scratch, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        by_rel = {pathlib.Path(item["source_path"]).name: item for item in release["changed_targets"]}
        target_by_rel = {item["source_path"]: item for item in release["changed_targets"]}
        paths = {rel: scratch / rel for rel in target_by_rel}
        transport_rel = by_rel["local-transport.js"]["source_path"]
        local_rel = by_rel["hbnf-cart-local.js"]["source_path"]
        cart_rel = by_rel["hbnf-cart.js"]["source_path"]
        html_rel = by_rel["hbnf-cart.html"]["source_path"]
        transport_hash = sha256(paths[transport_rel].read_bytes())
        local_text = paths[local_rel].read_text()
        local_text, n = re.subn(r"(local-transport\.js\?v=)[a-f0-9]{16}", r"\g<1>" + transport_hash[:16], local_text)
        assert n == 1, "local transport cache reference missing or ambiguous"
        paths[local_rel].write_text(local_text)
        local_hash = sha256(paths[local_rel].read_bytes())
        cart_text = paths[cart_rel].read_text()
        cart_text, n = re.subn(r"(hbnf-cart-local\.js\?v=)[^\"']+", r"\g<1>" + local_hash[:16], cart_text)
        assert n == 1, "local Owner module cache reference missing or ambiguous"
        paths[cart_rel].write_text(cart_text)
        cart_hash = sha256(paths[cart_rel].read_bytes())
        html_text = paths[html_rel].read_text()
        html_text, n = re.subn(r"(hbnf-cart\.js\?v=)[^\"']+", r"\g<1>c9textdiag-" + cart_hash[:16], html_text)
        assert n == 1, "Owner page cache reference missing or ambiguous"
        paths[html_rel].write_text(html_text)

        payload_rel = by_rel[".hbnf-payload.sha256"]["source_path"]
        payload_lines = []
        old_payload = (REPO / payload_rel).read_text().splitlines()
        assert len(old_payload) == 17
        for line in old_payload:
            match = re.fullmatch(r"([a-f0-9]{64})  ([^/]+)", line)
            assert match, "unexpected Owner payload checksum row"
            old_digest, name = match.groups()
            patched_rel = next((rel for rel, item in ((x, y) for x, y in target_by_rel.items())
                                if pathlib.Path(rel).name == name), None)
            if patched_rel:
                payload_lines.append(sha256(paths[patched_rel].read_bytes()) + "  " + name)
            else:
                # Preserve the authenticated baseline line for untouched assets.
                # Their original bytes remain covered by the retained 21-file backup.
                payload_lines.append(old_digest + "  " + name)
        payload_bytes = ("\n".join(payload_lines) + "\n").encode("ascii")
        paths[payload_rel].write_bytes(payload_bytes)
        version_rel = by_rel[".hbnf-package-version"]["source_path"]
        paths[version_rel].write_text("1.0.21-c9textdiag-" + TEXT_DIAGNOSTIC_PATCH_SHA256[:8] + "\n")

        # Confirm the resulting static references and payload digest are coherent.
        assert transport_hash[:16] in paths[local_rel].read_text()
        assert local_hash[:16] in paths[cart_rel].read_text()
        assert cart_hash[:16] in paths[html_rel].read_text()
        for line in payload_bytes.decode("ascii").splitlines():
            digest, name = line.split("  ", 1)
            candidate_rel = next((rel for rel in paths if pathlib.Path(rel).name == name), None)
            if candidate_rel:
                assert sha256(paths[candidate_rel].read_bytes()) == digest, "regenerated Owner payload digest mismatch: " + name

        entries = {"candidate/ADMISSION.PENDING.json": manifest_bytes}
        rows, proposed, rollback = [], [], []
        for target, rel in EXPECTED:
            item = release_by_target[target]
            source_path = item["source_path"]
            base_bytes = (REPO / source_path).read_bytes()
            candidate_bytes = paths[source_path].read_bytes()
            preimage = item["candidate_sha256"]
            postimage = sha256(candidate_bytes)
            assert sha256(base_bytes) == preimage
            entries["candidate/" + rel] = candidate_bytes
            entries["rollback/" + rel] = base_bytes
            rows.append("\t".join((target, rel, preimage, postimage, "644")))
            proposed.append({"target": target, "preimage_sha256": preimage, "postimage_sha256": postimage, "mode": "644"})
            rollback.append({"target": target, "sha256": preimage})
        entries["six.tsv"] = ("\n".join(rows) + "\n").encode("ascii")
        guard = manifest["c9_phase1a_opal_transaction_candidate_20261105"]
        for kind, filename in (("install_restore_candidate", "c9-six-file-opal.CANDIDATE.sh"),
                               ("standalone_readonly_preflight", "c9-six-file-opal-preflight.REVIEW_ONLY.sh")):
            info = guard["files"][kind]
            raw = (REPO / info["path"]).read_bytes()
            assert gitblob(raw) == info["git_blob_sha"]
            entries["release/" + filename] = raw
        receipt = {
            "schema": "cart116-c9-text-diagnostic-review-package-v1",
            "disposition": "REVIEW_ONLY_NOT_INSTALLABLE_NO_ADMISSION_RECEIPT",
            "manifest_sha256": sha256(manifest_bytes),
            "manifest_snapshot_unchanged": True,
            "manifest_candidate_postimages_match": False,
            "source_branch": "review/cart116-glow-canonical-intent-20261103",
            "source_commit": subprocess.check_output(["git", "-C", str(REPO), "rev-parse", "HEAD"], text=True).strip(),
            "diagnostic_patch_sha256": TEXT_DIAGNOSTIC_PATCH_SHA256,
            "scope": "C9_PHASE1A_OWNER_PWA_SIX_FILES_ONLY",
            "base_installed_marker": "1.0.21-c9pair1",
            "base_installed_readback": {"issue_comment": 6701039539, "receipt_sha256": "93b5f59c6ba389724a71d59fd5f4bcdd6100ec461630ca54dd56d4fbb56913dd", "drive_id": "1euWDPYAyNh0t5zBnJ0QeGOXS-afP2zb6"},
            "base_transaction_id": guard["phase1a_admission"]["transaction_id"],
            "base_transaction_consumed": True,
            "candidate_files": proposed,
            "rollback_files": rollback,
            "matching_full_21_file_rollback": {"drive_id": manifest["transaction"]["independent_release_backup_evidence"]["drive_id"], "sha256": guard["independent_original_21_file_rollback_sha256"]},
            "process_reentry_restore": "PASS_ACTUAL_ROUTER",
            "abrupt_power_loss": "NOT_TESTED",
            "partial_active_file_restore": "NOT_FAULT_INJECTED",
            "cache_bust_and_payload_integrity_regenerated": True,
            "source_gate_admitted": False,
            "one_time_transaction_id": None,
            "contains_owner_approval": False,
            "contains_live_install_receipt": False,
            "no_live_mutation": True
        }
        entries["REVIEW_RECEIPT.json"] = (json.dumps(receipt, sort_keys=True, separators=(",", ":")) + "\n").encode()

    with zipfile.ZipFile(out, mode="w", compression=zipfile.ZIP_STORED, allowZip64=False) as archive:
        for name in sorted(entries):
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = ((0o755 if name.endswith(".sh") else 0o644) << 16)
            info.compress_type = zipfile.ZIP_STORED
            archive.writestr(info, entries[name])
    raw = out.read_bytes()
    with zipfile.ZipFile(out) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == 17
        assert all(archive.read(name) == value for name, value in entries.items())
        assert all(sha256(archive.read("rollback/" + rel)) == release_by_target[target]["candidate_sha256"]
                   for target, rel in EXPECTED)
    print(json.dumps({"file": str(out), "bytes": len(raw), "sha256": sha256(raw),
                      "manifest_sha256": sha256(manifest_bytes), "members": len(entries),
                      "status": receipt["disposition"], "candidate_files": proposed,
                      "rollback_files": rollback}, sort_keys=True))
if __name__ == "__main__":
    diagnostic = len(sys.argv) == 3 and sys.argv[1] == "--text-diagnostic-review"
    assert len(sys.argv) == (3 if diagnostic else 2), "usage: build_c9_phase1a_review.py [--text-diagnostic-review] /tmp/cart116-c9-review-*.zip"
    target = pathlib.Path(sys.argv[-1]).resolve()
    assert target.parent == pathlib.Path("/tmp").resolve() and target.name.startswith("cart116-c9-review-") and target.suffix == ".zip"
    assert not target.exists(), "refuse overwrite"
    if diagnostic:
        emit_text_diagnostic_review(target)
    else:
        emit(target)
