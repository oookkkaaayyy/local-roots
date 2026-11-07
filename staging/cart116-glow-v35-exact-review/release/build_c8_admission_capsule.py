#!/usr/bin/env python3
"""Build the exact C8 review capsule; source-only and never deploys anything."""
from __future__ import annotations
import argparse
import hashlib
import json
import pathlib
import subprocess
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
EXPECTED_ROLLBACK_TREE = "74dd1d687de44eacb20eff8e3960d9129948ef88"
EXPECTED_SQL = {
    "sql/20261103_cart_glow_overlay_v1_REVIEW_ONLY.sql": ("migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.sql", "545c1e5bdbd96f631007f6f9f1fdbc84c47a8bc1"),
    "sql/20261103_cart_glow_overlay_v1_REVIEW_ONLY.down.sql": ("migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.down.sql", "7d5271d1aaa7a1acaf5dcce16448030c79ff3e3b"),
}
EDGE_DIRS = [("edge/candidate/", ROOT / "candidate-source"), ("edge/rollback-v35/", ROOT / "rollback-v35")]
TARGETS = ROOT / "release/TARGETS.PENDING.tsv"
OPAL_MAP = {
    "candidate/opal/usr/libexec/hbnf-cart-glow-bridge": ROOT / "opal/new-service/usr/libexec/hbnf-cart-glow-bridge",
    "candidate/opal/etc/init.d/hbnf-cart-glow-bridge": ROOT / "opal/new-service/etc/init.d/hbnf-cart-glow-bridge",
    "candidate/opal/usr/libexec/hbnf-cart-glow-provision": ROOT / "opal/new-service/usr/libexec/hbnf-cart-glow-provision",
    "candidate/opal/usr/lib/hbnf-glow-overlay-v1.sh": ROOT / "opal/hbnf-glow-overlay-v1.sh",
}
OWNER_MARKER = ROOT / "opal/owner-v1201-7target/owner-pwa/.hbnf-package-version"

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def git_blob(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def tree(path: pathlib.Path) -> str:
    repo = ROOT.parent.parent
    rel = path.relative_to(repo)
    return subprocess.check_output(["git", "rev-parse", "HEAD:" + rel.as_posix()], cwd=repo, text=True).strip()

def source_files() -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    for prefix, directory in EDGE_DIRS:
        for p in sorted(directory.rglob("*")):
            if p.is_symlink(): raise ValueError("symlink in source tree: " + str(p))
            if p.is_file(): files[prefix + p.relative_to(directory).as_posix()] = p.read_bytes()
    if tree(ROOT / "rollback-v35") != EXPECTED_ROLLBACK_TREE:
        raise ValueError("pinned v35 source-equivalent rollback tree drift")
    for package_path, (source_path, expected) in EXPECTED_SQL.items():
        data = (ROOT / source_path).read_bytes()
        if git_blob(data) != expected: raise ValueError("SQL blob drift: " + package_path)
        files[package_path] = data
    owner_version = OWNER_MARKER.read_text().strip()
    if owner_version != "1.0.21-c9pair1": raise ValueError("C9 installed source baseline drift")
    for target, source in OPAL_MAP.items(): files[target] = source.read_bytes()
    rows = []
    for line in TARGETS.read_text().splitlines():
        dest, member, expected, pre, mode = line.split("\t")
        if dest != "/" + member.removeprefix("candidate/opal/"): raise ValueError("target/member mismatch: " + dest)
        if pre != "ABSENT": raise ValueError("C8 target preimage contract changed: " + dest)
        if member not in OPAL_MAP or sha(files[member]) != expected: raise ValueError("C8 target digest/path mismatch: " + dest)
        rows.append({"target": dest, "member": member, "postimage_sha256": expected, "preimage": pre, "mode": mode})
    if len(rows) != 4 or {x["member"] for x in rows} != set(OPAL_MAP): raise ValueError("C8 scope must contain exactly four managed Opal targets")
    if any(name.startswith("candidate/opal/www/") for name in files): raise ValueError("Owner PWA candidate files forbidden")
    info = {
        "schema": "cart116-c8-source-review-capsule-v1",
        "authority": "Existing #116 Controls admission; no independent release authority",
        "scope": "C8 Edge source + its C8 RPC SQL migration + four managed Opal service targets only",
        "owner_approval": {"source_equivalent_v35_rollback_accepted_comment": "6703142723", "rollback_policy": "CART116_EDGE_V35_SOURCE_EQUIVALENT_RESTORE_CONDITIONAL_V1"},
        "controls_branch": "review/cart116-glow-canonical-intent-20261103",
        "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT.parent.parent, text=True).strip(),
        "candidate_edge_tree_git_sha1": tree(ROOT / "candidate-source"),
        "rollback_edge_tree_git_sha1": tree(ROOT / "rollback-v35"),
        "provider": {"project_id": "phcpbvuqibyarpfrftgx", "function": "hbnf-cart-control", "rollback_version": 35,
            "rollback_ezbr_sha256_reference": "377945d8c9c930420ac36febd304d2a4d5f632cbcc4c9e3467c8f440aaa04e73",
            "candidate_entrypoint": "index.ts", "candidate_import_map": "deno.json", "candidate_verify_jwt": False,
            "deno_config_sha256": sha((ROOT / "candidate-source/deno.json").read_bytes()),
            "rollback_strategy": "same-project exact source/config redeploy; new version/digest expected; no compiled-byte equality claim"},
        "c9_baseline": {"owner_marker": owner_version, "pwa_targets_in_candidate": 0,
            "frozen_manifest_sha256": "1edbf89beeffad87f412a9b58532957ac270ef71966164c9146393ee542e1bbf",
            "transaction_id": "c9-phase1a-5518d5434a3b4ec99c573947803d42a6"},
        "sql_migrations": {name: git_blob(data) for name, data in files.items() if name in EXPECTED_SQL},
        "opal_targets": rows,
        "rollback_source_files": {name.removeprefix("edge/rollback-v35/"): sha(data) for name, data in files.items() if name.startswith("edge/rollback-v35/")},
        "edge_candidate_files": {name.removeprefix("edge/candidate/"): sha(data) for name, data in files.items() if name.startswith("edge/candidate/")},
        "candidate_compiled_digest": "NOT_AVAILABLE_UNTIL_PROVIDER_BUILD_AND_READBACK",
        "live_install_authorized": False,
        "matrix_firmware_or_parity_uv_or_aux_firmware_included": False,
    }
    files["C8-PACKAGE.json"] = (json.dumps(info, sort_keys=True, indent=2) + "\n").encode()
    files["SHA256SUMS.txt"] = "".join(f"{sha(data)}  {name}\n" for name, data in sorted(files.items())).encode()
    return files

def build(output: pathlib.Path) -> dict:
    files = source_files(); output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as z:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 6, 0, 0, 0)); info.create_system=3; info.external_attr=0o100644<<16
            z.writestr(info, data)
    with zipfile.ZipFile(output) as z:
        if z.testzip() is not None: raise ValueError("ZIP CRC failure")
        if any(n.startswith("candidate/opal/www/") for n in z.namelist()): raise ValueError("Owner PWA present")
        for row in z.read("SHA256SUMS.txt").decode().splitlines():
            expected, name = row.split("  ", 1)
            if sha(z.read(name)) != expected: raise ValueError("embedded digest mismatch: " + name)
    return {"path": str(output), "bytes": output.stat().st_size, "members": len(files), "sha256": sha(output.read_bytes()), "owner_pwa_targets": 0, "live_install_authorized": False}

if __name__ == "__main__":
    ap=argparse.ArgumentParser();ap.add_argument("--out",required=True,type=pathlib.Path)
    print(json.dumps(build(ap.parse_args().out),sort_keys=True,indent=2))
