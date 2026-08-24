-- Register a first-party routing path for Riverside / Martha McLean coverage.
-- This is intentionally disabled and carries no authoritative event fields until
-- a direct organizer feed/submission or explicit permission is established.

insert into public.lr_sources (
  key,
  name,
  source_type,
  base_url,
  access_method,
  permission_basis,
  enabled,
  authoritative_fields,
  refresh_schedule,
  notes
)
values (
  'riverside_parks_martha_direct',
  'City of Riverside Parks / Martha McLean direct route',
  'club',
  'https://www.riversideca.gov/park_rec/',
  'Pending direct organizer submission/feed or explicit permission; no automated event retrieval enabled',
  'City of Riverside Parks, Recreation and Community Services formally operates Martha McLean Memorial Park and its published fee schedule includes a Martha McLean Disc Golf Tournament category. This establishes a first-party routing/venue authority path only; it does not establish current tournament dates or grant automation permission.',
  false,
  '{}'::text[],
  null,
  'Riverside future coverage remains weak. Route through City Parks to the current Martha McLean tournament organizer/club. Do not substitute PDGA, Disc Golf Scene, or UDisc scraping.'
)
on conflict (key) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  base_url = excluded.base_url,
  access_method = excluded.access_method,
  permission_basis = excluded.permission_basis,
  enabled = excluded.enabled,
  authoritative_fields = excluded.authoritative_fields,
  refresh_schedule = excluded.refresh_schedule,
  notes = excluded.notes,
  updated_at = now();
