revoke execute on function public.lr_match_candidate(uuid,text,jsonb) from public, anon, authenticated;
revoke execute on function public.lr_candidate_scope_status(jsonb) from public, anon, authenticated;
revoke execute on function public.lr_source_authoritative_for(uuid,text) from public, anon, authenticated;

grant execute on function public.lr_match_candidate(uuid,text,jsonb) to service_role;
grant execute on function public.lr_candidate_scope_status(jsonb) to service_role;
grant execute on function public.lr_source_authoritative_for(uuid,text) to service_role;
