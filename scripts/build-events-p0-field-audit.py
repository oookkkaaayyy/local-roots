#!/usr/bin/env python3
"""Build a conservative event/field audit from an immutable Supabase snapshot.

The audit never infers that an absent value is not announced or not applicable.
Only a direct, source-authorized payload fact can produce a verified or missing
classification. Schedule text is kept semantically separate from exact times.
"""
import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


FIELDS = [
    "name", "start_date", "end_date", "timezone", "county", "city", "venue_name",
    "venue_address", "course_name", "course_id", "course_url", "start_time_local",
    "checkin_time_local", "end_time_local", "start_time_note", "rounds_text", "event_type",
    "format", "format_details", "sanctioned", "tier", "status", "registration_status",
    "registration_url", "registration_opens_at", "registration_closes_at", "registration_capacity",
    "registration_available", "entry_fee_amount", "entry_fee_currency", "entry_fee_unit",
    "fee_breakdown", "additional_fees_note", "official_url", "results_url", "club_host", "td_names",
]
ADDITIONAL_AUTHORITY = {
    "oak_grove_disc_golf_club_direct": {"start_time_local", "checkin_time_local", "start_time_note", "event_type", "timezone"},
    "crpd_rabbit_flats_direct": {"start_time_local", "timezone"},
    "hbnf_internal_schedule": {"venue_address", "course_id", "course_url", "start_time_local", "checkin_time_local", "end_time_local", "start_time_note", "format_details", "entry_fee_amount", "entry_fee_currency", "entry_fee_unit", "fee_breakdown", "additional_fees_note", "registration_opens_at", "registration_closes_at", "registration_capacity", "registration_available", "official_url"},
    "hbnf_udisc_manual": {"name", "start_date", "end_date", "timezone", "county", "city", "course_name", "course_id", "course_url", "event_type", "format", "format_details", "start_time_local", "end_time_local", "entry_fee_amount", "entry_fee_currency", "entry_fee_unit", "fee_breakdown", "additional_fees_note", "official_url"},
    "local_roots_submissions": set(FIELDS),
}
PAYLOAD_KEYS = {
    "name": ("name", "published_name", "event_name"), "start_date": ("start_date", "published_date", "materialized_date", "event_date", "date"),
    "end_date": ("end_date",), "timezone": ("timezone",), "county": ("county",), "city": ("city",),
    "venue_name": ("venue_name",), "venue_address": ("venue_address",), "course_name": ("course_name",),
    "course_id": ("course_id",), "course_url": ("course_url",), "start_time_local": ("start_time_local",),
    "checkin_time_local": ("checkin_time_local",), "end_time_local": ("end_time_local",),
    "start_time_note": ("start_time_note", "published_time"), "rounds_text": ("rounds_text",),
    "event_type": ("event_type",), "format": ("format",), "format_details": ("format_details",),
    "sanctioned": ("sanctioned",), "tier": ("tier",), "status": ("status",),
    "registration_status": ("registration_status",), "registration_url": ("registration_url",),
    "registration_opens_at": ("registration_opens_at",), "registration_closes_at": ("registration_closes_at",),
    "registration_capacity": ("registration_capacity",), "registration_available": ("registration_available",),
    "entry_fee_amount": ("entry_fee_amount",), "entry_fee_currency": ("entry_fee_currency",),
    "entry_fee_unit": ("entry_fee_unit",), "fee_breakdown": ("fee_breakdown",),
    "additional_fees_note": ("additional_fees_note",), "official_url": ("official_url",),
    "results_url": ("results_url",), "club_host": ("club_host",), "td_names": ("td_names",),
}


