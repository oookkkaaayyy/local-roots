revoke all on function public.hbnf_cart_matrix_relay_confirm(uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.hbnf_cart_matrix_relay_authorize_apply(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.hbnf_cart_matrix_relay_get(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.hbnf_cart_matrix_relay_issue(text,text,bigint,bigint,text,text,text,jsonb,jsonb,integer) from public,anon,authenticated,service_role;
drop function if exists public.hbnf_cart_matrix_relay_confirm(uuid,text,jsonb,jsonb);
drop function if exists public.hbnf_cart_matrix_relay_authorize_apply(uuid,text);
drop function if exists public.hbnf_cart_matrix_relay_get(uuid,text);
drop function if exists public.hbnf_cart_matrix_relay_issue(text,text,bigint,bigint,text,text,text,jsonb,jsonb,integer);
drop table if exists hbnf_internal.cart_matrix_relay_challenges;
