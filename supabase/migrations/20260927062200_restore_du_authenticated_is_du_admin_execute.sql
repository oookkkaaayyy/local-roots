-- gallery_items and other D&U authenticated RLS policies call public.is_du_admin().
-- Authenticated browser sessions therefore require EXECUTE on the predicate.
-- Keep anon blocked; published gallery rows have a separate anon SELECT policy.
grant execute on function public.is_du_admin() to authenticated;
revoke execute on function public.is_du_admin() from anon;
