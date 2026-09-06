do $$
declare
  v_event_id uuid;
  v_socal_source_id uuid;
  v_city_source_id uuid;
  v_county_source_id uuid;
begin
  select id into v_socal_source_id from public.lr_sources where key = 'socal_dgc_manual_calendar';
  if v_socal_source_id is null then
    raise exception 'Required source socal_dgc_manual_calendar is missing';
  end if;

  insert into public.lr_sources (
    key, name, source_type, base_url, access_method, permission_basis,
    enabled, authoritative_fields, notes
  ) values (
    'city_ontario_whispering_lakes_manual',
    'City of Ontario — Whispering Lakes Golf Course',
    'manual',
    'https://www.ontarioca.gov/government/communitylife/recreation-community-services/parks/whispering-lakes-golf-course',
    'Manual verification of the City of Ontario public first-party facility page; no automated crawling.',
    'Official City of Ontario public information may be used for narrow city and facility identity/location facts for Whispering Lakes Golf Course. It does not establish tournament dates, sanctioning, registration, results, or organizer details.',
    true,
    array['city','course_name']::text[],
    'Narrow first-party venue/city corroboration only.'
  ) on conflict (key) do update set
    name = excluded.name,
    base_url = excluded.base_url,
    access_method = excluded.access_method,
    permission_basis = excluded.permission_basis,
    enabled = excluded.enabled,
    authoritative_fields = excluded.authoritative_fields,
    notes = excluded.notes,
    updated_at = now()
  returning id into v_city_source_id;

  if v_city_source_id is null then
    select id into v_city_source_id from public.lr_sources where key = 'city_ontario_whispering_lakes_manual';
  end if;

  insert into public.lr_sources (
    key, name, source_type, base_url, access_method, permission_basis,
    enabled, authoritative_fields, notes
  ) values (
    'san_bernardino_county_ontario_manual',
    'San Bernardino County — Ontario geography',
    'manual',
    'https://main.sbcounty.gov/2024/12/05/san-bernardino-county-history-ontario/',
    'Manual verification of the San Bernardino County public first-party page; no automated crawling.',
    'Official San Bernardino County public information identifies Ontario as a city in San Bernardino County. Use only for narrow county/city geography corroboration; it does not establish disc-golf event facts.',
    true,
    array['county','city']::text[],
    'Narrow first-party geography corroboration only.'
  ) on conflict (key) do update set
    name = excluded.name,
    base_url = excluded.base_url,
    access_method = excluded.access_method,
    permission_basis = excluded.permission_basis,
    enabled = excluded.enabled,
    authoritative_fields = excluded.authoritative_fields,
    notes = excluded.notes,
    updated_at = now()
  returning id into v_county_source_id;

  if v_county_source_id is null then
    select id into v_county_source_id from public.lr_sources where key = 'san_bernardino_county_ontario_manual';
  end if;

  select id into v_event_id
  from public.lr_events
  where slug = 'whispering-lakes-championship-2026';

  if v_event_id is null then
    insert into public.lr_events (
      slug, name, start_date, end_date, timezone, county, city, course_name,
      event_type, sanctioned, tier, status, registration_status,
      registration_url, td_names, published, confidence,
      last_verified_at, last_changed_at
    ) values (
      'whispering-lakes-championship-2026',
      'Whispering Lakes Championship, supported by Innova Disc Golf',
      date '2026-10-25', date '2026-10-25', 'America/Los_Angeles',
      'San Bernardino', 'Ontario', 'Whispering Lakes Golf Course',
      'tournament', true, null, 'upcoming', null,
      'https://www.discgolfscene.com/tournament/Whispering_Lakes_Championship_supported_by_Innova_Disc_Golf_2026',
      array['Nathan Weaver']::text[], false, 0.90,
      now(), now()
    ) returning id into v_event_id;
  else
    update public.lr_events set
      name = 'Whispering Lakes Championship, supported by Innova Disc Golf',
      start_date = date '2026-10-25',
      end_date = date '2026-10-25',
      timezone = 'America/Los_Angeles',
      county = 'San Bernardino',
      city = 'Ontario',
      course_name = 'Whispering Lakes Golf Course',
      event_type = 'tournament',
      sanctioned = true,
      tier = null,
      status = 'upcoming',
      registration_status = null,
      registration_url = 'https://www.discgolfscene.com/tournament/Whispering_Lakes_Championship_supported_by_Innova_Disc_Golf_2026',
      td_names = array['Nathan Weaver']::text[],
      confidence = 0.90,
      last_verified_at = now(),
      updated_at = now()
    where id = v_event_id;
  end if;

  insert into public.lr_event_sources (
    event_id, source_id, external_id, source_url, source_role,
    is_sanction_basis, source_payload, last_seen_at, last_fetched_at, confidence
  ) values (
    v_event_id, v_socal_source_id,
    'socal:2026:whispering-lakes-championship-2026',
    'https://socaldiscgolfclub.com/upcoming-events/',
    'organizer_confirmed', true,
    jsonb_build_object(
      'verification','manual',
      'verified_fields',jsonb_build_array('name','start_date','end_date','city','course_name','sanctioned','td_names','registration_url'),
      'tier_observed_but_not_promoted',true,
      'registration_destination_used_as_navigation_metadata',true
    ),
    now(), now(), 0.90
  ) on conflict (source_id, external_id) where external_id is not null do update set
    event_id = excluded.event_id,
    source_url = excluded.source_url,
    source_role = excluded.source_role,
    is_sanction_basis = excluded.is_sanction_basis,
    source_payload = excluded.source_payload,
    last_seen_at = now(),
    last_fetched_at = now(),
    confidence = excluded.confidence,
    updated_at = now();

  insert into public.lr_event_sources (
    event_id, source_id, external_id, source_url, source_role,
    is_sanction_basis, source_payload, last_seen_at, last_fetched_at, confidence
  ) values (
    v_event_id, v_city_source_id,
    'city-ontario:whispering-lakes-golf-course',
    'https://www.ontarioca.gov/government/communitylife/recreation-community-services/parks/whispering-lakes-golf-course',
    'official', false,
    jsonb_build_object('verified_fields',jsonb_build_array('city','course_name')),
    now(), now(), 0.99
  ) on conflict (source_id, external_id) where external_id is not null do update set
    event_id = excluded.event_id,
    source_url = excluded.source_url,
    source_role = excluded.source_role,
    source_payload = excluded.source_payload,
    last_seen_at = now(),
    last_fetched_at = now(),
    confidence = excluded.confidence,
    updated_at = now();

  insert into public.lr_event_sources (
    event_id, source_id, external_id, source_url, source_role,
    is_sanction_basis, source_payload, last_seen_at, last_fetched_at, confidence
  ) values (
    v_event_id, v_county_source_id,
    'sbcounty:ontario-geography',
    'https://main.sbcounty.gov/2024/12/05/san-bernardino-county-history-ontario/',
    'official', false,
    jsonb_build_object('verified_fields',jsonb_build_array('county','city')),
    now(), now(), 0.99
  ) on conflict (source_id, external_id) where external_id is not null do update set
    event_id = excluded.event_id,
    source_url = excluded.source_url,
    source_role = excluded.source_role,
    source_payload = excluded.source_payload,
    last_seen_at = now(),
    last_fetched_at = now(),
    confidence = excluded.confidence,
    updated_at = now();

  update public.lr_events
  set published = true, last_verified_at = now(), updated_at = now()
  where id = v_event_id;
end $$;
