#!/usr/bin/env python3
"""Build the deterministic, migration-only anon PostgREST read-timeout package."""
import argparse
import hashlib
import json
from pathlib import Path
import stat
import subprocess
import zipfile

MIGRATION = "supabase/migrations/20261031101000_hbnf_anon_read_timeout_8s.sql"
ROLLBACK = "-- Restore the previously verified anonymous role timeout.\nALTER ROLE anon SET statement_timeout = '3s';\nNOTIFY pgrst, 'reload config';\n"
PROJECT = "phcpbvuqibyarpfrftgx"
PREVIOUS_MIGRATION = "20261031093828_hbnf_glow_anon_cas_statement_timeout_8s"
TRIGGERS = sorted([
    "hbnf_matrix_vnext_capture_after_state_change",
    "hbnf_project_current_tags_into_league_state",
    "trg_hbnf_matrix_sync",
    "zzz_hbnf_enforce_league_state_revision",
])

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def pg_jsonb_text(value):
    if isinstance(value, list):
        return "[" + ", ".join(pg_jsonb_text(x) for x in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value, key=lambda x: (len(x.encode()), x.encode()))
        return "{" + ", ".join(json.dumps(k, ensure_ascii=False) + ": " + pg_jsonb_text(value[k]) for k in keys) + "}"
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

