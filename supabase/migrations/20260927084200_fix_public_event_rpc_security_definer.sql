-- Keep provenance/source tables private while allowing the intentionally public
-- event RPCs to read them for the narrow official_url projection.
--
-- The RPCs already pin search_path and expose only published event projections, so
-- SECURITY DEFINER avoids granting anon/authenticated direct SELECT on provenance tables.

alter function public.lr_public_events() security definer;
alter function public.lr_public_event_detail(text) security definer;

revoke all on function public.lr_public_events() from public;
revoke all on function public.lr_public_event_detail(text) from public;
grant execute on function public.lr_public_events() to anon, authenticated, service_role;
grant execute on function public.lr_public_event_detail(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
