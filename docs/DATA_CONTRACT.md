# Local Roots Events — Data Contract

This is the logical contract. Exact SQL names may be adjusted during implementation, but semantics must not change without updating this file and tests.

## `events`

Canonical published event entity.

Fields:
- `id uuid primary key`
- `slug text unique not null`
- `name text not null`
- `start_date date not null`
- `end_date date not null`
- `timezone text default 'America/Los_Angeles'`
- `county text`
- `city text`
- `venue_name text`
- `course_name text`
- `rounds_text text`
- `event_type text not null`
- `format text`
- `sanctioned boolean`
- `tier text`
- `status text not null`
- `registration_status text`
- `registration_url text`
- `results_url text`
- `club_host text`
- `td_names text[]`
- `published boolean default false`
- `confidence numeric`
- `last_verified_at timestamptz`
- `last_changed_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

Constraints:
- `end_date >= start_date`
- published event name cannot be blank/placeholder
- published event must satisfy active geography policy
- published event must have at least one provenance record
- sanctioned=true must have a non-empty sanctioned source/provenance basis
- URL fields must be valid HTTP(S) URLs when non-null

## `event_sources`

Provenance for each canonical event.

Fields:
- `id uuid primary key`
- `event_id uuid references events`
- `source_id uuid references sources`
- `external_id text`
- `source_url text not null`
- `source_role text` (discovery, official, registration, results, organizer-confirmed)
- `source_payload jsonb`
- `payload_hash text`
- `first_seen_at timestamptz`
- `last_seen_at timestamptz`
- `last_fetched_at timestamptz`
- `confidence numeric`

Unique candidates:
- `(source_id, external_id)` when external_id exists
- otherwise source-specific canonical URL

## `source_candidates`

Normalized records before canonical promotion.

Fields:
- `id uuid`
- `source_run_id uuid`
- `source_id uuid`
- `external_id text`
- `normalized_payload jsonb`
- `validation_status text`
- `validation_errors jsonb`
- `match_event_id uuid`
- `match_confidence numeric`
- `promotion_status text`
- timestamps

No candidate may alter a published event until it passes validation and promotion logic.

## `sources`

Source registry.

Fields:
- `id uuid`
- `key text unique`
- `name text`
- `source_type text`
- `base_url text`
- `access_method text`
- `permission_basis text`
- `enabled boolean`
- `authoritative_fields text[]`
- `refresh_schedule text`
- `expected_min_records integer`
- `expected_max_records integer`
- `notes text`

## `source_runs`

Every acquisition attempt.

Fields:
- `id uuid`
- `source_id uuid`
- `started_at timestamptz`
- `finished_at timestamptz`
- `fetch_status text`
- `parse_status text`
- `validation_status text`
- `health_status text`
- `records_seen integer`
- `records_valid integer`
- `records_new integer`
- `records_changed integer`
- `records_rejected integer`
- `records_missing integer`
- `error_code text`
- `error_message text`
- `metrics jsonb`

A run is not `healthy` merely because HTTP acquisition succeeded.

## `results`

One row per player/place for the selected/public result set, with optional storage of additional divisions later.

Fields:
- `id uuid`
- `event_id uuid`
- `division_code text`
- `place integer`
- `player_name text`
- `pdga_number integer`
- `total_score integer`
- `to_par integer`
- `points numeric`
- `rating numeric`
- `source_url text`
- `source_id uuid`
- `is_public_selected_division boolean`
- `last_verified_at timestamptz`

## `manual_overrides`

Fields:
- `id uuid`
- `event_id uuid`
- `field_name text`
- `original_value jsonb`
- `override_value jsonb`
- `reason text`
- `active boolean`
- `created_at timestamptz`
- `released_at timestamptz`
- `created_by uuid/null`

Precedence:
`active manual override > approved source promotion > existing canonical value`

## `review_queue`

Fields:
- `id uuid`
- `issue_type text`
- `severity text`
- `event_id uuid null`
- `source_candidate_id uuid null`
- `summary text`
- `details jsonb`
- `status text`
- `created_at timestamptz`
- `resolved_at timestamptz`
- `resolution text`

## `scope_profiles`

Fields:
- `id uuid`
- `key text unique`
- `name text`
- `allowed_counties text[]`
- `allowed_cities text[]`
- `allowed_course_ids text[]`
- `excluded_course_ids text[]`
- `active boolean`

## Identity / deduplication

Never dedupe on event name alone.

Strong identifiers:
1. approved source external ID;
2. PDGA tournament ID when authorized;
3. exact canonical registration URL;
4. organizer-provided stable ID.

Probabilistic match inputs:
- normalized event name similarity;
- overlapping date range;
- same/near venue;
- same city/county;
- same organizer;
- same sanction/tier.

High-confidence match can auto-merge.
Ambiguous match must enter `review_queue`.

## Public API/view

Frontend should read a restricted public view/API, not raw administrative tables.

Public fields only:
- event presentation data
- selected results
- public provenance/links where appropriate

Do not expose:
- raw source payloads
- admin notes
- internal confidence diagnostics
- review details
- credentials
- private contact information
