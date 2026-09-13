create or replace function public.lr_guard_hbnf_schedule_placeholder_publication()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.published is true and exists (
    select 1
    from public.lr_event_sources es
    join public.lr_sources s on s.id = es.source_id
    where es.event_id = new.id
      and s.key = 'hbnf_internal_schedule'
      and es.source_payload->>'origin' = 'club_schedule_rule'
      and coalesce((es.source_payload->>'observed_in_league_state')::boolean, false) = false
  ) then
    new.published := false;
  end if;
  return new;
end;
$$;

revoke all on function public.lr_guard_hbnf_schedule_placeholder_publication() from public, anon, authenticated;

drop trigger if exists lr_guard_hbnf_schedule_placeholder_publication on public.lr_events;
create trigger lr_guard_hbnf_schedule_placeholder_publication
before insert or update of published on public.lr_events
for each row execute function public.lr_guard_hbnf_schedule_placeholder_publication();

update public.lr_events e
set published = false,
    updated_at = now()
where e.published is true
  and exists (
    select 1
    from public.lr_event_sources es
    join public.lr_sources s on s.id = es.source_id
    where es.event_id = e.id
      and s.key = 'hbnf_internal_schedule'
      and es.source_payload->>'origin' = 'club_schedule_rule'
      and coalesce((es.source_payload->>'observed_in_league_state')::boolean, false) = false
  );
