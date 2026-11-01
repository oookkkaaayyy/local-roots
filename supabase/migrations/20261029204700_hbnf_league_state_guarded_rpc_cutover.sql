-- Keep scoring anonymous but make every browser write revision-guarded.
-- Additive RPC expansion only. Existing table writes remain until the new Worker,
-- pages, and Edge writers are verified. The final grant cutover is deliberately
-- outside supabase/migrations/ so a bulk migration cannot revoke early.

create or replace function public.hbnf_save_league_state_v1(
  p_expected_updated_at timestamptz,
  p_state_json jsonb
)
returns setof public.league_state
language plpgsql
security definer
set search_path = ''
-- Preserve the installed 8-second RPC timeout (Oct 31 production repair).
set statement_timeout = '8s'
as $
begin
  if p_expected_updated_at is null then
    raise exception 'Expected league_state revision is required'
      using errcode = '22023';
  end if;
  if p_state_json is null or pg_catalog.jsonb_typeof(p_state_json) <> 'object' then
    raise exception 'league_state must be a JSON object'
      using errcode = '22023';
  end if;

  -- The row lock serializes competing writers. The existing server revision
  -- trigger replaces client time; no returned row means a stale revision.
  return query
    update public.league_state as ls
       set state_json = p_state_json
     where ls.id = 1
       and ls.updated_at = p_expected_updated_at
    returning ls.*;
end;
$$;

revoke all on function public.hbnf_save_league_state_v1(timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.hbnf_save_league_state_v1(timestamptz, jsonb)
  to anon, authenticated;

