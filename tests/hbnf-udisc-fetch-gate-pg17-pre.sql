-- ISOLATED POSTGRES 17 CI ONLY. Never send to live provider.
CREATE ROLE service_role BYPASSRLS;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.league_state (
  id integer PRIMARY KEY, state_json jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.hbnf_udisc_glow_event_bindings (
  event_date date NOT NULL, event_id text NOT NULL,
  window_start timestamptz NOT NULL, window_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT ON public.hbnf_udisc_glow_event_bindings TO service_role;
INSERT INTO public.league_state(id,state_json)
VALUES(1,'{"glow":{"activeWeek":"2026-11-10","weeks":{"2026-11-10":{"date":"2026-11-10","players":[],"cards":[],"scoresLocked":false}}}}');
INSERT INTO public.hbnf_udisc_glow_event_bindings(event_date,event_id,window_start,window_end)
VALUES(current_date,'hb-glow-doubles-af85rU',
  clock_timestamp()-interval '1 hour',clock_timestamp()+interval '5 hours');
-- Exact installed function source from verified production pg_get_functiondef.

CREATE OR REPLACE FUNCTION public.hbnf_record_udisc_glow_sync_status(p_week_date text, p_expected_active_week text, p_attempted_at timestamp with time zone, p_error_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$


REVOKE EXECUTE ON FUNCTION public.hbnf_record_udisc_glow_sync_status(text,text,timestamptz,text)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hbnf_record_udisc_glow_sync_status(text,text,timestamptz,text)
 TO service_role;
