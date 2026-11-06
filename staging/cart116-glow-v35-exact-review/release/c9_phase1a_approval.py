#!/usr/bin/env python3
"""Verify owner-signed C9 Phase1A approval and build device-verifiable capsule.

Production entrypoint deliberately requires the key pin in the original manifest.
Test fixtures call the pure parser/contract functions with an explicitly marked
TEST ONLY key; no test key is configured or accepted by the live installer.
"""
from __future__ import annotations
import argparse, base64, hashlib, io, json, pathlib, struct, subprocess, sys, tempfile, zipfile
import re

NAMESPACE = "hbnf-c9-phase1a"
SCOPE = "C9_PHASE1A_OWNER_PWA_SIX_FILES_ONLY"
EXPECTED_ROLLBACK = "d717ab5d5cd29c90a4ab1a4b9041b9d8ad21314d47916b8607a051f173cd15e9"
EXPECTED_TARGETS = {
    "/www/mission-control-local/local-transport.js",
    "/www/mission-control-local/owner-pwa/hbnf-cart-local.js",
    "/www/mission-control-local/owner-pwa/hbnf-cart.js",
    "/www/mission-control-local/owner-pwa/hbnf-cart.html",
    "/www/mission-control-local/owner-pwa/.hbnf-payload.sha256",
    "/www/mission-control-local/owner-pwa/.hbnf-package-version",
}

def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def parse_sshsig(path: pathlib.Path):
    lines = path.read_text().splitlines()
    if not lines or lines[0] != "-----BEGIN SSH SIGNATURE-----" or lines[-1] != "-----END SSH SIGNATURE-----":
        raise ValueError("not an OpenSSH SSHSIG file")
    b = base64.b64decode("".join(lines[1:-1]), validate=True)
    if not b.startswith(b"SSHSIG"):
        raise ValueError("bad SSHSIG magic")
    off = 6
    def u32():
        nonlocal off
        n = struct.unpack(">I", b[off:off+4])[0]; off += 4; return n
    def string():
        nonlocal off
        n = u32(); v = b[off:off+n]; off += n
        if len(v) != n: raise ValueError("truncated SSHSIG field")
        return v
    if u32() != 1: raise ValueError("unsupported SSHSIG version")
    key_blob, namespace, reserved, hash_alg, sig_blob = string(), string(), string(), string(), string()
    if off != len(b) or namespace.decode("ascii") != NAMESPACE or reserved or hash_alg != b"sha512":
        raise ValueError("SSHSIG namespace/hash/reserved mismatch")
    def getstr(data, pos):
        n = struct.unpack(">I", data[pos:pos+4])[0]; pos += 4
        v = data[pos:pos+n]; pos += n
        if len(v) != n: raise ValueError("truncated SSH wire field")
        return v, pos
    kt, pkpos = getstr(key_blob, 0)
    raw_pub, pkpos = getstr(key_blob, pkpos)
    st, sigpos = getstr(sig_blob, 0)
    raw_sig, sigpos = getstr(sig_blob, sigpos)
    if pkpos != len(key_blob) or sigpos != len(sig_blob) or kt != b"ssh-ed25519" or st != b"ssh-ed25519" or len(raw_pub) != 32 or len(raw_sig) != 64:
        raise ValueError(f"SSHSIG is not Ed25519: {kt!r}/{st!r} lengths={len(raw_pub)}/{len(raw_sig)}")
    digest = hashlib.sha512
    signed = b"SSHSIG" + _ssh_string(namespace) + _ssh_string(reserved) + _ssh_string(hash_alg) + _ssh_string(digest(b"" ).digest())
    # Replace the empty-message digest with caller's document digest in capsule().
    return raw_pub, raw_sig, namespace.decode(), hash_alg.decode(), signed

def _ssh_string(v: bytes) -> bytes:
    return struct.pack(">I", len(v)) + v

def ssh_public_der(pub_path: pathlib.Path) -> bytes:
    parts = pub_path.read_text().split()
    blob = base64.b64decode(parts[1], validate=True)
    kt, pos = _read_wire_string(blob, 0)
    raw, pos = _read_wire_string(blob, pos)
    if pos != len(blob) or kt != b"ssh-ed25519" or len(raw) != 32:
        raise ValueError("pinned public key is not OpenSSH Ed25519")
    return bytes.fromhex("302a300506032b6570032100") + raw

def _read_wire_string(data: bytes, pos: int):
    n = struct.unpack(">I", data[pos:pos+4])[0]; pos += 4
    v = data[pos:pos+n]; pos += n
    if len(v) != n: raise ValueError("truncated public key blob")
    return v, pos

