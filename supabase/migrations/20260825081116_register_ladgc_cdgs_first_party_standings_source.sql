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
  'ladgc_cdgs_standings_manual',
  'Los Angeles Disc Golf Club — 2026 CDGS points workbook',
  'manual',
  'https://docs.google.com/spreadsheets/d/1c1RNeEiyhnJaBk6qx_cD3mvu76iuJoxfWpCn0Jdrb0g/edit',
  'Manual verification of the publicly accessible organizer-maintained Google Sheet; no automated crawling or third-party fallback facts',
  'First-party Los Angeles Disc Golf Club / California Disc Golf Series public standings workbook linked from the series ecosystem. It can establish current CDGS event identity/series inclusion only where the workbook itself shows the event label.',
  true,
  array['name']::text[],
  null,
  'The 2026 CDGS LEADERBOARD header currently includes LA OPEN, KEN MALLOY, MT PRIDE, and THROW after completed series events. This source does not establish dates, venues, tiers, sanction status, registration state, or organizer/TD details. Do not combine its event-name evidence with PDGA, Disc Golf Scene, or UDisc discovery facts to publish unsupported fields; obtain independent permitted date/location evidence first.'
)
on conflict (key) do update
set name = excluded.name,
    source_type = excluded.source_type,
    base_url = excluded.base_url,
    access_method = excluded.access_method,
    permission_basis = excluded.permission_basis,
    enabled = excluded.enabled,
    authoritative_fields = excluded.authoritative_fields,
    refresh_schedule = excluded.refresh_schedule,
    notes = excluded.notes,
    updated_at = now();