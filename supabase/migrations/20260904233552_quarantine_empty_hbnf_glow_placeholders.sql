create or replace function public.lr_quarantine_empty_hbnf_glow_placeholders()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  changed integer;
begin
  update public.lr_events e
  set published=false,
      last_changed_at=now()
  from public.lr_event_sources es
  join public.lr_sources s on s.id=es.source_id
  where es.event_id=e.id
    and s.key='hbnf_internal_schedule'
    and es.external_id in ('hbnf:glow:2026-07-25','hbnf:glow:2026-08-23')
    and coalesce(es.source_payload->>'mode','')='glow'
    and coalesce(es.source_payload->>'origin','')='league_state'
    and coalesce((es.source_payload->>'participant_entries')::integer,0)=0
    and coalesce((es.source_payload->>'finalized_cards')::integer,0)=0
    and e.published;
  get diagnostics changed = row_count;
  return changed;
end;
$function$;

revoke all on function public.lr_quarantine_empty_hbnf_glow_placeholders() from public, anon, authenticated;

create or replace function public.lr_schedule_hbnf_skins_results()
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  local_now timestamp;
begin
  local_now := now() at time zone 'America/Los_Angeles';
  if extract(hour from local_now) <> 8 then return null; end if;
  perform public.lr_quarantine_empty_hbnf_glow_placeholders();
  return public.lr_trigger_hbnf_skins_results('cron');
end;
$function$;

select public.lr_quarantine_empty_hbnf_glow_placeholders();
