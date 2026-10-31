-- The anonymous full-root Glow CAS already completes near anon's 3s role limit.
-- Keep every role/global timeout unchanged; allow this single RPC up to 8s,
-- matching the existing authenticated REST role limit, while its CAS and
-- production tag/Matrix triggers run normally.
-- Rollback: ALTER FUNCTION public.hbnf_save_league_state_v1(timestamptz,jsonb)
--           RESET statement_timeout;
ALTER FUNCTION public.hbnf_save_league_state_v1(timestamptz, jsonb)
  SET statement_timeout TO '8s';
