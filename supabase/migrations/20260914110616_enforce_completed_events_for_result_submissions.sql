create or replace function public.lr_require_completed_event_for_result_submission()
returns trigger
language plpgsql
security invoker
set search_path to pg_catalog, public
as $$
declare
  v_end_date date;
  v_published boolean;
begin
  select e.end_date, e.published
    into v_end_date, v_published
  from public.lr_events e
  where e.id = new.event_id;

  if v_end_date is null or v_published is distinct from true then
    raise exception 'event_not_available';
  end if;

  if v_end_date >= (current_timestamp at time zone 'America/Los_Angeles')::date then
    raise exception 'event_not_completed';
  end if;

  return new;
end;
$$;

revoke all on function public.lr_require_completed_event_for_result_submission() from public, anon, authenticated;
grant execute on function public.lr_require_completed_event_for_result_submission() to service_role;

drop trigger if exists lr_result_submissions_completed_event_insert on public.lr_result_submissions;
create trigger lr_result_submissions_completed_event_insert
before insert on public.lr_result_submissions
for each row execute function public.lr_require_completed_event_for_result_submission();

drop trigger if exists lr_result_submissions_completed_event_approval on public.lr_result_submissions;
create trigger lr_result_submissions_completed_event_approval
before update of status on public.lr_result_submissions
for each row
when (new.status = 'approved')
execute function public.lr_require_completed_event_for_result_submission();
