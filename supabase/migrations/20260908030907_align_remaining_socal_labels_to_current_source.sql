do $$
begin
  if not exists (select 1 from public.lr_sources where key='socal_dgc_manual_calendar' and authoritative_fields @> array['name','course_name','td_names']::text[]) then
    raise exception 'socal source authority contract missing expected fields';
  end if;

  update public.lr_events
  set course_name='Chavez Ridge', last_verified_at=now()
  where id='5b77a611-0bc7-43dc-b771-ff6eb9a2272c'::uuid
    and published
    and name='Fling XXIX';

  update public.lr_events
  set course_name='Whittier Narrows', last_verified_at=now()
  where id='200da659-b0fe-4de0-be73-b92ef7fedab7'::uuid
    and published
    and name='Nixon Open';

  update public.lr_events
  set course_name='Oak Grove', last_verified_at=now()
  where id='66486779-77bf-4701-8f83-5a6e8d831af4'::uuid
    and published
    and name='The OG Mamas 12th Annual Breast Cancer, Beat Cancer Charity 2026';

  update public.lr_events
  set name='2026 So Cal Championships Presented by Innova & Legacy – Ams',
      td_names=array['Josh Cheney','Nathan Weaver']::text[],
      last_verified_at=now()
  where id='36dce9e6-02f2-458f-bf09-0dbb4f909e3b'::uuid
    and published
    and name='2026 SoCal Championships, presented by Innova & Legacy - Amateurs';

  update public.lr_event_sources es
  set updated_at=now()
  where es.source_id=(select id from public.lr_sources where key='socal_dgc_manual_calendar')
    and es.event_id in (
      '5b77a611-0bc7-43dc-b771-ff6eb9a2272c'::uuid,
      '200da659-b0fe-4de0-be73-b92ef7fedab7'::uuid,
      '66486779-77bf-4701-8f83-5a6e8d831af4'::uuid,
      '36dce9e6-02f2-458f-bf09-0dbb4f909e3b'::uuid
    );
end $$;
