-- Keep scoring anonymous but make every browser write revision-guarded.
-- Existing table INSERT/UPDATE grants let previously loaded clients issue an
-- unconditional whole-root upsert; the revision trigger cannot detect staleness
-- in that request. The replacement RPC and grant cutover are atomic.

create or replace function public.hbnf_save_league_state_v1(
  p_expected_updated_at timestamptz,
  p_state_json jsonb
)
returns setof public.league_state
language plpgsql
security definer
set search_path = ''
as $$
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

-- Preserve public reads and service-role server writes. Anonymous/authenticated
-- callers must use the conditional RPC. Old loaded pages fail closed rather
-- than replacing a score written after their last read.
revoke insert, update on table public.league_state from public, anon, authenticated;
grant select on table public.league_state to anon, authenticated;
drop policy if exists "Public can update league_state" on public.league_state;
drop policy if exists "Public can write league_state" on public.league_state;
