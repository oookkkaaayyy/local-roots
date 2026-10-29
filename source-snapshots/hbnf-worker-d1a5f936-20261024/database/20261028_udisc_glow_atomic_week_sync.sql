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
  v_current_updated_at timestamptz;
begin
  if p_week_date is null or p_week_date !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
     or p_replacement_week->>'date' is distinct from p_week_date
     or jsonb_typeof(p_replacement_week->'players') is distinct from 'array'
     or jsonb_typeof(p_replacement_week->'cards') is distinct from 'array' then
    return jsonb_build_object('applied', false, 'reason', 'invalid_replacement');
  end if;

  select state_json, updated_at into v_state, v_current_updated_at
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
  if v_current_week is not distinct from v_replacement_week then
    return jsonb_build_object('applied', true, 'unchanged', true, 'weekDate', p_week_date);
  end if;
  v_weeks := jsonb_set(v_weeks, array[p_week_date], v_replacement_week, true);
  v_glow := jsonb_set(v_glow, '{weeks}', v_weeks, true);
  v_state := jsonb_set(v_state, '{glow}', v_glow, true);

  -- updated_at is also the browser's compare-and-swap revision. Advance it
  -- under this row lock so an older browser draft cannot overwrite this sync.
  -- clock_timestamp() plus the prior value guarantees monotonicity even when
  -- two writes occur within one transaction timestamp tick.
  update public.league_state
    set state_json = v_state,
        updated_at = greatest(
          clock_timestamp(),
          coalesce(v_current_updated_at, '-infinity'::timestamptz) + interval '1 microsecond'
        )
    where id = 1;
  return jsonb_build_object('applied', true, 'weekDate', p_week_date);
end;
$$;

revoke all on function public.hbnf_apply_udisc_glow_week(text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.hbnf_apply_udisc_glow_week(text, jsonb, jsonb, jsonb) to service_role;

-- Record a source failure without replacing scores or the rest of the week.
create or replace function public.hbnf_record_udisc_glow_sync_status(
  p_week_date text,
  p_expected_active_week text,
  p_attempted_at timestamptz,
  p_error_code text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state jsonb;
  v_glow jsonb;
  v_week jsonb;
  v_status jsonb;
  v_error text;
  v_current_updated_at timestamptz;
begin
  if p_week_date is null or p_week_date !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
     or p_expected_active_week is distinct from p_week_date
     or p_attempted_at is null then
    return jsonb_build_object('recorded', false, 'reason', 'invalid_target');
  end if;

  v_error := case when p_error_code in (
    'SOURCE_UNAVAILABLE', 'SOURCE_PARSE_FAILED', 'IDENTITY_REVIEW_REQUIRED',
    'SAVE_CONFLICT', 'SYNC_FAILED'
  ) then p_error_code else 'SYNC_FAILED' end;

  select state_json, updated_at into v_state, v_current_updated_at
  from public.league_state
  where id = 1
  for update;

  if v_state is null or jsonb_typeof(v_state->'glow') is distinct from 'object' then
    return jsonb_build_object('recorded', false, 'reason', 'state_unavailable');
  end if;
  v_glow := v_state->'glow';
  if v_glow->>'activeWeek' is distinct from p_expected_active_week then
    return jsonb_build_object('recorded', false, 'reason', 'active_week_changed');
  end if;
  v_week := v_glow->'weeks'->p_week_date;
  if v_week is null then
    return jsonb_build_object('recorded', false, 'reason', 'week_not_initialized');
  end if;
  if v_week->>'scoresLocked' = 'true' or exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(v_week->'cards') = 'array'
      then v_week->'cards' else '[]'::jsonb end) card
    where card->>'finalized' = 'true'
  ) then
    return jsonb_build_object('recorded', false, 'reason', 'week_locked');
  end if;

  v_status := jsonb_build_object(
    'state', 'failed',
    'lastAttemptAt', p_attempted_at,
    'lastSuccessAt', coalesce(
      v_week->'udiscSync'->'status'->'lastSuccessAt',
      v_week->'udiscSync'->'latest'->'observedAt',
      'null'::jsonb
    ),
    'errorCode', v_error
  );
  v_week := jsonb_set(v_week, '{udiscSync}', coalesce(v_week->'udiscSync', '{}'::jsonb), true);
  v_week := jsonb_set(v_week, '{udiscSync,status}', v_status, true);
  v_glow := jsonb_set(v_glow, array['weeks', p_week_date], v_week, true);
  v_state := jsonb_set(v_state, '{glow}', v_glow, true);
  update public.league_state
    set state_json = v_state,
        updated_at = greatest(
          clock_timestamp(),
          coalesce(v_current_updated_at, '-infinity'::timestamptz) + interval '1 microsecond'
        )
    where id = 1;
  return jsonb_build_object('recorded', true, 'weekDate', p_week_date);
end;
$$;

revoke all on function public.hbnf_record_udisc_glow_sync_status(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.hbnf_record_udisc_glow_sync_status(text, text, timestamptz, text) to service_role;
