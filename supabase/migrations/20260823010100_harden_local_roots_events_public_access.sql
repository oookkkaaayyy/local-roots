alter function public.lr_public_events() security invoker;

revoke all on function public.lr_validate_event_publication() from public, anon, authenticated;
revoke all on function public.lr_protect_published_event_provenance() from public, anon, authenticated;
revoke all on function public.lr_touch_updated_at() from public, anon, authenticated;

grant execute on function public.lr_validate_event_publication() to service_role;
grant execute on function public.lr_protect_published_event_provenance() to service_role;
grant execute on function public.lr_touch_updated_at() to service_role;

create policy lr_events_public_read
on public.lr_events
for select
to anon, authenticated
using (published);

create policy lr_results_public_read
on public.lr_results
for select
to anon, authenticated
using (
  is_public_selected_division
  and exists (
    select 1
    from public.lr_events e
    where e.id = lr_results.event_id
      and e.published
  )
);

grant select (
  id, slug, name, start_date, end_date, timezone, county, city,
  venue_name, course_name, rounds_text, event_type, format, sanctioned,
  tier, status, registration_status, registration_url, results_url,
  club_host, td_names, published, last_verified_at, last_changed_at
) on public.lr_events to anon, authenticated;

grant select (
  event_id, division_code, place, player_name, pdga_number, total_score,
  to_par, points, rating, source_url, is_public_selected_division,
  last_verified_at
) on public.lr_results to anon, authenticated;
