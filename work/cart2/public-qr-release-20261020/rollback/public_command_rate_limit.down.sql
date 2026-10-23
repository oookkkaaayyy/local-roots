-- Roll back only the public-command limiter migration. Intentionally retain
-- the pairing-handoff RPC hardening introduced by the forward migration.
REVOKE ALL ON FUNCTION public.hbnf_cart_create_install_handoff(text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hbnf_cart_create_install_handoff(text, text, timestamptz)
  TO service_role;
DROP FUNCTION IF EXISTS public.hbnf_cart_consume_public_command_token();
DROP TABLE IF EXISTS hbnf_internal.cart_public_command_rate_limit;
