-- Additive private-schema access bridge for canonical cart Edge Functions.
-- hbnf_internal remains unexposed; only service_role can execute these public RPCs.
begin;

create or replace function public.hbnf_cart_operator_is_allowed(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, hbnf_internal
stable
as $function$
  select exists (
    select 1
    from hbnf_internal.cart_operator_allowlist
    where user_id = p_user_id and active
  );
$function$;

create or replace function public.hbnf_cart_get_status(p_cart_id text)
returns jsonb
language sql
security definer
set search_path = pg_catalog, hbnf_internal
stable
as $function$
  select jsonb_build_object(
    'desired', (
      select jsonb_build_object(
        'cart_id', d.cart_id, 'revision', d.revision,
        'state', d.state, 'updated_at', d.updated_at
      )
      from hbnf_internal.cart_desired_state d
      where d.cart_id = p_cart_id
    ),
    'observed', coalesce((
      select jsonb_agg(jsonb_build_object(
        'device_id', o.device_id, 'online', o.online, 'status', o.status,
        'desired_revision', o.desired_revision, 'fence_epoch', o.fence_epoch,
        'release_id', o.release_id, 'boot_id', o.boot_id,
        'reported', o.reported, 'observed_at', o.observed_at
      ) order by o.device_id)
      from hbnf_internal.cart_device_observed o
      where o.cart_id = p_cart_id
    ), '[]'::jsonb)
  );
$function$;

create or replace function public.hbnf_cart_get_context(p_cart_id text)
returns jsonb
language sql
security definer
set search_path = pg_catalog, hbnf_internal
stable
as $function$
  select jsonb_build_object(
    'desired', (
      select jsonb_build_object('revision', d.revision, 'state', d.state)
      from hbnf_internal.cart_desired_state d
      where d.cart_id = p_cart_id
    ),
    'fence', (
      select jsonb_build_object('epoch', f.epoch, 'release_id', f.release_id, 'active', f.active)
      from hbnf_internal.cart_actuator_fence f
      where f.cart_id = p_cart_id
    )
  );
$function$;

create or replace function public.hbnf_cart_commit_command_bridge(
  p_cart_id text,
  p_command_id uuid,
  p_command_type text,
  p_expected_revision bigint,
  p_next_state jsonb
) returns table(accepted boolean, duplicate boolean, result_revision bigint, current_state jsonb)
language sql
security definer
set search_path = pg_catalog, hbnf_internal
as $function$
  select * from hbnf_internal.hbnf_cart_commit_command(
    p_cart_id, p_command_id, p_command_type, p_expected_revision, p_next_state
  );
$function$;

create or replace function public.hbnf_cart_get_observed(p_cart_id text, p_device_id text)
returns jsonb
language sql
security definer
set search_path = pg_catalog, hbnf_internal
stable
as $function$
  select (
    select jsonb_build_object(
      'device_id', o.device_id, 'online', o.online, 'status', o.status,
      'desired_revision', o.desired_revision, 'fence_epoch', o.fence_epoch,
      'release_id', o.release_id, 'boot_id', o.boot_id,
      'reported', o.reported, 'observed_at', o.observed_at
    )
    from hbnf_internal.cart_device_observed o
    where o.cart_id = p_cart_id and o.device_id = p_device_id
  );
$function$;

create or replace function public.hbnf_cart_upsert_observed(
  p_cart_id text, p_device_id text, p_online boolean, p_status text,
  p_desired_revision bigint, p_fence_epoch bigint, p_release_id text, p_boot_id text,
  p_reported jsonb, p_observed_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, hbnf_internal
as $function$
begin
  insert into hbnf_internal.cart_device_observed(
    cart_id, device_id, online, status, desired_revision, fence_epoch,
    release_id, boot_id, reported, observed_at
  ) values (
    p_cart_id, p_device_id, p_online, p_status, p_desired_revision, p_fence_epoch,
    p_release_id, p_boot_id, coalesce(p_reported, '{}'::jsonb), coalesce(p_observed_at, clock_timestamp())
  )
  on conflict (cart_id, device_id) do update set
    online = excluded.online,
    status = excluded.status,
    desired_revision = excluded.desired_revision,
    fence_epoch = excluded.fence_epoch,
    release_id = excluded.release_id,
    boot_id = excluded.boot_id,
    reported = excluded.reported,
    observed_at = excluded.observed_at;
  return true;
end;
$function$;

revoke all on function public.hbnf_cart_operator_is_allowed(uuid) from public, anon, authenticated;
revoke all on function public.hbnf_cart_get_status(text) from public, anon, authenticated;
revoke all on function public.hbnf_cart_get_context(text) from public, anon, authenticated;
revoke all on function public.hbnf_cart_commit_command_bridge(text, uuid, text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.hbnf_cart_get_observed(text, text) from public, anon, authenticated;
revoke all on function public.hbnf_cart_upsert_observed(text, text, boolean, text, bigint, bigint, text, text, jsonb, timestamptz) from public, anon, authenticated;

grant execute on function public.hbnf_cart_operator_is_allowed(uuid) to service_role;
grant execute on function public.hbnf_cart_get_status(text) to service_role;
grant execute on function public.hbnf_cart_get_context(text) to service_role;
grant execute on function public.hbnf_cart_commit_command_bridge(text, uuid, text, bigint, jsonb) to service_role;
grant execute on function public.hbnf_cart_get_observed(text, text) to service_role;
grant execute on function public.hbnf_cart_upsert_observed(text, text, boolean, text, bigint, bigint, text, text, jsonb, timestamptz) to service_role;

commit;