def normalized(value):
    if isinstance(value, str):
        return value.strip().lower()
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def parse_datetime(value):
    # Some PostgREST snapshot timestamps carry five fractional digits, which
    # this platform's Python build rejects despite otherwise valid ISO syntax.
    normalized_value = re.sub(r"\.\d+(?=(?:[+-]\d\d:\d\d|Z)$)", "", value)
    if normalized_value.endswith("Z"):
        normalized_value = normalized_value[:-1] + "+00:00"
    return datetime.fromisoformat(normalized_value)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: build-events-p0-field-audit.py <snapshot.json> <output.csv>")
    snapshot_path, output_path = map(Path, sys.argv[1:])
    data = json.loads(snapshot_path.read_text())
    tables = data["tables"]
    sources = {s["id"]: s for s in tables["lr_sources"]}
    by_event = {}
    for association in tables["lr_event_sources"]:
        by_event.setdefault(association["event_id"], []).append(association)
    observed_at = parse_datetime(data["snapshot_at"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    columns = ["snapshot_at", "event_id", "slug", "name", "start_date", "published", "field", "canonical_value", "classification", "basis", "authorized_sources", "evidence_urls"]
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for event in sorted(tables["lr_events"], key=lambda row: (row["start_date"], row["slug"])):
            associations = by_event.get(event["id"], [])
            for field in FIELDS:
                canonical = event.get(field)
                if isinstance(canonical, str) and not canonical.strip():
                    canonical = None
                authorized = []
                facts = []
                evidence_urls = []
                for association in associations:
                    source = sources.get(association["source_id"], {})
                    key = source.get("key", "unknown")
                    fields = set(source.get("authoritative_fields") or []) | ADDITIONAL_AUTHORITY.get(key, set())
                    if field in fields and source.get("enabled"):
                        authorized.append(key)
                    payload = association.get("source_payload") or {}
                    for payload_key in PAYLOAD_KEYS[field]:
                        value = payload.get(payload_key)
                        if value is not None:
                            facts.append((key, payload_key, value, association.get("source_url")))
                            break
                    if association.get("source_url") and (field in fields or facts):
                        evidence_urls.append(association["source_url"])

                authorized_facts = [fact for fact in facts if fact[0] in authorized]
                distinct_facts = {normalized(fact[2]) for fact in authorized_facts}
                classification = "unverified"
                basis = "No field-level source fact in the captured record; blank/value is not treated as announced, N/A, or verified."

                # The existing permitted schedule payload conflated textual times
                # with `format`; report that specific semantic defect explicitly.
                if field == "format" and canonical and any(
                    source.get("key") == "oak_grove_disc_golf_club_direct"
                    and association.get("source_payload", {}).get("published_time") == canonical
                    for association in associations for source in [sources.get(association["source_id"], {})]
                ):
                    classification = "conflicting"
                    basis = "Canonical format equals the source schedule's published_time text; it is a time note, not a play format."
                elif field == "format" and event.get("slug", "").startswith("rabbit-flats-disc-golf-drop-in-") and canonical and "10:00" in canonical:
                    classification = "conflicting"
                    basis = "Canonical format combines the CRPD program name with its separately published 10:00 AM start."
                elif field == "start_date" and event.get("slug") == "billy-goat-fallen-disc-golfers-memorial-2026":
                    classification = "conflicting"
                    basis = "The permitted SoCal calendar has contradictory November date/weekday information; canonical date retained pending organizer clarification."
                    evidence_urls.append("https://socaldiscgolfclub.com/upcoming-events/")
                elif authorized_facts and len(distinct_facts) > 1:
                    classification = "conflicting"
                    basis = "Attached enabled authoritative source payloads disagree on this field."
                elif authorized_facts:
                    fact = authorized_facts[0]
                    comparable = normalized(canonical) == normalized(fact[2])
                    # `published_time` is an approximate note; it is not an exact
                    # clock time. Its semantic handling is addressed above.
                    if comparable:
                        fetched = [a.get("last_fetched_at") for a in associations if a.get("source_url") == fact[3] and a.get("last_fetched_at")]
                        latest = max((parse_datetime(v) for v in fetched), default=None)
                        ttl_days = 14
                        source = next((sources.get(a["source_id"], {}) for a in associations if a.get("source_url") == fact[3]), {})
                        if source.get("key") == "crpd_rabbit_flats_direct": ttl_days = 30
                        if source.get("key") in {"hbnf_internal_schedule", "hbnf_udisc_manual"}: ttl_days = 7
                        if latest and (observed_at - latest).total_seconds() > ttl_days * 86400:
                            classification = "stale"
                            basis = f"Captured authorized field fact matches canonical, but its source fetch is older than the {ttl_days}-day verification window."
                        else:
                            classification = "verified"
                            basis = f"Canonical matches the captured field fact from enabled authoritative source {fact[0]} (source payload key: {fact[1]})."
                    elif canonical is None:
                        classification = "missing_despite_available_evidence"
                        basis = f"Enabled authoritative source {fact[0]} has a direct non-null field fact ({fact[1]}) absent from canonical."
                    else:
                        classification = "conflicting"
                        basis = f"Canonical differs from enabled authoritative source {fact[0]} field fact ({fact[1]})."

                writer.writerow({
                    "snapshot_at": data["snapshot_at"], "event_id": event["id"], "slug": event["slug"],
                    "name": event["name"], "start_date": event["start_date"], "published": str(event["published"]).lower(),
                    "field": field, "canonical_value": json.dumps(canonical, ensure_ascii=False, separators=(",", ":")) if canonical is not None else "",
                    "classification": classification, "basis": basis,
                    "authorized_sources": ";".join(sorted(set(authorized))), "evidence_urls": ";".join(sorted(set(evidence_urls))),
                })
    print(json.dumps({"events": len(tables["lr_events"]), "fields_per_event": len(FIELDS), "rows": len(tables["lr_events"])*len(FIELDS), "output": str(output_path)}))


if __name__ == "__main__":
    main()
