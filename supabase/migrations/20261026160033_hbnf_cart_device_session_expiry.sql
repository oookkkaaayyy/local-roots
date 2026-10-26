create or replace function public.hbnf_cart_device_session_expiry(p_session_hash text)
returns bigint
language sql
security definer
set search_path = pg_catalog, hbnf_internal
as $$
  select floor(extract(epoch from s.expires_at))::bigint
  from hbnf_internal.cart_device_sessions as s
  where p_session_hash ~ '^[0-9a-f]{64}$'
    and s.token_hash = p_session_hash
    and s.active is true
    and s.expires_at > clock_timestamp()
  limit 1;
$$;

revoke all on function public.hbnf_cart_device_session_expiry(text) from public, anon, authenticated;
grant execute on function public.hbnf_cart_device_session_expiry(text) to service_role;