def signed_preimage(doc: bytes) -> bytes:
    ns = NAMESPACE.encode()
    return b"SSHSIG" + _ssh_string(ns) + _ssh_string(b"") + _ssh_string(b"sha512") + _ssh_string(hashlib.sha512(doc).digest())

def verify_downloadback(candidate: pathlib.Path, downloaded: pathlib.Path, drive_id: str):
    if not drive_id or len(drive_id) < 20: raise ValueError("candidate private Drive identity missing")
    if candidate.read_bytes() != downloaded.read_bytes(): raise ValueError("candidate independent download-back differs")
    return sha(downloaded.read_bytes())

def verify_native(doc_path: pathlib.Path, sig_path: pathlib.Path, pub_path: pathlib.Path, identity: str):
    # Verify through the platform's OpenSSH implementation and the exact pinned key.
    with tempfile.TemporaryDirectory(prefix="c9-allowed-signers-") as td:
        allowed = pathlib.Path(td) / "allowed_signers"
        allowed.write_text(f"{identity} {pub_path.read_text().strip()}\n")
        p = subprocess.run(["ssh-keygen", "-Y", "verify", "-f", str(allowed), "-I", identity,
                            "-n", NAMESPACE, "-s", str(sig_path)], input=doc_path.read_bytes(),
                           capture_output=True)
        if p.returncode:
            raise ValueError("OpenSSH signature verification failed")

def rows(tsv: bytes):
    out = []
    for line in tsv.decode("utf-8").splitlines():
        fields = line.split("\t")
        if len(fields) != 5: raise ValueError("six.tsv row malformed")
        dest, rel, old, new, mode = fields
        if mode != "644" or len(old) != 64 or len(new) != 64: raise ValueError("six.tsv hash/mode malformed")
        out.append({"target": dest, "name": rel, "preimage_sha256": old, "postimage_sha256": new, "mode": mode})
    if len(out) != 6 or {x["target"] for x in out} != EXPECTED_TARGETS: raise ValueError("six target allowlist mismatch")
    return out

