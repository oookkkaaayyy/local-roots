-- Atomic, target-week-only save used by the scheduled UDisc reader.
-- Install through the HBNF Supabase migration process after exact-target admission.
create or replace function public.hbnf_apply_udisc_glow_week(
  p_week_date text,
  p_expected_week jsonb,
  p_replacement_week jsonb,
  p_expected_active_week jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state jsonb;
  v_glow jsonb;
  v_weeks jsonb;
  v_current_week jsonb;
  v_active_week jsonb;
  v_replacement_week jsonb;
begin
  if p_week_date is null or p_week_date !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
     or p_replacement_week->>'date' is distinct from p_week_date
     or jsonb_typeof(p_replacement_week->'players') is distinct from 'array'
     or jsonb_typeof(p_replacement_week->'cards') is distinct from 'array' then
    return jsonb_build_object('applied', false, 'reason', 'invalid_replacement');
  end if;

  select state_json into v_state
  from public.league_state
  where id = 1
  for update;

  if v_state is null or jsonb_typeof(v_state->'glow') is distinct from 'object' then
    return jsonb_build_object('applied', false, 'reason', 'state_unavailable');
  end if;

  v_glow := v_state->'glow';
  v_weeks := coalesce(v_glow->'weeks', '{}'::jsonb);
  v_current_week := v_weeks->p_week_date;
  v_active_week := v_glow->'activeWeek';

  -- A sync may update only the currently selected, already-created Glow week.
  -- It must never create a week with missing defaults or switch the displayed week.
  if v_active_week is distinct from to_jsonb(p_week_date)
     or v_current_week is null then
    return jsonb_build_object('applied', false, 'reason', 'week_not_active_or_initialized');
  end if;

  if coalesce(v_current_week, 'null'::jsonb) is distinct from coalesce(p_expected_week, 'null'::jsonb)
     or coalesce(v_active_week, 'null'::jsonb) is distinct from coalesce(p_expected_active_week, 'null'::jsonb) then
    return jsonb_build_object('applied', false, 'reason', 'concurrent_change');
  end if;
  if v_current_week->>'scoresLocked' = 'true'
     or exists (
       select 1
       from jsonb_array_elements(
         case when jsonb_typeof(v_current_week->'cards') = 'array'
           then v_current_week->'cards' else '[]'::jsonb end
       ) card
       where card->>'finalized' = 'true'
     ) then
    return jsonb_build_object('applied', false, 'reason', 'week_locked');
  end if;

  v_replacement_week := p_replacement_week || jsonb_build_object('date', p_week_date, 'activeWeek', p_week_date);
  v_weeks := jsonb_set(v_weeks, array[p_week_date], v_replacement_week, true);
  v_glow := jsonb_set(v_glow, '{weeks}', v_weeks, true);
  v_state := jsonb_set(v_state, '{glow}', v_glow, true);

  update public.league_state set state_json = v_state where id = 1;
  return jsonb_build_object('applied', true, 'weekDate', p_week_date);
end;
$$;

revoke all on function public.hbnf_apply_udisc_glow_week(text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.hbnf_apply_udisc_glow_week(text, jsonb, jsonb, jsonb) to service_role;
