create or replace function public.lr_prevent_empty_hbnf_glow_republish()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.published is true
     and new.end_date < (now() at time zone 'America/Los_Angeles')::date
     and exists (
       select 1
       from public.lr_event_sources es
       where es.event_id = new.id
         and es.external_id like 'hbnf:glow:%'
         and coalesce((es.source_payload->>'observed_in_league_state')::boolean, false) = true
         and coalesce((es.source_payload->>'participant_entries')::integer, 0) = 0
         and coalesce((es.source_payload->>'finalized_cards')::integer, 0) = 0
     ) then
    new.published := false;
  end if;
  return new;
end
$$;

drop trigger if exists trg_lr_prevent_empty_hbnf_glow_republish on public.lr_events;
create trigger trg_lr_prevent_empty_hbnf_glow_republish
before insert or update of published, end_date on public.lr_events
for each row execute function public.lr_prevent_empty_hbnf_glow_republish();
