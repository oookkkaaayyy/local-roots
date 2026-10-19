-- Owner-confirmed HBNF calendar schedule, separate from league_state observation.
-- This preserves the placeholder guard for every schedule-derived record that
-- lacks this exact owner-confirmation reference and one of the approved rules.

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
      and coalesce((es.source_payload->>'observed_in_league_state')::boolean, false) = false
      and (
        es.source_payload->>'origin' = 'club_schedule_rule'
        or (
          es.source_payload->>'origin' = 'organizer_confirmed_schedule'
          and not coalesce(
            es.source_payload->>'confirmation_reference' = 'owner-confirmed-hbnf-schedule-2026-10-19'
            and es.source_payload->>'schedule_rule' in (
              'final-monthly-glow-2026-10-24',
              'weekly-tuesday-glow-after-2026-10-27'
            ),
            false
          )
        )
      )
  ) then
    new.published := false;
  end if;
  return new;
end;
$$;

-- Record the owner's explicit schedule confirmation against the already-existing,
-- stable Oct 24 event/source identity. This does not claim league_state observation,
-- participants, scores, or a new time.
do $$
declare
  source_uuid uuid;
  changed integer;
begin
  select id into source_uuid
  from public.lr_sources
  where key = 'hbnf_internal_schedule' and enabled;

  if source_uuid is null then
    raise exception 'Enabled HBNF schedule source is missing';
  end if;

  update public.lr_event_sources
  set source_payload = (source_payload
      - 'scheduled_start_local'
      - 'schedule_scope')
      || jsonb_build_object(
        'origin', 'organizer_confirmed_schedule',
        'observed_in_league_state', false,
        'confirmation_reference', 'owner-confirmed-hbnf-schedule-2026-10-19',
        'schedule_rule', 'final-monthly-glow-2026-10-24',
        'recurrence_rule', 'Final monthly Glow on 2026-10-24; weekly Tuesday Glow begins after 2026-10-27 starting 2026-11-03',
        'schedule_horizon_occurrences', 8
      ),
      last_fetched_at = now(),
      last_seen_at = now()
  where source_id = source_uuid
    and external_id = 'hbnf:glow:2026-10-24'
    and event_id = '2c0409d2-ef40-4d0b-9ffe-23807e667fcf';

  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'Expected exactly one existing Oct 24 Glow source row; found %', changed;
  end if;

  update public.lr_events
  set published = true,
      last_verified_at = now(),
      confidence = greatest(coalesce(confidence, 0), 0.97),
      updated_at = now()
  where id = '2c0409d2-ef40-4d0b-9ffe-23807e667fcf'
    and slug = 'hbnf-glow-2026-10-24'
    and start_date = date '2026-10-24'
    and status = 'upcoming';

  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'Expected exactly one upcoming Oct 24 Glow event; found %', changed;
  end if;
end
$$;

update public.lr_sources
set access_method = 'Automated read of user-controlled HBNF league_state plus the exact owner-confirmed Oct 24, 2026 Glow event and the confirmed Tuesday Glow recurrence beginning Nov 3, 2026, emitted as organizer schedule provenance independently of participant or score rows.',
    permission_basis = 'First-party HBNF system is authorized for Local Roots event calendar integration. The owner directly confirmed Oct 24 as the final monthly Glow and Tuesday Glow replacing the prior format after Oct 27; only dates computed from that recurrence are emitted, with no assumed time or gameplay details. HBNF league_state supersedes the schedule row when it contains substantive participants or finalized cards.',
    notes = concat_ws(E'\\n', notes, '2026-10-19: Owner-confirmed schedule is now represented as explicit organizer schedule evidence (not league_state observation). Stable hbnf:glow:YYYY-MM-DD identities prevent duplicate events; unconfirmed schedule placeholders remain unpublished.')
where key = 'hbnf_internal_schedule';

-- Safe rollback SQL (run only if this candidate is rolled back):
-- First restore the exact prior publication guard body from the established
-- 20260913010200_guard_hbnf_schedule_placeholders migration:
--   if new.published is true and exists (
--     select 1 from public.lr_event_sources es
--     join public.lr_sources s on s.id = es.source_id
--     where es.event_id = new.id
--       and s.key = 'hbnf_internal_schedule'
--       and es.source_payload->>'origin' = 'club_schedule_rule'
--       and coalesce((es.source_payload->>'observed_in_league_state')::boolean, false) = false
--   ) then new.published := false; end if;
--
-- For the Oct 24 event, only revert if its exact confirmation marker is still
-- present. If a later league_state sync replaced the provenance, leave it alone.
-- update public.lr_events set published=false, updated_at=now()
-- where id='2c0409d2-ef40-4d0b-9ffe-23807e667fcf'
--   and exists (select 1 from public.lr_event_sources es
--     where es.event_id=public.lr_events.id
--       and es.external_id='hbnf:glow:2026-10-24'
--       and es.source_payload->>'confirmation_reference'='owner-confirmed-hbnf-schedule-2026-10-19');
-- update public.lr_event_sources
-- set source_payload = '{"date":"2026-10-24","mode":"glow","origin":"club_schedule_rule","card_count":0,"schedule_scope":"2026 summer/fall Glow Doubles","finalized_cards":0,"recurrence_rule":"second-to-last Saturday monthly through October 2026","participant_entries":0,"scheduled_start_local":"18:30","observed_in_league_state":false}'::jsonb
-- where external_id='hbnf:glow:2026-10-24'
--   and event_id='2c0409d2-ef40-4d0b-9ffe-23807e667fcf'
--   and source_payload->>'confirmation_reference'='owner-confirmed-hbnf-schedule-2026-10-19';
--
-- For future Tuesdays, unpublish but do not delete only exact still-scheduled,
-- unobserved, empty records. Preserve stable identities and any later evidence.
-- update public.lr_events e set published=false,updated_at=now()
-- from public.lr_event_sources es join public.lr_sources s on s.id=es.source_id
-- where es.event_id=e.id and s.key='hbnf_internal_schedule'
--   and es.external_id like 'hbnf:glow:2026-%'
--   and es.source_payload->>'confirmation_reference'='owner-confirmed-hbnf-schedule-2026-10-19'
--   and es.source_payload->>'schedule_rule'='weekly-tuesday-glow-after-2026-10-27'
--   and coalesce((es.source_payload->>'observed_in_league_state')::boolean,false)=false
--   and coalesce((es.source_payload->>'participant_entries')::integer,0)=0
--   and coalesce((es.source_payload->>'finalized_cards')::integer,0)=0;
--
-- Restore the source registry access_method/permission_basis from the state before
-- this migration and remove only the appended 2026-10-19 note. Never reset or delete
-- any score, participant, result, or tag data.