def deterministic_zip(path: Path, files: dict[str, bytes]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED, strict_timestamps=True) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o600) << 16
            archive.writestr(info, data)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", type=Path, required=True)
    ap.add_argument("--source-commit", required=True)
    ap.add_argument("--baseline-evidence", type=Path, required=True)
    ap.add_argument("--baseline-snapshot", type=Path, required=True)
    ap.add_argument("--backup-drive-id", required=True)
    ap.add_argument("--output", type=Path, required=True)
    a = ap.parse_args()
    repo = a.repo.resolve()
    if subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip() != a.source_commit:
        raise SystemExit("source commit must equal checked-out HEAD")
    if subprocess.check_output(["git", "-C", str(repo), "branch", "--show-current"], text=True).strip() != "feature/udisc-glow-standings-prototype":
        raise SystemExit("builder must use the existing HBNF feature branch")
    migration = subprocess.check_output(["git", "-C", str(repo), "show", f"{a.source_commit}:{MIGRATION}"])
    if migration != (repo / MIGRATION).read_bytes():
        raise SystemExit("migration bytes differ from exact source commit")
    snap_bytes = a.baseline_snapshot.read_bytes()
    row = json.loads(snap_bytes)
    if isinstance(row, list):
        if len(row) != 1: raise SystemExit("snapshot must contain exactly league_state id 1")
        row = row[0]
    if row.get("id") != 1: raise SystemExit("snapshot is not league_state id 1")
    evidence = json.loads(a.baseline_evidence.read_text())
    state_text = pg_jsonb_text(row["state_json"]).encode()
    state_md5 = hashlib.md5(state_text).hexdigest()
    if evidence.get("project") != PROJECT or evidence.get("stateMd5") != state_md5 or evidence.get("stateBytes") != len(state_text):
        raise SystemExit("fresh provider readback does not match the exact recovered snapshot")
    def normalize_ts(value):
        value = str(value or "").replace(" ", "T")
        return value.replace("+00:00", "Z").replace("+00", "Z")
    if normalize_ts(row.get("updated_at")) != normalize_ts(evidence.get("stateUpdatedAt")):
        raise SystemExit("snapshot revision differs from provider readback")
    expected = {
        "anonConfig": ["statement_timeout=3s"],
        "authenticatorConfig": ["session_preload_libraries=safeupdate", "statement_timeout=8s", "lock_timeout=8s"],
        "functionConfig": ['search_path=""', "statement_timeout=8s"],
        "functionMd5": "8bf371de3aff3355071345b59a50397e",
        "triggerDefsMd5": "3b0bb6d2cd1a2bacf3cd76a4e6f35f76",
        "triggers": TRIGGERS,
        "legacyAnonWrites": True,
        "targetMigrationPresent": False,
        "previousMigrationPresent": True,
        "migrationLedgerCount": 85,
        "activeWeek": "2026-10-28",
        "nov3Exists": True,
    }
    for k, v in expected.items():
        actual = sorted(evidence[k]) if k == "triggers" else evidence.get(k)
        if actual != v:
            raise SystemExit(f"unexpected fresh baseline at {k}: {actual!r}")
    if evidence.get("nov3Players") != 0 or evidence.get("nov3Locked") is not False:
        raise SystemExit("November 3 must exist, remain unlocked, and contain no players")

    rollback = ROLLBACK.encode()
    manifest = {
        "format": "hbnf-glow-anon-read-timeout-package-v1",
        "releaseId": "hbnf-glow-anon-read-timeout-20261031",
        "source": {"repository": "oookkkaaayyy/local-roots", "ref": "feature/udisc-glow-standings-prototype", "commit": a.source_commit},
        "target": {"provider": "supabase", "project": PROJECT},
        "baseline": {"stateUpdatedAt": evidence["stateUpdatedAt"], "stateBytes": evidence["stateBytes"], "stateMd5": state_md5,
                     "anonRoleConfig": evidence["anonConfig"], "functionConfig": evidence["functionConfig"], "functionMd5": evidence["functionMd5"],
                     "authenticatorConfig": evidence["authenticatorConfig"], "triggers": TRIGGERS,
                     "triggerDefsMd5": evidence["triggerDefsMd5"], "legacyAnonWrites": True, "migrationLedgerCount": 85,
                     "recoveryDriveId": a.backup_drive_id, "recoverySha256": sha(snap_bytes), "recoveryBytes": len(snap_bytes)},
        "migration": {"path": "migration/20261031101000_hbnf_anon_read_timeout_8s.sql", "sha256": sha(migration), "bytes": len(migration)},
        "rollback": {"path": "rollback/reset_anon_statement_timeout.sql", "sha256": sha(rollback), "bytes": len(rollback),
                     "procedure": "Apply exact ALTER ROLE anon SET statement_timeout = '3s'; issue NOTIFY pgrst, 'reload config'; verify the role setting is 3s and preserve the already-installed function-local 8s timeout."},
        "scope": "Set statement_timeout to 8s only for database role anon, so its bounded PostgREST reads can complete; do not change authenticator/database/global settings, function body, permissions, triggers, Worker, league_state, scores, tags, Matrix, payouts, or Skins.",
        "acceptance": [
            "Apply the exact migration once; ledger advances by one and records its exact name.",
            "anon role config is exactly statement_timeout=8s; authenticator/database and CAS function-local 8s settings remain unchanged.",
            "The Glow anonymous PostgREST league_state read returns the complete row without SQLSTATE 57014 after PostgREST config reload; browser confirms the pending Nov 3 draft is acknowledged and independent GET matches.",
            "Historical state, Nov 3 empty/unlocked state, function body, CAS grants, all four triggers, and legacy anon scoring grants remain intact.",
        ],
    }
    manifest_bytes = (json.dumps(manifest, indent=2) + "\n").encode()
    files = {"migration/20261031101000_hbnf_anon_read_timeout_8s.sql": migration,
             "rollback/reset_anon_statement_timeout.sql": rollback,
             "PACKAGE_MANIFEST.json": manifest_bytes}
    out = a.output.resolve(); out.mkdir(parents=True, exist_ok=True, mode=0o700)
    zip_path = out / "HBNF-glow-anon-read-timeout-migration.zip"
    deterministic_zip(zip_path, files)
    (out / "HBNF-glow-anon-read-timeout-PACKAGE_MANIFEST.json").write_bytes(manifest_bytes)
    print(json.dumps({"result":"PASS","sourceCommit":a.source_commit,"candidate":{"path":zip_path.name,"bytes":zip_path.stat().st_size,"sha256":sha(zip_path.read_bytes())},"migrationSha256":sha(migration),"rollbackSha256":sha(rollback),"baseline":{"stateUpdatedAt":evidence["stateUpdatedAt"],"stateMd5":state_md5,"snapshotSha256":sha(snap_bytes)}},indent=2))

if __name__ == "__main__": main()
