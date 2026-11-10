-- Final HBNF scoring writer cutover (REVIEW ONLY until multi-target admission).
-- Not a Supabase auto-migration. The verified parent release driver may apply this
-- only AFTER the new Worker pages and all Edge writers are installed and read back.
-- Immediately preceding rollback must restore grants BEFORE reverting the Worker.
-- Preserve public reads and service-role server writes. Anonymous/authenticated
-- callers must use the conditional RPC. Old loaded pages fail closed rather
-- than replacing a score written after their last read.
revoke insert, update on table public.league_state from public, anon, authenticated;
grant select on table public.league_state to anon, authenticated;
drop policy if exists "Public can update league_state" on public.league_state;
drop policy if exists "Public can write league_state" on public.league_state;
