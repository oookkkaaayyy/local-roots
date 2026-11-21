create table if not exists public.du_notify_state (key text primary key, val jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
alter table public.du_notify_state enable row level security;
revoke all on table public.du_notify_state from public, anon, authenticated;
grant all on table public.du_notify_state to service_role;

create or replace function public.du_recipes_rate_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.du_dye_recipes where created_at > now() - interval '1 hour') >= 40 then
    raise exception 'du_recipes_rate_limit';
  end if;
  return new;
end $$;
drop trigger if exists du_recipes_rate_guard on public.du_dye_recipes;
create trigger du_recipes_rate_guard before insert on public.du_dye_recipes for each row execute function public.du_recipes_rate_guard();

select cron.schedule('du-notify', '*/10 * * * *', $c$select net.http_post(url := 'https://wtymjxscneufjlkkywyg.supabase.co/functions/v1/du-notify', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb)$c$);
