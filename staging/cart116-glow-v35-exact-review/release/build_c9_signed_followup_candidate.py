#!/usr/bin/env python3
"""Build the exact 11-member C9 follow-up candidate from a reviewed diagnostic ZIP.

The output is still REVIEW_ONLY. It is admissible only when the supplied original
manifest binds this exact transaction and a separately verified owner signature
is processed by c9_phase1a_approval.py.
"""
import argparse
import hashlib
import io
import json
import pathlib
import zipfile

STAGE = pathlib.Path(__file__).resolve().parents[1]
REPO = pathlib.Path(__file__).resolve().parents[3]
ROLLBACK = "d717ab5d5cd29c90a4ab1a4b9041b9d8ad21314d47916b8607a051f173cd15e9"
REVIEW_ZIP = "28e5fddcbda37c6fc3dce8f43f4e2f6550a663b8ec033e8355ff80c3b8ba6b7c"
EXPECTED = {
    "/www/mission-control-local/local-transport.js": "local-transport.js",
    "/www/mission-control-local/owner-pwa/hbnf-cart-local.js": "hbnf-cart-local.js",
    "/www/mission-control-local/owner-pwa/hbnf-cart.js": "hbnf-cart.js",
    "/www/mission-control-local/owner-pwa/hbnf-cart.html": "hbnf-cart.html",
    "/www/mission-control-local/owner-pwa/.hbnf-payload.sha256": ".hbnf-payload.sha256",
    "/www/mission-control-local/owner-pwa/.hbnf-package-version": ".hbnf-package-version",
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def build(review_zip, manifest_path, installed_path, output):
    source = review_zip.read_bytes()
    if sha(source) != REVIEW_ZIP:
        raise ValueError("review source ZIP differs from independently downloaded approved artifact")
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    tx = manifest["transaction"]
    admission = manifest["c9_phase1a_opal_transaction_candidate_20261105"]["phase1a_admission"]
    if tx.get("source_gate_change_admitted") is not False or tx.get("trusted_admission_receipt") is not None:
        raise ValueError("broad source gate must remain closed; no receipt may be prefilled")
    if not tx.get("manifest_specific_one_time_id") or admission.get("transaction_id") != tx["manifest_specific_one_time_id"]:
        raise ValueError("same-manifest transaction identity is missing or mismatched")
    if admission.get("scope") != "C9_PHASE1A_OWNER_PWA_SIX_FILES_ONLY" or admission.get("status") != "OWNER_SIGNATURE_REQUIRED":
        raise ValueError("manifest is not frozen for this exact C9 signature")
    if admission.get("source_gate_change_admitted") is not False or admission.get("other_release_scopes_admitted") is not False:
        raise ValueError("manifest scope or gate is not fail-closed")
    if admission.get("rollback_sha256") != ROLLBACK or tx.get("independent_release_backup_download_verified") is not True:
        raise ValueError("independent 21-file rollback gate is not satisfied")
    installed = json.loads(installed_path.read_bytes())
    release = manifest["dora_c9_paired_owner_release_20261105"]["changed_targets"]
    by_target = {row["target"]: row for row in release}
    if set(by_target) != set(EXPECTED):
        raise ValueError("manifest six-target allowlist mismatch")
    entries = {}
    rows = []
    audit = []
    with zipfile.ZipFile(io.BytesIO(source)) as review:
        if review.testzip() is not None:
            raise ValueError("review ZIP CRC failure")
        old_rows = {}
        for line in review.read("six.tsv").decode("ascii").splitlines():
            target, name, _old, _new, mode = line.split("\t")
            old_rows[target] = (name, mode)
        if set(old_rows) != set(EXPECTED):
            raise ValueError("review package target set mismatch")
        for target, name in EXPECTED.items():
            if old_rows[target] != (name, "644"):
                raise ValueError("review package target/name/mode mismatch")
            row = by_target[target]
            pre = installed.get(target)
            if not pre or row.get("actual_installed_preimage_sha256") != pre:
                raise ValueError("manifest preimage differs from authenticated installed readback")
            rollback = review.read("rollback/" + name)
            candidate = review.read("candidate/" + name)
            if sha(rollback) != pre:
                raise ValueError("review package rollback bytes do not match installed preimage: " + target)
            if sha(candidate) != row.get("candidate_sha256"):
                raise ValueError("review candidate differs from exact manifest postimage: " + target)
            rows.append("\t".join((target, name, pre, sha(candidate), "644")))
            entries["candidate/" + name] = candidate
            audit.append({"target": target, "preimage_sha256": pre, "candidate_sha256": sha(candidate)})
    tsv = ("\n".join(rows) + "\n").encode("ascii")
    entries["six.tsv"] = tsv
    entries["candidate/ADMISSION.PENDING.json"] = manifest_bytes
    for name in ("c9-six-file-opal-preflight.REVIEW_ONLY.sh", "c9-six-file-opal.CANDIDATE.sh"):
        info = manifest["c9_phase1a_opal_transaction_candidate_20261105"]["files"]
        key = "standalone_readonly_preflight" if name.endswith("preflight.REVIEW_ONLY.sh") else "install_restore_candidate"
        path = REPO / info[key]["path"]
        raw = path.read_bytes()
        if sha(raw) != info[key].get("sha256"):
            # Older manifest revisions bind scripts by Git blob SHA-1.
            import subprocess
            blob = subprocess.check_output(["git", "-C", str(REPO), "hash-object", str(path)], text=True).strip()
            if blob != info[key].get("git_blob_sha"):
                raise ValueError("release script differs from original manifest source: " + name)
        entries["release/" + name] = raw
    receipt = {
        "schema": "cart116-c9-phase1a-exact-review-package-v1",
        "disposition": "REVIEW_ONLY_NOT_INSTALLABLE_NO_ADMISSION_RECEIPT",
        "manifest_sha256": sha(manifest_bytes),
        "six_targets_sha256": sha(tsv),
        "candidate_files": audit,
        "preimage_full_21_file_independent_drive_backup_sha256": ROLLBACK,
        "source_firmware": "original R6 only; native C9 firmware excluded",
        "no_live_mutation": True,
        "source_gate_admitted": False,
        "contains_installed_backup_bytes": False,
        "contains_owner_approval": False,
        "contains_live_install_receipt": False,
    }
    entries["REVIEW_RECEIPT.json"] = (json.dumps(receipt, sort_keys=True, separators=(",", ":")) + "\n").encode()
    if len(entries) != 11:
        raise ValueError("candidate must contain exactly eleven allowlisted members")
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED, allowZip64=False) as z:
        for name in sorted(entries):
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = ((0o755 if name.endswith(".sh") else 0o644) << 16)
            info.compress_type = zipfile.ZIP_STORED
            z.writestr(info, entries[name])
    with zipfile.ZipFile(output) as z:
        if z.testzip() is not None or set(z.namelist()) != set(entries):
            raise ValueError("deterministic candidate ZIP failed integrity verification")
        if any(z.read(name) != data for name, data in entries.items()):
            raise ValueError("candidate ZIP member readback mismatch")
    print(json.dumps({"file": str(output), "bytes": output.stat().st_size,
                      "sha256": sha(output.read_bytes()), "manifest_sha256": sha(manifest_bytes),
                      "six_tsv_sha256": sha(tsv), "members": len(entries),
                      "disposition": receipt["disposition"]}, sort_keys=True))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--review-zip", type=pathlib.Path, required=True)
    p.add_argument("--manifest", type=pathlib.Path, required=True)
    p.add_argument("--installed-preimages", type=pathlib.Path, required=True)
    p.add_argument("--output", type=pathlib.Path, required=True)
    a = p.parse_args()
    build(a.review_zip, a.manifest, a.installed_preimages, a.output)


if __name__ == "__main__":
    main()
