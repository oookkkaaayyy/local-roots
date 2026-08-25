insert into public.lr_sources (
  key,name,source_type,base_url,access_method,permission_basis,enabled,authoritative_fields,refresh_schedule,notes
)
values (
  'dgs_manual_discovery_only',
  'Disc Golf Scene — manual discovery leads only',
  'other',
  'https://www.discgolfscene.com/tournaments/CA',
  'Manual discovery from public search/index results only; no automated crawling, ingestion, or field promotion',
  'User explicitly permits Disc Golf Scene only as a discovery lead. It is never production authority: every event fact must be independently corroborated by a permitted first-party/organizer/venue/club/public source before canonical publication.',
  false,
  '{}'::text[],
  null,
  'Discovery bookkeeping only. This source cannot publish, update, verify, or satisfy provenance/freshness/sanction-basis gates. Do not treat a discovery item title, date, location, tier, registration state, or URL as canonical evidence.'
)
on conflict (key) do update
set name=excluded.name,
    source_type=excluded.source_type,
    base_url=excluded.base_url,
    access_method=excluded.access_method,
    permission_basis=excluded.permission_basis,
    enabled=false,
    authoritative_fields='{}'::text[],
    refresh_schedule=null,
    notes=excluded.notes,
    updated_at=now();

with src as (
  select id from public.lr_sources where key='dgs_manual_discovery_only'
), leads(external_id,title,source_url) as (
  values
    ('race-for-the-ace-2026','Race for the Ace Presented by Legacy Discs and JustFun','https://www.discgolfscene.com/tournament/Race_For_The_Ace_2026'),
    ('coyote-classic-2026','Coyote Classic 2026','https://www.discgolfscene.com/tournament/Coyote_Classic_2026'),
    ('nadgt-california-premier-2026','2026 NADGT x Zanfel California Premier Sponsored by Innova','https://www.discgolfscene.com/tournaments/2026_NADGT_x_Zanfel_California_Premier'),
    ('chingones-grp-open-2026','Chingones DGC GRP OPEN 2026, Presented by PA Disc Golf Events','https://www.discgolfscene.com/tournament/Chingones_DGC_GRP_OPEN_2026_Presented_by_PA_Disc_Golf_Events'),
    ('outside-the-circle-september-morley-2026','Outside the Circle September Tag Match at Morley Field','https://www.discgolfscene.com/tournament/Outside_the_Circle_September_Tag_Match_at_Morley_Field_2026'),
    ('dog-haus-birthday-bash-2026','2026 Dog Haus Birthday Bash','https://www.discgolfscene.com/tournaments/CA'),
    ('mvp-space-race-dog-haus-2026','MVP Space Race 2026 Presented by Dog Haus','https://www.discgolfscene.com/tournaments/CA'),
    ('mountain-pride-open-2026','Mountain Pride Open 2026 (CDGS event #12 - Presented by Innova)','https://www.discgolfscene.com/tournaments/CA')
)
insert into public.lr_source_discovery_items(source_id,external_id,title,source_url,published_at)
select src.id,leads.external_id,leads.title,leads.source_url,null
from src cross join leads
on conflict (source_id,external_id) do update
set title=excluded.title,
    source_url=excluded.source_url;
