"""No-network regression for Events P0 baseline coverage; never exercises production."""
from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location(
    "events_p0_recovery", ROOT / "scripts" / "build-events-p0-rollback.py"
)
module = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(module)

M700 = (ROOT / "supabase/migrations" / module.MIGRATION_700).read_text()
M800 = (ROOT / "supabase/migrations" / module.MIGRATION_800).read_text()


def fixture():
    sources = [
        dict(id=f"source-{i}", key=k)
        for i, k in enumerate(sorted(module.SOURCE_KEYS - {"hbnf_udisc_manual"}))
    ]
    lookup = {r["key"]: r["id"] for r in sources}
    links = []
    events = []
    for i in range(37):
        oak = i < 34
        events.append(dict(id=f"event-{i:02}", slug=f"event-{i:02}"))
        links.append({
            "event_id": events[-1]["id"],
            "source_id": lookup["oak_grove_disc_golf_club_direct" if oak else "crpd_rabbit_flats_direct"],
            "source_payload": ({"schedule_derived": True, "published_time": "Show up around 5 PM"}
                               if oak else {"recurrence": "first Saturday monthly", "time_local": "10:00"}),
        })
    overridden = [
        "lr_apply_authoritative_candidate", "lr_apply_event_patch", "lr_candidate_validation_errors",
        "lr_decide_event_submission", "lr_event_field_value", "lr_ingest_event_submission",
        "lr_is_overridable_event_field", "lr_public_event_detail", "lr_public_events",
        "lr_set_manual_override",
    ]
    definitions = "\n".join(f"CREATE OR REPLACE FUNCTION public.{name}() RETURNS void AS $$ $$;" for name in overridden)
    snapshot = {
        "snapshot_at": "2026-11-01T05:58:03Z",
        "schema": {
            "columns": [], "indexes": [], "constraints": [],
            "functions": [{"name": x} for x in overridden],
        },
        "tables": {
            "lr_sources": sources, "lr_events": events, "lr_event_sources": links,
            "lr_source_runs": [], "lr_source_candidates": [], "lr_event_change_log": [],
            "lr_review_queue": [],
        },
    }
    return snapshot, definitions


class RecoveryInventoryTests(unittest.TestCase):
    def test_exact_37_and_old_schema_covered(self):
        snapshot, definitions = fixture()
        out = module.make_inventory(snapshot, M700, M800, definitions)
        self.assertEqual(out["status"], "PREIMAGE_INVENTORY_PASS__ROLLBACK_NOT_ADMITTED")
        self.assertEqual(out["changes"]["reconciliation_source_candidate_count"], 37)
        self.assertEqual(len(out["changes"]["overwritten_functions_with_exact_old_definitions"]), 10)
        self.assertIn("lr_event_field_evidence", out["changes"]["new_event_evidence_table"])
        self.assertTrue(out["unsatisfied_release_requirements"])

    def test_fails_if_event_preimage_missing(self):
        snapshot, definitions = fixture()
        snapshot["tables"]["lr_events"].pop()
        with self.assertRaisesRegex(ValueError, "not one-to-one"):
            module.make_inventory(snapshot, M700, M800, definitions)

    def test_fails_if_source_authority_missing(self):
        snapshot, definitions = fixture()
        snapshot["tables"]["lr_sources"].pop()
        with self.assertRaisesRegex(ValueError, "old source preimage missing"):
            module.make_inventory(snapshot, M700, M800, definitions)

    def test_fails_if_existing_field_collides(self):
        snapshot, definitions = fixture()
        snapshot["schema"]["columns"].append({"table_name": "lr_events", "column_name": "start_time_local"})
        with self.assertRaisesRegex(ValueError, "already existed"):
            module.make_inventory(snapshot, M700, M800, definitions)

    def test_fails_if_old_function_definition_missing(self):
        snapshot, definitions = fixture()
        definitions = definitions.replace("CREATE OR REPLACE FUNCTION public.lr_public_events() RETURNS void AS $$ $$;", "")
        with self.assertRaisesRegex(ValueError, "exact prechange function definitions missing: lr_public_events"):
            module.make_inventory(snapshot, M700, M800, definitions)

    def test_fails_on_wrong_reconciliation_count(self):
        snapshot, definitions = fixture()
        snapshot["tables"]["lr_event_sources"].pop()
        snapshot["tables"]["lr_events"].pop()
        with self.assertRaisesRegex(ValueError, "split does not match"):
            module.make_inventory(snapshot, M700, M800, definitions)

    def test_fails_if_new_source_collides(self):
        snapshot, definitions = fixture()
        snapshot["tables"]["lr_sources"].append({"id": "already", "key": "hbnf_udisc_manual"})
        with self.assertRaisesRegex(ValueError, "already existed in baseline"):
            module.make_inventory(snapshot, M700, M800, definitions)

    def test_requires_evidence_update_guard_trigger(self):
        snapshot, definitions = fixture()
        altered = M700.replace("create trigger lr_event_field_evidence_touch_updated_at", "-- timestamp guard missing")
        with self.assertRaisesRegex(ValueError, "evidence rollback timestamp trigger missing"):
            module.make_inventory(snapshot, altered, M800, definitions)

    def test_fails_if_future_migration_scope_unknown(self):
        snapshot, definitions = fixture()
        altered = M700 + "\nalter table public.lr_unsupported add column if not exists mystery text;\n"
        with self.assertRaisesRegex(ValueError, "unexpected additive column scope"):
            module.make_inventory(snapshot, altered, M800, definitions)


if __name__ == "__main__":
    unittest.main()
