-- Enforce a monotonic revision for every mutation of the shared HBNF row.
-- Browser wall clocks are not authoritative: iPhone/iPad time may be skewed.
-- Run after the existing tag projection BEFORE trigger so the revision is
-- attached to the final row image observed by Matrix AFTER triggers.
create or replace function public.hbnf_enforce_league_state_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
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
