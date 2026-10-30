-- Add an acknowledged CAS save path for Glow while preserving the existing
-- no-login direct INSERT/UPDATE privileges used by Skins, Admin, Random, and Skills.
create or replace function public.hbnf_save_league_state_v1(
  p_expected_updated_at timestamptz,
  p_state_json jsonb
)
returns setof public.league_state
language plpgsql
security definer
set search_path = ''
as $function$
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

revoke all on function public.hbnf_save_league_state_v1(timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.hbnf_save_league_state_v1(timestamptz, jsonb) to anon, authenticated;

-- Preserve the existing public scorecard access. Legacy pages still use direct
-- league_state PATCH/UPSERT; the new RPC is additive and does not revoke it.
grant select on table public.league_state to anon, authenticated;