def verify_contract(doc: dict, manifest_bytes: bytes, tsv_bytes: bytes, zip_bytes: bytes,
                    rollback_bytes: bytes, installed: dict, key_fingerprint: str):
    if doc.get("schema") != "hbnf-c9-phase1a-owner-release-v1" or doc.get("scope") != SCOPE:
        raise ValueError("scope/schema mismatch")
    if doc.get("operation") != "install-six-owner-pwa-files-only": raise ValueError("operation mismatch")
    if not re.fullmatch(r"c9-phase1a-[0-9a-f]{32}", str(doc.get("transaction_id", ""))):
        raise ValueError("transaction ID is not a unique C9 Phase1A identifier")
    if doc.get("original_r6_preservation") != "NO_MATRIX_OR_AUX_FIRMWARE_OR_CONFIGURATION_WRITES":
        raise ValueError("original R6/Matrix preservation constraint absent")
    if doc.get("excluded_live_scopes") != ["C8_EDGE_SQL", "SCORING", "UV", "AUX_FIRMWARE", "MATRIX_FIRMWARE", "ROUTER_NETWORKING"]:
        raise ValueError("out-of-scope live mutation exclusion mismatch")
    if doc.get("manifest_sha256") != sha(manifest_bytes): raise ValueError("manifest digest mismatch")
    if doc.get("six_tsv_sha256") != sha(tsv_bytes): raise ValueError("six.tsv digest mismatch")
    if doc.get("candidate_zip_sha256") != sha(zip_bytes):
        raise ValueError("candidate ZIP identity mismatch")
    if doc.get("rollback_sha256") != sha(rollback_bytes) or sha(rollback_bytes) != EXPECTED_ROLLBACK:
        raise ValueError("rollback identity mismatch")
    m = json.loads(manifest_bytes)
    tx = m["transaction"]
    if tx.get("source_gate_change_admitted") is not False: raise ValueError("broad source gate must stay closed")
    if tx.get("manifest_specific_one_time_id") != doc["transaction_id"]:
        raise ValueError("transaction identity mismatch")
    if tx.get("c9_approval_key_fingerprint") != key_fingerprint: raise ValueError("manifest approval-key pin mismatch")
    if doc.get("approval_key_der_sha256") != tx.get("c9_approval_key_der_sha256"):
        raise ValueError("manifest approval-key DER pin mismatch")
    if tx.get("independent_release_backup_download_verified") is not True:
        raise ValueError("independent original rollback download-back not admitted")
    backup = tx.get("independent_release_backup_evidence", {})
    if (backup.get("source") != "#116 comment 6674667836" or
        backup.get("drive_id") != "1K98BkzHGzKjmmt_fWBDS30jc4SbE3_tB" or
        backup.get("bytes") != 849344 or backup.get("sha256") != EXPECTED_ROLLBACK):
        raise ValueError("independent rollback evidence identity mismatch")
    if doc.get("source_branch") != m["exact_source"]["branch"]: raise ValueError("source branch mismatch")
    c9 = m.get("c9_phase1a_opal_transaction_candidate_20261105", {})
    if doc.get("source_commit") != c9.get("source_candidate_commit"): raise ValueError("PWA candidate source commit mismatch")
    admission = c9.get("phase1a_admission", {})
    if admission.get("scope") != SCOPE or admission.get("transaction_id") != doc["transaction_id"]:
        raise ValueError("original manifest lacks exact scoped transaction binding")
    if admission.get("status") != "OWNER_SIGNATURE_REQUIRED": raise ValueError("manifest is not in signature-pending state")
    if admission.get("rollback_sha256") != sha(rollback_bytes): raise ValueError("manifest rollback binding mismatch")
    if doc.get("rollback_sha256") != EXPECTED_ROLLBACK: raise ValueError("wrong rollback")
    if doc.get("approval_key_fingerprint") != key_fingerprint: raise ValueError("approval key is not pinned")
    target_rows = rows(tsv_bytes)
    current = m["opal_c9_current_authenticated_inventory_20261105"]["six_current_preimage_sha256_by_path"]
    source_targets = {x["target"]:x for x in m["dora_c9_paired_owner_release_20261105"]["changed_targets"]}
    for row in target_rows:
        if current.get(row["target"]) != row["preimage_sha256"]: raise ValueError("manifest preimage mismatch")
        if source_targets.get(row["target"], {}).get("candidate_sha256") != row["postimage_sha256"]:
            raise ValueError("manifest candidate source hash mismatch")
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            if z.testzip() is not None or len(z.namelist()) != 11: raise ValueError("candidate ZIP integrity/member count mismatch")
            expected_names = {"REVIEW_RECEIPT.json", "candidate/ADMISSION.PENDING.json", "six.tsv",
                              "release/c9-six-file-opal-preflight.REVIEW_ONLY.sh",
                              "release/c9-six-file-opal.CANDIDATE.sh"}
            expected_names.update("candidate/" + x["name"] for x in target_rows)
            if set(z.namelist()) != expected_names: raise ValueError("candidate ZIP member allowlist mismatch")
            if z.read("six.tsv") != tsv_bytes or z.read("candidate/ADMISSION.PENDING.json") != manifest_bytes:
                raise ValueError("review snapshot manifest/six.tsv mismatch")
            if doc.get("review_snapshot_manifest_sha256") != sha(z.read("candidate/ADMISSION.PENDING.json")):
                raise ValueError("frozen review snapshot digest mismatch")
            if sha(z.read("release/c9-six-file-opal.CANDIDATE.sh")) != doc.get("verifier_script_sha256"):
                raise ValueError("packaged installer differs from signed source identity")
            review = json.loads(z.read("REVIEW_RECEIPT.json"))
            if (review.get("disposition") != "REVIEW_ONLY_NOT_INSTALLABLE_NO_ADMISSION_RECEIPT" or
                review.get("manifest_sha256") != sha(manifest_bytes) or
                review.get("six_targets_sha256") != sha(tsv_bytes) or
                review.get("source_gate_admitted") is not False):
                raise ValueError("review package receipt mismatch")
            for row in target_rows:
                if sha(z.read("candidate/" + row["name"])) != row["postimage_sha256"]:
                    raise ValueError("ZIP postimage mismatch: " + row["target"])
    except (zipfile.BadZipFile, KeyError) as exc:
        raise ValueError("candidate ZIP member set invalid") from exc
    if doc.get("targets") != target_rows: raise ValueError("target pre/postimage set mismatch")
    if installed != {x["target"]: x["preimage_sha256"] for x in target_rows}:
        raise ValueError("fresh installed preimage mismatch")
    limitations = doc.get("recovery_limitations", {})
    if limitations != {"ubifs_process_reentry_restore":"PASS_ACTUAL_ROUTER",
                       "abrupt_power_loss":"NOT_TESTED",
                       "partial_active_file_restore":"NOT_FAULT_INJECTED",
                       "owner_accepted_bounded_risk":True}:
        raise ValueError("recovery claims mismatch")

