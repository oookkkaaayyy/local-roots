create or replace function public.lr_quarantine_empty_hbnf_glow_source_rows()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.external_id like 'hbnf:glow:%'
     and coalesce((new.source_payload->>'observed_in_league_state')::boolean, false) = true
     and coalesce((new.source_payload->>'participant_entries')::integer, 0) = 0
     and coalesce((new.source_payload->>'finalized_cards')::integer, 0) = 0
     and exists (
       select 1 from public.lr_events e
       where e.id = new.event_id
         and e.end_date < (now() at time zone 'America/Los_Angeles')::date
     ) then
    update public.lr_events set published = false where id = new.event_id and published is true;
  end if;
  return new;
end
$$;

revoke all on function public.lr_quarantine_empty_hbnf_glow_source_rows() from public, anon, authenticated;
grant execute on function public.lr_quarantine_empty_hbnf_glow_source_rows() to service_role;

drop trigger if exists trg_lr_quarantine_empty_hbnf_glow_source_rows on public.lr_event_sources;
create trigger trg_lr_quarantine_empty_hbnf_glow_source_rows
after insert or update of source_payload on public.lr_event_sources
for each row execute function public.lr_quarantine_empty_hbnf_glow_source_rows();

update public.lr_events e
set published = false
from public.lr_event_sources es
where es.event_id = e.id
  and es.external_id like 'hbnf:glow:%'
  and coalesce((es.source_payload->>'observed_in_league_state')::boolean, false) = true
  and coalesce((es.source_payload->>'participant_entries')::integer, 0) = 0
  and coalesce((es.source_payload->>'finalized_cards')::integer, 0) = 0
  and e.end_date < (now() at time zone 'America/Los_Angeles')::date
  and e.published is true;
