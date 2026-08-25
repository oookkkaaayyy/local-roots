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
  'ladgc_cdgs_series_direct',
  'Los Angeles Disc Golf Club — California Disc Golf Series direct page',
  'club',
  'https://losangelesdg.com/Losangelesdiscgol/shop/page/californiadiscgolfseries',
  'Manual first-party route; current page is publicly reachable but its event text is not reliably extractable by the verification client, so no event facts are promoted from it yet',
  'First-party Los Angeles Disc Golf Club California Disc Golf Series page linked from the organizer’s current event materials. Registration records the direct route only; it does not authorize automated crawling or establish any event field until the page content can be independently read and verified.',
  false,
  '{}'::text[],
  null,
  'High-value direct route for LA OPEN, KEN MALLOY, MT PRIDE and THROW. Keep disabled/non-authoritative until readable first-party event details can be verified. The separate public LADGC 2026 CDGS points workbook remains authoritative for name identity only. Do not use PDGA, Disc Golf Scene, or UDisc facts to fill missing date/location/tier fields.'
)
on conflict (key) do update
set name = excluded.name,
    source_type = excluded.source_type,
    base_url = excluded.base_url,
    access_method = excluded.access_method,
    permission_basis = excluded.permission_basis,
    enabled = false,
    authoritative_fields = '{}'::text[],
    refresh_schedule = null,
    notes = excluded.notes,
    updated_at = now();
