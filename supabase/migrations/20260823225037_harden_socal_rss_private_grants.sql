-- SoCal RSS cursor/discovery tables are service-role bookkeeping only.
-- RLS already denied row access, but these tables inherited broad default
-- anon/authenticated table grants when created. Remove those grants explicitly
-- so direct client queries fail at the privilege boundary as well.

revoke all on table public.lr_source_cursors from anon, authenticated;
revoke all on table public.lr_source_discovery_items from anon, authenticated;
