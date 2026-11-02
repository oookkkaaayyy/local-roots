#!/usr/bin/env python3
"""Build a scoped, fail-closed reverse SQL artifact from a private DB preimage.

The SQL embeds only rows changed by the two named Events migrations. It aborts on
unexpected lineage/count/timestamp drift, so a stale snapshot cannot silently be
used as a production restore. The caller must retain a fresh pre-mutation snapshot.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import base64
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


def sql_b64(value: object) -> str:
    raw = json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()
    return f"convert_from(decode('{base64.b64encode(raw).decode()}','base64'),'UTF8')::jsonb"


def qident(value: str) -> str:
    require(re.fullmatch(r"[a-z_][a-z0-9_]*", value) is not None, "unsafe SQL identifier")
    return '"' + value + '"'


def make_rollback_sql(snapshot: dict, definitions: dict, migration_700: str, migration_800: str) -> str:
    """Emit a transaction that restores the captured rows and pre-700 schema."""
    report = make_inventory(snapshot, migration_700, migration_800,
                            "\n".join(x["definition"] for x in definitions["functions"]))
    changes = report["changes"]
    tables = snapshot["tables"]
    source_ids = {r["key"]: r["id"] for r in tables["lr_sources"]}
    oak_id = source_ids["oak_grove_disc_golf_club_direct"]
    crpd_id = source_ids["crpd_rabbit_flats_direct"]
    links = [r for r in tables["lr_event_sources"] if
             (r["source_id"] == oak_id and (r.get("source_payload") or {}).get("schedule_derived") is True
              and (r.get("source_payload") or {}).get("published_time")) or
             (r["source_id"] == crpd_id and (r.get("source_payload") or {}).get("recurrence") == "first Saturday monthly"
              and (r.get("source_payload") or {}).get("time_local"))]
    event_ids = {r["event_id"] for r in links}
    events = [r for r in tables["lr_events"] if r["id"] in event_ids]
    old_sources = [r for r in tables["lr_sources"] if r["key"] in changes["existing_sources_to_restore"]]
    require(len(links) == len(events) == 37, "rollback row preimages must include the exact 37 schedule links/events")
    require(len(old_sources) == 4, "rollback must include the four modified existing source rows")
    functions = definitions["functions"]
    func_map = {re.search(r"(lr_[a-z0-9_]+)\((.*)\)", f["signature"]).group(1): f for f in functions}
    overwritten = changes["overwritten_functions_with_exact_old_definitions"]
    require(set(overwritten) <= set(func_map), "function owner/ACL preimages are incomplete")

    sql = [
        "-- Generated from the exact pre-migration snapshot; fail closed on drift.",
        "-- PRIVATE DATA: retain in the approved restricted recovery location only.",
        "begin;",
        "lock table public.lr_sources, public.lr_events, public.lr_event_sources, public.lr_source_runs, public.lr_source_candidates, public.lr_event_change_log, public.lr_review_queue in access exclusive mode;",
        f"create temporary table _events_p0_pre_events(row_data jsonb) on commit drop; insert into _events_p0_pre_events select value from jsonb_array_elements({sql_b64(events)});",
        f"create temporary table _events_p0_pre_links(row_data jsonb) on commit drop; insert into _events_p0_pre_links select value from jsonb_array_elements({sql_b64(links)});",
        f"create temporary table _events_p0_pre_sources(row_data jsonb) on commit drop; insert into _events_p0_pre_sources select value from jsonb_array_elements({sql_b64(old_sources)});",
        "do $rollback$ declare v_run_time timestamptz; v_schema_time timestamptz; v_runs int; v_candidates int; v_rows int; begin",
        "select count(*), min(r.created_at), max(r.created_at) into v_runs,v_run_time,v_schema_time from public.lr_source_runs r where r.parser_version='schedule-field-reconciliation-v1';",
        "if v_runs<>2 or v_run_time is distinct from v_schema_time then raise exception 'rollback refused: expected exactly two reconciliation runs with one transaction timestamp'; end if;",
        "if (select count(*) from public.lr_source_runs r join public.lr_sources s on s.id=r.source_id where r.parser_version='schedule-field-reconciliation-v1' and ((s.key='oak_grove_disc_golf_club_direct' and r.records_seen=34 and r.records_valid=34) or (s.key='crpd_rabbit_flats_direct' and r.records_seen=3 and r.records_valid=3)))<>2 then raise exception 'rollback refused: source run identity/count mismatch'; end if;",
        "select count(*) into v_candidates from public.lr_source_candidates c join public.lr_source_runs r on r.id=c.source_run_id where r.parser_version='schedule-field-reconciliation-v1';",
        "if v_candidates<>37 then raise exception 'rollback refused: expected exactly 37 candidate rows, found %',v_candidates; end if;",
        "if exists(select 1 from public.lr_source_candidates c join public.lr_source_runs r on r.id=c.source_run_id where r.parser_version='schedule-field-reconciliation-v1' and (c.created_at<>r.created_at or c.updated_at<>r.created_at)) then raise exception 'rollback refused: candidate rows changed after reconciliation'; end if;",
        "if exists(select 1 from public.lr_event_change_log l join public.lr_source_candidates c on c.id=l.source_candidate_id join public.lr_source_runs r on r.id=c.source_run_id where r.parser_version='schedule-field-reconciliation-v1' and l.created_at<>r.created_at) then raise exception 'rollback refused: reconciliation change history is not untouched'; end if;",
        "if exists(select 1 from public.lr_review_queue q join public.lr_source_candidates c on c.id=q.source_candidate_id join public.lr_source_runs r on r.id=c.source_run_id where r.parser_version='schedule-field-reconciliation-v1' and (q.created_at<>r.created_at or q.status not in ('open','in_review') or q.resolved_at is not null)) then raise exception 'rollback refused: reconciliation review records were changed'; end if;",
        "if exists(select 1 from public.lr_events e join public.lr_source_candidates c on c.match_event_id=e.id join public.lr_source_runs r on r.id=c.source_run_id left join _events_p0_pre_events p on p.row_data->>'id'=e.id::text where r.parser_version='schedule-field-reconciliation-v1' and (p.row_data is null or (to_jsonb(e) - array['venue_address','course_id','course_url','start_time_local','checkin_time_local','end_time_local','start_time_note','format_details','entry_fee_amount','entry_fee_currency','entry_fee_unit','fee_breakdown','additional_fees_note','registration_opens_at','registration_closes_at','registration_capacity','registration_available','official_url','timezone','format','updated_at','last_changed_at','last_verified_at']::text[]) is distinct from (to_jsonb(jsonb_populate_record(null::public.lr_events,p.row_data)) - array['venue_address','course_id','course_url','start_time_local','checkin_time_local','end_time_local','start_time_note','format_details','entry_fee_amount','entry_fee_currency','entry_fee_unit','fee_breakdown','additional_fees_note','registration_opens_at','registration_closes_at','registration_capacity','registration_available','official_url','timezone','format','updated_at','last_changed_at','last_verified_at']::text[]) or e.updated_at > r.created_at or e.last_changed_at > r.created_at)) then raise exception 'rollback refused: an affected event changed after reconciliation'; end if;",
        "if exists(select 1 from public.lr_event_sources es join public.lr_source_runs r on r.parser_version='schedule-field-reconciliation-v1' join public.lr_sources s on s.id=r.source_id where es.source_id=s.id and es.updated_at<>r.created_at and es.source_payload->>'prior_published_time' is not null) then raise exception 'rollback refused: the reconciled OG source link changed after reconciliation'; end if;",
        # The reverse updates all 37 captured source links, not just the OG
        # Disc Swap links that migration 800 explicitly edits. A later sync
        # can change a CRPD or ordinary OG link without touching its event.
        # Compare typed complete preimages for untouched links, and the exact
        # migration-expected payload for the two Disc Swap corrections.
        "if exists(select 1 from _events_p0_pre_links p left join public.lr_event_sources es on es.id=(p.row_data->>'id')::uuid "
        "where es.id is null or (case "
        "when (p.row_data->'source_payload'->>'published_time')='1 PM Check-in, 2 PM start; Disc Swap 11:30 AM to 5:30 PM' "
        "then ((to_jsonb(es)-array['source_payload','updated_at']::text[]) is distinct from "
        "(to_jsonb(jsonb_populate_record(null::public.lr_event_sources,p.row_data))-array['source_payload','updated_at']::text[]) "
        "or es.updated_at is distinct from (select min(created_at) from public.lr_source_runs where parser_version='schedule-field-reconciliation-v1') "
        "or es.source_payload is distinct from ((p.row_data->'source_payload')||jsonb_build_object("
        "'published_time','1 PM Check-in, 2 PM start; Disc Swap 8 AM-2 PM',"
        "'prior_published_time',p.row_data->'source_payload'->>'published_time',"
        "'source_rechecked_at','2026-11-01T05:58:03Z'::timestamptz,'source_section','EVENTS'))) "
        "else to_jsonb(es) is distinct from to_jsonb(jsonb_populate_record(null::public.lr_event_sources,p.row_data)) end)) "
        "then raise exception 'rollback refused: a scoped source link changed after reconciliation'; end if;",
        "if exists(select 1 from public.lr_event_field_evidence ev join public.lr_source_candidates c on c.id=ev.source_candidate_id join public.lr_source_runs r on r.id=c.source_run_id where r.parser_version='schedule-field-reconciliation-v1' and ev.updated_at<>r.created_at) then raise exception 'rollback refused: field evidence changed after reconciliation'; end if;",
        "if exists(select 1 from public.lr_event_sources es join public.lr_sources s on s.id=es.source_id where s.key='hbnf_udisc_manual') or exists(select 1 from public.lr_source_runs r join public.lr_sources s on s.id=r.source_id where s.key='hbnf_udisc_manual') or exists(select 1 from public.lr_source_candidates c join public.lr_sources s on s.id=c.source_id where s.key='hbnf_udisc_manual') then raise exception 'rollback refused: new HBNF source has acquired dependent records'; end if;",
        "if (select count(*) from public.lr_event_field_evidence) <> (select count(*) from public.lr_event_field_evidence ev where ev.source_candidate_id in (select c.id from public.lr_source_candidates c join public.lr_source_runs r on r.id=c.source_run_id where r.parser_version='schedule-field-reconciliation-v1')) + 1 then raise exception 'rollback refused: evidence table contains rows outside this release'; end if;",
        "if not exists(select 1 from public.lr_event_field_evidence ev join public.lr_events e on e.id=ev.event_id where ev.source_candidate_id is null and ev.status='conflicting' and e.slug='billy-goat-fallen-disc-golfers-memorial-2026') then raise exception 'rollback refused: expected baseline conflict evidence row is missing'; end if;",
        "if exists(select 1 from public.lr_sources s where s.key in ('local_roots_submissions','hbnf_internal_schedule','oak_grove_disc_golf_club_direct','crpd_rabbit_flats_direct') and s.updated_at is distinct from (select min(created_at) from public.lr_event_field_evidence where source_candidate_id is null)) then raise exception 'rollback refused: modified source metadata changed after migration'; end if;",
        "end $rollback$;",
    ]

    # Restore only rows in the recorded source/event scope. The generated SQL
    # uses typed jsonb_populate_recordset to preserve exact preimage values.
    sql += [
        "alter table public.lr_event_sources disable trigger lr_event_sources_touch_updated_at;",
        "alter table public.lr_events disable trigger lr_events_touch_updated_at;",
        "alter table public.lr_sources disable trigger lr_sources_touch_updated_at;",
    ]
    for table, rows in (("lr_event_sources", links), ("lr_events", events), ("lr_sources", old_sources)):
        columns = sorted({k for row in rows for k in row})
        assignments = ",".join(f"{qident(c)}=pre.{qident(c)}" for c in columns if c != "id")
        payload = sql_b64(rows)
        sql += [
            f"update public.{table} dst set {assignments} from jsonb_populate_recordset(null::public.{table}, {payload}) pre where dst.id=pre.id;",
        ]
    sql += [
        "alter table public.lr_event_sources enable trigger lr_event_sources_touch_updated_at;",
        "alter table public.lr_events enable trigger lr_events_touch_updated_at;",
        "alter table public.lr_sources enable trigger lr_sources_touch_updated_at;",
    ]

    sql += [
        "delete from public.lr_event_change_log where source_candidate_id in (select c.id from public.lr_source_candidates c join public.lr_source_runs r on r.id=c.source_run_id where r.parser_version='schedule-field-reconciliation-v1');",
        "delete from public.lr_review_queue where source_candidate_id in (select c.id from public.lr_source_candidates c join public.lr_source_runs r on r.id=c.source_run_id where r.parser_version='schedule-field-reconciliation-v1');",
        "delete from public.lr_event_field_evidence where source_candidate_id in (select c.id from public.lr_source_candidates c join public.lr_source_runs r on r.id=c.source_run_id where r.parser_version='schedule-field-reconciliation-v1');",
        "drop view public.lr_event_field_status;",
        "delete from public.lr_source_candidates where source_run_id in (select id from public.lr_source_runs where parser_version='schedule-field-reconciliation-v1');",
        "delete from public.lr_source_runs where parser_version='schedule-field-reconciliation-v1';",
        "delete from public.lr_sources where key='hbnf_udisc_manual';",
    ]

    # Restore exact pre-700 function bodies and ACLs. Public RPC signatures
    # changed return columns, so those two require drop/recreate.
    sql += ["drop function public.lr_public_event_detail(text);", "drop function public.lr_public_events();"]
    function_restore_order = [n for n in overwritten if n not in {"lr_public_events", "lr_public_event_detail"}]
    function_restore_order += [n for n in ("lr_public_events", "lr_public_event_detail") if n in overwritten]
    for name in function_restore_order:
        f = func_map[name]
        definition = f["definition"].strip().rstrip(";") + ";"
        if name not in {"lr_public_event_detail", "lr_public_events"}:
            definition = re.sub(r"(?i)^create\s+function\b", "CREATE OR REPLACE FUNCTION", definition, count=1)
        sql.append(definition)
        signature = f["signature"]
        owner = f["owner"].replace('"', '""')
        sql.append(f"alter function public.{signature} owner to \"{owner}\";")
        sql.append(f"revoke all on function public.{signature} from public, anon, authenticated, service_role;")
        for acl in f.get("acl", "{}").strip("{}").split(","):
            if not acl or "=" not in acl:
                continue
            role, rights = acl.split("=",1)
            rights = rights.split("/",1)[0]
            if role in {owner, "postgres"} or "X" not in rights:
                continue
            role_sql = "PUBLIC" if role.lower() == "public" else '"' + role.replace('"','""') + '"'
            sql.append(f"grant execute on function public.{signature} to {role_sql};")

    new_functions = {
        "lr_enqueue_event_field_reviews(integer)", "lr_set_manual_event_field_status(uuid,text,text,text,jsonb,text)",
        "lr_set_event_field_value(uuid,text,jsonb)", "lr_safe_time(text)", "lr_safe_numeric(text)",
        "lr_safe_integer(text)", "lr_safe_timestamptz(text)",
    }
    for signature in ["lr_enqueue_event_field_reviews(integer)", "lr_set_manual_event_field_status(uuid,text,text,text,jsonb,text)",
                      "lr_safe_timestamptz(text)", "lr_safe_integer(text)", "lr_safe_numeric(text)", "lr_safe_time(text)",
                      "lr_set_event_field_value(uuid,text,jsonb)"]:
        sql.append(f"drop function public.{signature};")
    sql.append("drop table public.lr_event_field_evidence;")
    for index in changes["new_indexes"]:
        sql.append(f"drop index if exists public.{index};")
    for table, names in (("lr_sources", ["lr_sources_verification_ttl_check"]),
                         ("lr_events", ["lr_events_course_url_http_check","lr_events_official_url_http_check","lr_events_format_details_object_check","lr_events_fee_breakdown_array_check","lr_events_fee_amount_nonnegative_check","lr_events_fee_currency_check","lr_events_fee_unit_currency_pair_check","lr_events_end_time_requires_start_check","lr_events_start_note_exclusive_check","lr_events_start_note_length_check","lr_events_checkin_before_start_check","lr_events_same_day_time_order_check","lr_events_registration_capacity_check","lr_events_registration_window_check"])):
        for name in names:
            sql.append(f"alter table public.{table} drop constraint {name};")
    for table, columns in changes["new_columns_by_table"].items():
        for column in reversed(columns):
            sql.append(f"alter table public.{table} drop column {column};")
    sql += [
        f"do $$ begin if (select count(*) from public.lr_event_sources dst join jsonb_populate_recordset(null::public.lr_event_sources, {sql_b64(links)}) pre using(id) where row(dst.*) is not distinct from row(pre.*))<>{len(links)} then raise exception 'rollback exact source-link preimage verification failed'; end if; if (select count(*) from public.lr_events dst join jsonb_populate_recordset(null::public.lr_events, {sql_b64(events)}) pre using(id) where row(dst.*) is not distinct from row(pre.*))<>{len(events)} then raise exception 'rollback exact event preimage verification failed'; end if; if (select count(*) from public.lr_sources dst join jsonb_populate_recordset(null::public.lr_sources, {sql_b64(old_sources)}) pre using(id) where row(dst.*) is not distinct from row(pre.*))<>{len(old_sources)} then raise exception 'rollback exact source metadata preimage verification failed'; end if; end $$;",
        "commit;", "",
    ]
    return "\n".join(sql)


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
    parser.add_argument("--sql-out", type=Path, help="write the scoped executable reverse SQL")
    parser.add_argument("--function-preimages", type=Path, help="JSON object captured from pg_get_functiondef and pg_proc ACLs")
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
    if args.sql_out:
        require(args.function_preimages is not None and args.function_preimages.is_file(), "--function-preimages JSON is required with --sql-out")
        preimages = json.loads(args.function_preimages.read_text())
        reverse_sql = make_rollback_sql(d, preimages, (args.migrations / MIGRATION_700).read_text(),
                                        (args.migrations / MIGRATION_800).read_text())
        args.sql_out.parent.mkdir(parents=True, exist_ok=True)
        args.sql_out.write_text(reverse_sql)
        report["rollback_sql"] = {"path": str(args.sql_out), "bytes": len(reverse_sql.encode()),
                                  "sha256": hashlib.sha256(reverse_sql.encode()).hexdigest(),
                                  "disposition": "GENERATED_FAIL_CLOSED__MUST_PASS_PGLITE_AND_FRESH_TARGET_ADMISSION"}
        report["unsatisfied_release_requirements"] = [
            "Fresh immediately-pre-mutation database/source snapshot bound to exact target and migration head",
            "Private durable byte-equal readback of candidate, exact data preimage, reverse SQL, and one-time admission manifest",
            "Same-manifest target-specific Events DB release:admit PASS after current baseline and rollback bytes are verified",
            "Production target mutation is expressly out of scope for this preparation task",
        ]
    args.out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(f"{report['status']}: {len(report['changes']['reconciliation_event_ids'])} source-backed rows; output {args.out}")


if __name__ == "__main__":
    main()
