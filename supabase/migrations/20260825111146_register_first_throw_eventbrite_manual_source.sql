insert into public.lr_sources (
  key,name,source_type,base_url,access_method,permission_basis,enabled,authoritative_fields,refresh_schedule,notes
)
values (
  'first_throw_eventbrite_manual',
  'First Throw Disc Golf organizer Eventbrite — manual verification',
  'manual',
  'https://www.eventbrite.com/o/first-throw-disc-golf-121205994150',
  'Manual factual verification of organizer-managed public Eventbrite listings only; no automated crawling enabled',
  'First-party organizer-managed Eventbrite channel for First Throw Disc Golf, a San Diego-based disc golf organizer. Local Roots may store only event facts visible on current organizer-controlled listings after manual verification.',
  true,
  array['name','start_date','end_date','city','venue_name','course_name','event_type','registration_status','registration_url','club_host']::text[],
  null,
  'Current organizer channel establishes First Throw as a San Diego disc-golf event organizer. No current/future event is promoted merely from source registration; each event still requires a current organizer-controlled listing. Do not use PDGA, Disc Golf Scene, or UDisc fallback facts.'
)
on conflict (key) do update
set name=excluded.name,source_type=excluded.source_type,base_url=excluded.base_url,access_method=excluded.access_method,permission_basis=excluded.permission_basis,enabled=excluded.enabled,authoritative_fields=excluded.authoritative_fields,refresh_schedule=excluded.refresh_schedule,notes=excluded.notes,updated_at=current_timestamp;
