-- Keep scoring anonymous but make every browser write revision-guarded.
-- Additive RPC expansion only. Existing table writes remain until the new Worker,
-- pages, and Edge writers are verified. The final grant cutover is deliberately
-- outside supabase/migrations/ so a bulk migration cannot revoke early.

-- Match the already-installed Oct 31 guarded RPC semantics, including its
-- explicit row lock, missing-row/error behavior and 8s function timeout.
-- A separate final cutover artifact handles legacy table UPDATE grants.
CREATE OR REPLACE FUNCTION public.hbnf_save_league_state_v1(p_expected_updated_at timestamp with time zone, p_state_json jsonb)
 RETURNS SETOF public.league_state
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
declare
  v_current_updated_at timestamptz;
begin
  if p_expected_updated_at is null then
    raise exception 'expected_revision_required';
  end if;
  if p_state_json is null or pg_catalog.jsonb_typeof(p_state_json) is distinct from 'object' then
    raise exception 'state_json_must_be_object';
  end if;

  select state.updated_at
    into v_current_updated_at
    from public.league_state as state
   where state.id = 1
   for update;

  if not found then
    raise exception 'league_state_row_missing';
  end if;
  if v_current_updated_at is distinct from p_expected_updated_at then
    return;
  end if;

  return query
    update public.league_state as state
       set state_json = p_state_json
     where state.id = 1
       and state.updated_at = p_expected_updated_at
    returning state.*;
end;
$function$;


revoke all on function public.hbnf_save_league_state_v1(timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.hbnf_save_league_state_v1(timestamptz, jsonb)
  to anon, authenticated;

