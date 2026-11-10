-- Server-owned, strictly advancing revision for the shared HBNF state row.
-- PostgREST serializes competing UPDATEs on the row; each trigger invocation
-- therefore observes the committed OLD revision after the row lock is acquired.
-- Keep the trigger name alphabetically after the current-tag projection BEFORE
-- trigger so NEW.state_json reflects authoritative tags before change detection.
create or replace function public.hbnf_enforce_league_state_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A no-op must not create artificial revision churn or downstream Matrix
  -- work, and a caller-supplied clock value must not rewrite the baseline.
  if new.state_json is not distinct from old.state_json then
    new.updated_at := old.updated_at;
    return new;
  end if;

  -- No finite timestamp can advance past +infinity. Fail closed for the
  -- impossible-to-advance legacy row rather than falsely accepting a revision.
  if old.updated_at = 'infinity'::timestamptz then
    raise exception 'Cannot advance league_state revision from infinity';
  end if;

  -- The database clock wins, but the old revision is also a lower bound.
  -- Adding exactly one microsecond preserves strict ordering at timestamptz(6)
  -- precision, even for equal, reversed, or future-skewed client clocks.
  new.updated_at := greatest(
    pg_catalog.clock_timestamp(),
    coalesce(old.updated_at, '-infinity'::timestamptz) + interval '1 microsecond'
  );
  return new;
end;
$$;

drop trigger if exists zzz_hbnf_enforce_league_state_revision on public.league_state;
create trigger zzz_hbnf_enforce_league_state_revision
before update on public.league_state
for each row
execute function public.hbnf_enforce_league_state_revision();

revoke all on function public.hbnf_enforce_league_state_revision() from public, anon, authenticated;
