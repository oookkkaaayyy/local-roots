-- HBNF is a first-party aggregate source. Its provenance URL is the real public HBNF site;
-- stable record identity is (source_id, external_id), not a fabricated URL fragment.
with hbnf as (
  select id from public.lr_sources where key = 'hbnf_internal_schedule'
)
update public.lr_event_sources es
set source_url = 'https://hbnightflyers.com/',
    updated_at = current_timestamp
where es.source_id = (select id from hbnf)
  and es.source_url like 'https://hbnightflyers.com/#local-roots-%';

with hbnf as (
  select id from public.lr_sources where key = 'hbnf_internal_schedule'
)
update public.lr_results r
set source_url = 'https://hbnightflyers.com/'
where r.source_id = (select id from hbnf)
  and r.source_url like 'https://hbnightflyers.com/#local-roots-%';

update public.lr_sources
set notes = concat_ws(
      ' ',
      nullif(notes,''),
      'Provenance URL rule: HBNF is a first-party aggregate source. Use the real public HBNF site URL for provenance/location and the source-scoped external_id for stable event identity; do not fabricate Local Roots-only URL fragments.'
    ),
    updated_at = current_timestamp
where key = 'hbnf_internal_schedule';
