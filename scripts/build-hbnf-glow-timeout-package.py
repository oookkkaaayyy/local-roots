#!/usr/bin/env python3
"""Build the exact one-migration, Supabase-only HBNF Glow timeout candidate."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import stat
from datetime import datetime
import zipfile

MIGRATION = "supabase/migrations/20261031093828_hbnf_glow_anon_cas_statement_timeout_8s.sql"
ROLLBACK = (
    "-- Restore the original function-level timeout configuration.\n"
    "ALTER FUNCTION public.hbnf_save_league_state_v1(timestamptz, jsonb)\n"
    "  RESET statement_timeout;\n"
)
BACKUP_ID = "13NHe8yWnKpiiCB1F7coDVXM8ryR22IX9"
BACKUP_SHA = "2c2e16d62a9b368fb586e50b739901d6fe8d6a2bf38f261149d5e6673bc3be02"
BACKUP_BYTES = 2552596
PROJECT = "phcpbvuqibyarpfrftgx"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pg_jsonb_text(value) -> str:
    if isinstance(value, list):
        return "[" + ", ".join(pg_jsonb_text(x) for x in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value, key=lambda x: (len(x.encode()), x.encode()))
        return "{" + ", ".join(json.dumps(k, ensure_ascii=False) + ": " + pg_jsonb_text(value[k]) for k in keys) + "}"
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def deterministic_zip(path: Path, files: dict[str, bytes]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED, strict_timestamps=True) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o600) << 16
            archive.writestr(info, data)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--baseline-evidence", type=Path, required=True)
    parser.add_argument("--baseline-snapshot", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    repo = args.repo.resolve()
    if len(args.source_commit) != 40:
        raise SystemExit("source commit must be a full SHA")
    if subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip() != args.source_commit:
        raise SystemExit("source commit must equal the checked-out HEAD")
    if subprocess.check_output(["git", "-C", str(repo), "branch", "--show-current"], text=True).strip() != "feature/udisc-glow-standings-prototype":
        raise SystemExit("builder must run on the existing HBNF feature branch")
    migration = subprocess.check_output(["git", "-C", str(repo), "show", f"{args.source_commit}:{MIGRATION}"])
    if migration != (repo / MIGRATION).read_bytes():
        raise SystemExit("migration bytes differ from the exact source commit")
    rollback = ROLLBACK.encode()

    snapshot_bytes = args.baseline_snapshot.read_bytes()
    if len(snapshot_bytes) != BACKUP_BYTES or sha(snapshot_bytes) != BACKUP_SHA:
        raise SystemExit("recovery snapshot does not match the independently verified baseline bytes")
    rows = json.loads(snapshot_bytes)
    if not isinstance(rows, list) or len(rows) != 1 or rows[0].get("id") != 1:
        raise SystemExit("recovery snapshot is not exactly public.league_state id 1")
    row = rows[0]
    state_text = pg_jsonb_text(row["state_json"])
    state_md5 = hashlib.md5(state_text.encode()).hexdigest()
    evidence = json.loads(args.baseline_evidence.read_text())
    def timestamp(value: str):
        normalized = value.replace("Z", "+00:00")
        if normalized.endswith("+00"):
            normalized += ":00"
        return datetime.fromisoformat(normalized)
    try:
        state_time_equal = timestamp(evidence["stateUpdatedAt"]) == timestamp(row["updated_at"])
    except (KeyError, TypeError, ValueError):
        state_time_equal = False
    if evidence.get("project") != PROJECT or evidence.get("stateMd5") != state_md5 or evidence.get("stateBytes") != len(state_text.encode()) or not state_time_equal:
        raise SystemExit("fresh provider baseline does not match the exact recovery snapshot")
    if evidence.get("anonConfig") != ["statement_timeout=3s"] or evidence.get("functionConfig") != ['search_path=""'] or evidence.get("legacyAnonWrites") is not True or evidence.get("tagMatrixTriggers") != 3:
        raise SystemExit("timeout, CAS function, legacy grants, or trigger baseline differs")
    if row["state_json"].get("glow", {}).get("activeWeek") != evidence.get("activeWeek") or ("2026-11-03" in row["state_json"].get("glow", {}).get("weeks", {})) != evidence.get("nov3Exists"):
        raise SystemExit("week state differs between the snapshot and provider baseline")
    if evidence.get("activeWeek") != "2026-10-28" or evidence.get("nov3Exists") is not False:
        raise SystemExit("unexpected active or November 3 week state")

    package_manifest = {
        "format": "hbnf-glow-timeout-migration-package-v1",
        "releaseId": "hbnf-glow-save-timeout-20261031",
        "source": {"repository": "oookkkaaayyy/local-roots", "ref": "feature/udisc-glow-standings-prototype", "commit": args.source_commit},
        "target": {"provider": "supabase", "project": PROJECT},
        "baseline": {"stateUpdatedAt": evidence["stateUpdatedAt"], "stateJsonBytes": evidence["stateBytes"], "stateMd5": evidence["stateMd5"], "anonRoleConfig": evidence["anonConfig"], "rpcConfig": evidence["functionConfig"], "tagMatrixTriggerCount": evidence["tagMatrixTriggers"], "legacyAnonWriteGrants": evidence["legacyAnonWrites"], "recoveryDriveId": BACKUP_ID, "recoveryBytes": BACKUP_BYTES, "recoverySha256": BACKUP_SHA},
        "migration": {"path": "migration/20261031093828_hbnf_glow_anon_cas_statement_timeout_8s.sql", "sha256": sha(migration), "bytes": len(migration)},
        "rollback": {"path": "rollback/reset_function_statement_timeout.sql", "sha256": sha(rollback), "bytes": len(rollback), "procedure": "Apply this exact ALTER FUNCTION RESET statement_timeout; verify the function retains search_path and anon remains at 3 seconds."},
        "scope": "One Supabase function-level statement_timeout setting only. No Worker, cron, score, league_state, role, database, tag, Matrix, Skins, or permission changes.",
        "acceptance": [
            "Migration ledger records this exact migration once.",
            "Function config contains statement_timeout=8s while anon role remains statement_timeout=3s.",
            "CAS function body, permissions, revision/tag/Matrix triggers, legacy direct-write grants, and league_state fingerprint remain intact.",
            "Repeated normal Glow UI writes receive RPC acknowledgements and independent readback; failed retries retain local drafts.",
        ],
    }
    manifest_bytes = (json.dumps(package_manifest, indent=2) + "\n").encode()
    files = {"migration/20261031093828_hbnf_glow_anon_cas_statement_timeout_8s.sql": migration,
             "rollback/reset_function_statement_timeout.sql": rollback,
             "PACKAGE_MANIFEST.json": manifest_bytes}
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    candidate = output / "HBNF-glow-timeout-migration.zip"
    deterministic_zip(candidate, files)
    (output / "HBNF-glow-timeout-migration-PACKAGE_MANIFEST.json").write_bytes(manifest_bytes)
    print(json.dumps({"result": "PASS", "sourceCommit": args.source_commit,
                      "candidate": {"path": candidate.name, "bytes": candidate.stat().st_size, "sha256": sha(candidate.read_bytes())},
                      "migrationSha256": sha(migration), "rollbackSha256": sha(rollback),
                      "baseline": {"stateBytes": evidence["stateBytes"], "stateMd5": state_md5, "backupSha256": BACKUP_SHA}}, indent=2))


if __name__ == "__main__":
    main()
