-- Aggregate/calendar pages can legitimately support more than one event.
-- source_url is provenance/location, not a source-scoped identity key.
-- Stable identity remains (source_id, external_id).

drop index if exists public.lr_event_sources_source_url_unique_idx;

create index if not exists lr_event_sources_source_url_idx
  on public.lr_event_sources(source_id, source_url);

-- Replace synthetic Local Roots-only fragments with the actual SoCal source page.
update public.lr_event_sources es
set source_url = 'https://socaldiscgolfclub.com/upcoming-events/',
    updated_at = current_timestamp
from public.lr_sources s
where es.source_id = s.id
  and s.key = 'socal_dgc_manual_calendar'
  and es.source_url like 'https://socaldiscgolfclub.com/upcoming-events/#lr-%';

update public.lr_sources
set notes = concat_ws(
      ' ',
      nullif(notes,''),
      'Provenance URL rule: aggregate/calendar source pages may legitimately support multiple events, so source_url is not an identity key. Use source-scoped external_id for stable identity; do not fabricate deep-link fragments solely to make provenance URLs unique.'
    ),
    updated_at = current_timestamp
where key = 'socal_dgc_manual_calendar';
