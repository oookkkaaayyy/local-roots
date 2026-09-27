-- Expose one permitted first-party/authoritative event source as navigation metadata.
-- Restricted discovery/results sources remain excluded because this only considers
-- provenance roles that can carry event facts and sources with authoritative fields.

drop function if exists public.lr_public_event_detail(text);
drop function if exists public.lr_public_events();

create function public.lr_public_events()
returns table(
  id uuid,
  slug text,
  name text,
  start_date date,
  end_date date,
  timezone text,
  county text,
  city text,
  venue_name text,
  course_name text,
  rounds_text text,
  event_type text,
  format text,
  sanctioned boolean,
  tier text,
  status text,
  registration_status text,
  registration_url text,
  results_url text,
  club_host text,
  td_names text[],
  last_verified_at timestamptz,
  last_changed_at timestamptz,
  official_url text,
  top_results jsonb
)
language sql
stable
set search_path to 'pg_catalog', 'public'
as $function$
  select
    e.id,e.slug,e.name,e.start_date,e.end_date,e.timezone,e.county,e.city,e.venue_name,e.course_name,
    e.rounds_text,e.event_type,e.format,e.sanctioned,e.tier,
    case
      when e.end_date < (current_timestamp at time zone 'America/Los_Angeles')::date
        and e.status in ('announced','upcoming','registration_open','full','waitlist')
      then 'completed'::text
      else e.status
    end as status,
    e.registration_status,e.registration_url,e.results_url,e.club_host,e.td_names,
    e.last_verified_at,e.last_changed_at,
    (
      select es.source_url
      from public.lr_event_sources es
      join public.lr_sources s on s.id=es.source_id
      where es.event_id=e.id
        and es.source_role in ('organizer_confirmed','official','manual_verification')
        and cardinality(s.authoritative_fields) > 0
      order by
        cardinality(s.authoritative_fields) desc,
        case es.source_role
          when 'organizer_confirmed' then 0
          when 'official' then 1
          else 2
        end,
        coalesce(es.confidence,0) desc,
        es.last_seen_at desc,
        es.source_url
      limit 1
    ) as official_url,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'division_code',r.division_code,
          'place',r.place,
          'player_name',r.player_name,
          'pdga_number',r.pdga_number,
          'total_score',r.total_score,
          'to_par',r.to_par,
          'points',r.points,
          'rating',r.rating,
          'source_url',r.source_url,
          'last_verified_at',r.last_verified_at
        )
        order by r.place,r.player_name
      )
      from public.lr_results r
      where r.event_id=e.id
        and r.is_public_selected_division
        and r.place <= 3
    ),'[]'::jsonb) as top_results
  from public.lr_events e
  where e.published
  order by e.start_date,e.name
$function$;

create function public.lr_public_event_detail(p_slug text)
returns table(
  id uuid,
  slug text,
  name text,
  start_date date,
  end_date date,
  timezone text,
  county text,
  city text,
  venue_name text,
  course_name text,
  rounds_text text,
  event_type text,
  format text,
  sanctioned boolean,
  tier text,
  status text,
  registration_status text,
  registration_url text,
  results_url text,
  club_host text,
  td_names text[],
  last_verified_at timestamptz,
  last_changed_at timestamptz,
  official_url text,
  top_results jsonb,
  all_results jsonb
)
language sql
stable
set search_path to 'pg_catalog', 'public'
as $function$
  select
    p.*,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'division_code',r.division_code,
          'place',r.place,
          'player_name',r.player_name,
          'pdga_number',r.pdga_number,
          'total_score',r.total_score,
          'to_par',r.to_par,
          'points',r.points,
          'rating',r.rating,
          'source_url',r.source_url,
          'last_verified_at',r.last_verified_at
        )
        order by r.division_code,r.place,r.player_name
      )
      from public.lr_results r
      where r.event_id=p.id
    ),'[]'::jsonb) as all_results
  from public.lr_public_events() p
  where p.slug=p_slug
  limit 1
$function$;

revoke all on function public.lr_public_events() from public;
revoke all on function public.lr_public_event_detail(text) from public;
grant execute on function public.lr_public_events() to anon, authenticated, service_role;
grant execute on function public.lr_public_event_detail(text) to anon, authenticated, service_role;