def make_capsule(doc_path: pathlib.Path, sig_path: pathlib.Path, pub_path: pathlib.Path, outdir: pathlib.Path):
    raw_pub, raw_sig, _, _, _ = parse_sshsig(sig_path)
    # Bind the embedded SSHSIG public key to the pinned OpenSSH public key.
    line = pub_path.read_text().split()
    pinned_der = ssh_public_der(pub_path)
    if raw_pub != pinned_der[-32:]:
        raise ValueError("signature embeds a different public key")
    outdir.mkdir(mode=0o700, parents=True, exist_ok=True)
    (outdir / "C9_RELEASE_APPROVAL.json").write_bytes(doc_path.read_bytes())
    (outdir / "C9_APPROVAL_MESSAGE.bin").write_bytes(signed_preimage(doc_path.read_bytes()))
    (outdir / "C9_APPROVAL_SIGNATURE.raw").write_bytes(raw_sig)
    (outdir / "C9_APPROVAL_PUBKEY.der").write_bytes(pinned_der)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--decision", type=pathlib.Path, required=True)
    ap.add_argument("--signature", type=pathlib.Path, required=True)
    ap.add_argument("--public-key", type=pathlib.Path, required=True)
    ap.add_argument("--identity", required=True)
    ap.add_argument("--source-root", type=pathlib.Path, required=True)
    ap.add_argument("--manifest", type=pathlib.Path, required=True)
    ap.add_argument("--six-tsv", type=pathlib.Path, required=True)
    ap.add_argument("--candidate-zip", type=pathlib.Path, required=True)
    ap.add_argument("--candidate-download-back", type=pathlib.Path, required=True)
    ap.add_argument("--candidate-drive-id", required=True)
    ap.add_argument("--rollback", type=pathlib.Path, required=True)
    ap.add_argument("--installed-preimages", type=pathlib.Path, required=True)
    ap.add_argument("--capsule-out", type=pathlib.Path, required=True)
    a = ap.parse_args()
    if a.identity != "oookkkaaayyy":
        raise ValueError("production signer principal must match the Controls owner")
    doc_bytes = a.decision.read_bytes(); doc = json.loads(doc_bytes)
    fp = subprocess.check_output(["ssh-keygen", "-lf", str(a.public_key), "-E", "sha256"], text=True).split()[1]
    manifest = a.manifest.read_bytes()
    m = json.loads(manifest)
    if m["transaction"].get("c9_approval_key_fingerprint") != fp:
        raise ValueError("production approval key is absent or does not match the original manifest pin")
    installed = json.loads(a.installed_preimages.read_bytes())
    downloaded_sha = verify_downloadback(a.candidate_zip,a.candidate_download_back,a.candidate_drive_id)
    if downloaded_sha != doc.get("candidate_zip_sha256") or doc.get("candidate_drive_id") != a.candidate_drive_id:
        raise ValueError("candidate download-back identity mismatch")
    verify_contract(doc, manifest, a.six_tsv.read_bytes(), a.candidate_zip.read_bytes(),
                    a.rollback.read_bytes(), installed, fp)
    verify_native(a.decision, a.signature, a.public_key, a.identity)
    head = subprocess.check_output(["git", "-C", str(a.source_root), "rev-parse", "HEAD"], text=True).strip()
    if doc.get("verifier_source_commit") != head:
        raise ValueError("verifier source commit mismatch")
    if doc.get("verifier_script_sha256") != sha((a.source_root / "staging/cart116-glow-v35-exact-review/release/c9-six-file-opal.CANDIDATE.sh").read_bytes()):
        raise ValueError("installer source digest mismatch")
    make_capsule(a.decision, a.signature, a.public_key, a.capsule_out)
    if sha((a.capsule_out / "C9_APPROVAL_PUBKEY.der").read_bytes()) != m["transaction"].get("c9_approval_key_der_sha256"):
        raise ValueError("derived verifier key does not match original manifest pin")
    print("C9_PHASE1A_OWNER_SIGNATURE_AND_FROZEN_CONTRACT_VERIFIED")

if __name__ == "__main__":
    try: main()
    except (OSError, ValueError, KeyError, json.JSONDecodeError, subprocess.CalledProcessError) as e:
        print("C9_ADMISSION_REFUSED:", str(e), file=sys.stderr); sys.exit(2)
