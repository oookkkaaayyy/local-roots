create or replace function public.lr_keep_known_empty_hbnf_glow_unpublished()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.published is true and exists (
    select 1
    from public.lr_event_sources es
    where es.event_id = new.id
      and es.external_id in ('hbnf:glow:2026-07-25','hbnf:glow:2026-08-23')
  ) then
    new.published := false;
  end if;
  return new;
end
$$;

revoke all on function public.lr_keep_known_empty_hbnf_glow_unpublished() from public;

create trigger lr_events_00_keep_known_empty_hbnf_glow_unpublished
before update of published on public.lr_events
for each row
execute function public.lr_keep_known_empty_hbnf_glow_unpublished();

update public.lr_events e
set published = false
where exists (
  select 1
  from public.lr_event_sources es
  where es.event_id = e.id
    and es.external_id in ('hbnf:glow:2026-07-25','hbnf:glow:2026-08-23')
);
