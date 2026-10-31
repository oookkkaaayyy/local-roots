-- The browser reads the complete shared-state row through PostgREST.
-- Keep the bounded extension scoped to anonymous client requests only; the
-- existing CAS RPC keeps its independent function-local 8s timeout.
ALTER ROLE anon SET statement_timeout = '8s';
NOTIFY pgrst, 'reload config';
