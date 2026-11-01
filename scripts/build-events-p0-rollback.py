#!/usr/bin/env python3
"""Prepare a scoped, fail-closed Events P0 rollback *inventory* from a private DB snapshot.

This intentionally does NOT emit executable SQL. Admission needs a fresh pre-mutation
snapshot and a tested forward/reverse transaction, including dynamic source rows.
No private production snapshot rows or credential-bearing definitions are committed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

MIGRATION_700 = "20261101070000_event_detail_fields_and_provenance.sql"
MIGRATION_800 = "20261101080000_reconcile_verified_schedule_fields.sql"
SOURCE_KEYS = frozenset({
    "local_roots_submissions", "hbnf_internal_schedule", "hbnf_udisc_manual",
    "oak_grove_disc_golf_club_direct", "crpd_rabbit_flats_direct",
})
TOUCHED_EXISTING_TABLES = frozenset({
    "lr_events", "lr_event_sources", "lr_sources", "lr_source_runs",
    "lr_source_candidates", "lr_event_change_log", "lr_review_queue",
})


def checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def make_inventory(snapshot: dict, migration_700: str, migration_800: str, definitions: str) -> dict:
    require(set(snapshot) >= {"tables", "schema", "snapshot_at"}, "snapshot sections missing")
    tables = snapshot["tables"]
    schema = snapshot["schema"]
    require(TOUCHED_EXISTING_TABLES <= set(tables), "rollback preimages for touched tables missing")
    require(set(schema) >= {"columns", "functions", "indexes", "constraints"}, "schema inventory incomplete")

    # Strictly derive the changed table columns; never guess from current schema.
    created = {}
    for block in re.finditer(r"(?is)alter\s+table\s+public\.(lr_\w+)\s+(.*?);", migration_700):
        table = block.group(1)
        fields = re.findall(r"(?i)add\s+column\s+if\s+not\s+exists\s+(\w+)", block.group(2))
        if fields:
            created[table] = fields
    require(set(created) == {"lr_sources", "lr_events", "lr_event_submissions"}, "unexpected additive column scope")
    existing = {(c["table_name"], c["column_name"]) for c in schema["columns"]}
    collisions = [f"{t}.{c}" for t, cols in created.items() for c in cols if (t, c) in existing]
    require(not collisions, "new fields already existed in captured baseline: " + ", ".join(collisions))

    old_functions = {f["name"] for f in schema["functions"]}
    revised = set(re.findall(r"(?i)create\s+or\s+replace\s+function\s+public\.(lr_\w+)\s*\(", migration_700))
    created_functions = set(re.findall(r"(?i)create\s+function\s+public\.(lr_\w+)\s*\(", migration_700))
    replaced = sorted(revised & old_functions)
    new_functions = sorted((revised | created_functions) - old_functions)
    # Some RETURN TABLE signatures require DROP+CREATE rather than OR REPLACE.
    dropped = set(re.findall(r"(?i)drop\s+function\s+if\s+exists\s+public\.(lr_\w+)\s*\(", migration_700))
    overwritten = sorted(set(replaced) | (created_functions & old_functions) | dropped)
    definition_names = set(re.findall(r"(?i)create\s+or\s+replace\s+function\s+public\.(lr_\w+)\s*\(", definitions))
    missing_definitions = sorted(set(overwritten) - definition_names)
    require(not missing_definitions, "exact prechange function definitions missing: " + ", ".join(missing_definitions))

    old_sources = {r["key"]: r for r in tables["lr_sources"]}
    source_missing = sorted((SOURCE_KEYS - {"hbnf_udisc_manual"}) - old_sources.keys())
    require(not source_missing, "old source preimage missing: " + ", ".join(source_missing))
    require("hbnf_udisc_manual" not in old_sources, "new source key already existed in baseline")

    source_id_by_key = {k: v["id"] for k, v in old_sources.items()}
    oak = source_id_by_key["oak_grove_disc_golf_club_direct"]
    crpd = source_id_by_key["crpd_rabbit_flats_direct"]
    selected = []
    for row in tables["lr_event_sources"]:
        p = row.get("source_payload") or {}
        if row["source_id"] == oak and p.get("schedule_derived") is True and p.get("published_time"):
            selected.append(row)
        elif row["source_id"] == crpd and p.get("recurrence") == "first Saturday monthly" and p.get("time_local"):
            selected.append(row)
    selected_ids = {r["event_id"] for r in selected}
    event_preimages = {r["id"]: r for r in tables["lr_events"] if r["id"] in selected_ids}
    require(len(selected) == len(selected_ids) == len(event_preimages), "schedule source/event preimages not one-to-one")
    require(Counter(r["source_id"] for r in selected) == {oak: 34, crpd: 3},
            "37-row schedule reconciliation source split does not match tested candidate")
    require("schedule-field-reconciliation-v1" in migration_800,
            "reconciliation provenance marker absent")
    require("lr_process_candidate" in migration_800 and "lr_apply_authoritative_candidate" in migration_800,
            "migration no longer uses source candidate promotion")

    # New or replaced schema objects and *all* mutable table families must be
    # recovered. Captured table rows are inputs, not permission to overwrite them.
    require(all(isinstance(tables[k], list) for k in TOUCHED_EXISTING_TABLES),
            "row preimages malformed")
    return {
        "status": "PREIMAGE_INVENTORY_PASS__ROLLBACK_NOT_ADMITTED",
        "captured_at": snapshot["snapshot_at"],
        "changes": {
            "new_columns_by_table": created,
            "overwritten_functions_with_exact_old_definitions": overwritten,
            "new_functions_to_remove": new_functions,
            "new_event_evidence_table": "lr_event_field_evidence",
            "new_event_field_view": "lr_event_field_status",
            "new_indexes": ["lr_event_field_evidence_source_key", "lr_event_field_evidence_manual_key",
                            "lr_event_field_evidence_expiry_idx", "lr_event_field_review_dedupe_idx"],
            "new_source_key": "hbnf_udisc_manual",
            "existing_sources_to_restore": sorted(SOURCE_KEYS - {"hbnf_udisc_manual"}),
            "reconciliation_source_run_count": 2,
            "reconciliation_source_candidate_count": len(selected),
            "reconciliation_source_counts": {
                "oak_grove_disc_golf_club_direct": 34,
                "crpd_rabbit_flats_direct": 3,
            },
            "reconciliation_event_ids": sorted(selected_ids),
            "preimage_tables": {k: len(tables[k]) for k in sorted(TOUCHED_EXISTING_TABLES)},
        },
        "unsatisfied_release_requirements": [
            "Fresh snapshot immediately before admission: historical snapshot can drift after scheduled sync",
            "Executable reversed DDL/data restoration of 700 and 800, with FK/trigger/ACL dependencies",
            "Test actual forward+reverse of the 37 source candidates and associated change/review/source lineage rows in PostgreSQL",
            "Prove rollback refuses post-migration concurrent updates without clobbering unrelated events",
            "Private durable upload plus byte-for-byte download-back of exact reverse SQL, candidate and rollback",
            "One-time same-manifest Events DB admission PASS and guarded closeout receipt",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", required=True, type=Path)
    parser.add_argument("--prechange-functions", required=True, type=Path)
    parser.add_argument("--migrations", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    for path in (args.snapshot, args.prechange_functions,
                 args.migrations / MIGRATION_700, args.migrations / MIGRATION_800):
        require(path.is_file(), "missing explicit input: " + str(path))
    d = json.loads(args.snapshot.read_text())
    report = make_inventory(d, (args.migrations / MIGRATION_700).read_text(),
                            (args.migrations / MIGRATION_800).read_text(),
                            args.prechange_functions.read_text())
    report["inputs"] = {
        "snapshot_sha256": checksum(args.snapshot),
        "prechange_functions_sha256": checksum(args.prechange_functions),
        "migration_700_sha256": checksum(args.migrations / MIGRATION_700),
        "migration_800_sha256": checksum(args.migrations / MIGRATION_800),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(f"{report['status']}: {len(report['changes']['reconciliation_event_ids'])} source-backed rows; output {args.out}")


if __name__ == "__main__":
    main()
