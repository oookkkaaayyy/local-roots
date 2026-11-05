-- Reconcile the field semantics of first-party recurring schedules already
-- materialized by the September coverage migration. This uses the existing
-- source-candidate authority/override pipeline; it never edits canonical rows
-- directly and never changes dates, publication, or event identity.
begin;

do $$
declare
  v_oak uuid;
  v_crpd uuid;
  v_oak_run uuid;
  v_crpd_run uuid;
  r record;
  v_payload jsonb;
  v_evidence jsonb;
  v_candidate uuid;
  v_result public.lr_source_candidates%rowtype;
  v_verified_at timestamptz := '2026-11-01T05:58:03Z'::timestamptz;
  v_records integer := 0;
begin
  select id into v_oak from public.lr_sources where key='oak_grove_disc_golf_club_direct' and enabled;
  select id into v_crpd from public.lr_sources where key='crpd_rabbit_flats_direct' and enabled;
  if v_oak is null or v_crpd is null then raise exception 'Required first-party schedule sources are not enabled'; end if;

  insert into public.lr_source_runs(source_id,started_at,finished_at,fetch_status,parse_status,validation_status,health_status,
    records_seen,records_valid,records_rejected,scheduler_status,metrics,parser_version)
  values(v_oak,v_verified_at,v_verified_at,'ok','ok','ok','healthy',0,0,0,'skipped',
    jsonb_build_object('verification_method','manual_reconciliation_from_snapshot_and_first_party_page','verified_at',v_verified_at),
    'schedule-field-reconciliation-v1') returning id into v_oak_run;

  for r in
    select e.id,e.slug,e.name,e.start_date,e.end_date,e.timezone,e.county,e.city,e.course_name,e.format,
      es.external_id,es.source_url,es.source_payload
    from public.lr_events e
    join public.lr_event_sources es on es.event_id=e.id and es.source_id=v_oak
    where es.source_payload->>'schedule_derived'='true'
      and nullif(es.source_payload->>'published_time','') is not null
    order by e.start_date,e.slug
  loop
    v_evidence:=jsonb_build_object(
      'timezone',jsonb_build_object('status','verified','source_key','oak_grove_disc_golf_club_direct','source_url',r.source_url,
        'verified_at',v_verified_at,'refresh_on_sync',false,'notes','Pacific timezone verified from the Oak Grove first-party schedule and event location.' )
    );
    v_payload:=jsonb_build_object(
      'name',r.name,'start_date',r.start_date,'end_date',r.end_date,'timezone','America/Los_Angeles',
      'county',r.county,'city',r.city,'course_name',r.course_name
    );

    if r.source_payload->>'published_time' in ('3 hours before sunset','Show up around 5 PM') then
      v_payload:=v_payload||jsonb_build_object('start_time_note',r.source_payload->>'published_time');
      v_evidence:=v_evidence||jsonb_build_object('start_time_note',jsonb_build_object(
        'status','verified','source_key','oak_grove_disc_golf_club_direct','source_url',r.source_url,'verified_at',v_verified_at,
        'refresh_on_sync',false,'notes','Textual start-time guidance is preserved as a note; it is not converted into an exact clock time.'
      ));
    elsif r.source_payload->>'published_time' ilike '1 PM Check-in, 2 PM%' then
      v_payload:=v_payload||jsonb_build_object('checkin_time_local','13:00','start_time_local','14:00');
      v_evidence:=v_evidence||jsonb_build_object(
        'checkin_time_local',jsonb_build_object('status','verified','source_key','oak_grove_disc_golf_club_direct','source_url',r.source_url,'verified_at',v_verified_at,'refresh_on_sync',false,'notes',r.source_payload->>'published_time'),
        'start_time_local',jsonb_build_object('status','verified','source_key','oak_grove_disc_golf_club_direct','source_url',r.source_url,'verified_at',v_verified_at,'refresh_on_sync',false,'notes',r.source_payload->>'published_time')
      );
    else
      raise exception 'Unrecognized Oak Grove published_time for %: %',r.slug,r.source_payload->>'published_time';
    end if;

    if r.name in ('Wednesday Doubles','Friday Doubles') then
      v_payload:=v_payload||jsonb_build_object('format','Doubles');
      v_evidence:=v_evidence||jsonb_build_object('format',jsonb_build_object(
        'status','verified','source_key','oak_grove_disc_golf_club_direct','source_url',r.source_url,'verified_at',v_verified_at,
        'refresh_on_sync',false,'notes','The first-party recurring event name explicitly identifies doubles.'
      ));
    elsif r.name='Howard''s Weekly' and (r.format is null or r.format=r.source_payload->>'published_time') then
      v_payload:=v_payload||jsonb_build_object('format',null);
      v_evidence:=v_evidence||jsonb_build_object('format',jsonb_build_object(
        'status','not_announced','clear_value',true,'source_key','oak_grove_disc_golf_club_direct','source_url',r.source_url,
        'verified_at',v_verified_at,'refresh_on_sync',false,
        'notes','The prior canonical value was the schedule time text, not a play format; the reviewed first-party schedule does not announce a play format for this event.'
      ));
    end if;
    if r.name='OG Monthly & Disc Swap' then
      -- The current first-party page now states Disc Swap 8 AM–2 PM. The
      -- older source payload said 11:30 AM–5:30 PM; retain that prior text in
      -- the source run metrics below while promoting the current page detail.
      v_payload:=v_payload||jsonb_build_object('format_details',jsonb_build_object('disc_swap_hours','8 AM–2 PM'));
      v_evidence:=v_evidence||jsonb_build_object('format_details',jsonb_build_object(
        'status','verified','source_key','oak_grove_disc_golf_club_direct','source_url',r.source_url,'verified_at',v_verified_at,
        'refresh_on_sync',false,'notes','Current Oak Grove EVENTS page lists Disc Swap 8 AM–2 PM; the previously stored 11:30 AM–5:30 PM text is superseded.'
      ));
    end if;
    v_payload:=v_payload||jsonb_build_object('field_evidence',v_evidence);

    insert into public.lr_source_candidates(source_run_id,source_id,external_id,source_url,normalized_payload)
    values(v_oak_run,v_oak,r.external_id,r.source_url,v_payload) returning id into v_candidate;
    select * into v_result from public.lr_process_candidate(v_candidate);
    if v_result.validation_status<>'valid' or v_result.match_event_id is distinct from r.id or v_result.match_method<>'source_external_id' then
      raise exception 'Oak schedule reconciliation failed closed for %: validation %, match %, method %',r.slug,v_result.validation_status,v_result.match_event_id,v_result.match_method;
    end if;
    perform public.lr_apply_authoritative_candidate(v_candidate);
    if r.name='OG Monthly & Disc Swap' then
      update public.lr_event_sources set
        source_payload=source_payload||jsonb_build_object(
          'published_time','1 PM Check-in, 2 PM start; Disc Swap 8 AM-2 PM',
          'prior_published_time',source_payload->>'published_time',
          'source_rechecked_at',v_verified_at,
          'source_section','EVENTS'
        ),last_fetched_at=v_verified_at,last_seen_at=greatest(last_seen_at,v_verified_at),updated_at=now()
      where event_id=r.id and source_id=v_oak and external_id=r.external_id;
      update public.lr_source_runs set metrics=metrics||jsonb_build_object(
        'source_payload_corrections',coalesce(metrics->'source_payload_corrections','[]'::jsonb)||jsonb_build_array(
          jsonb_build_object('event_slug',r.slug,'prior_published_time',r.source_payload->>'published_time',
            'current_published_time','1 PM Check-in, 2 PM start; Disc Swap 8 AM-2 PM','verified_at',v_verified_at)
        )
      ) where id=v_oak_run;
    end if;
    v_records:=v_records+1;
  end loop;
  update public.lr_source_runs set records_seen=v_records,records_valid=v_records,metrics=metrics||jsonb_build_object('records_reconciled',v_records) where id=v_oak_run;

  insert into public.lr_source_runs(source_id,started_at,finished_at,fetch_status,parse_status,validation_status,health_status,
    records_seen,records_valid,records_rejected,scheduler_status,metrics,parser_version)
  values(v_crpd,v_verified_at,v_verified_at,'ok','ok','ok','healthy',0,0,0,'skipped',
    jsonb_build_object('verification_method','manual_reconciliation_from_snapshot_and_first_party_page','verified_at',v_verified_at),
    'schedule-field-reconciliation-v1') returning id into v_crpd_run;
  v_records:=0;

  for r in
    select e.id,e.slug,e.name,e.start_date,e.end_date,e.timezone,e.county,e.city,e.course_name,
      es.external_id,es.source_url,es.source_payload
    from public.lr_events e
    join public.lr_event_sources es on es.event_id=e.id and es.source_id=v_crpd
    where es.source_payload->>'recurrence'='first Saturday monthly'
      and nullif(es.source_payload->>'time_local','') is not null
    order by e.start_date,e.slug
  loop
    v_evidence:=jsonb_build_object(
      'timezone',jsonb_build_object('status','verified','source_key','crpd_rabbit_flats_direct','source_url',r.source_url,'verified_at',v_verified_at,
        'refresh_on_sync',false,'notes','Pacific timezone follows the first-party municipal program location.'),
      'start_time_local',jsonb_build_object('status','verified','source_key','crpd_rabbit_flats_direct','source_url',r.source_url,'verified_at',v_verified_at,
        'refresh_on_sync',false,'notes','Exact local start time from the first-party CRPD page.')
    );
    v_payload:=jsonb_build_object('name',r.name,'start_date',r.start_date,'end_date',r.end_date,'timezone','America/Los_Angeles',
      'county',r.county,'city',r.city,'course_name',r.course_name,'start_time_local',r.source_payload->>'time_local','format','Drop-In Program');
    v_evidence:=v_evidence||jsonb_build_object('format',jsonb_build_object(
      'status','verified','source_key','crpd_rabbit_flats_direct','source_url',r.source_url,'verified_at',v_verified_at,
      'refresh_on_sync',false,'notes','The program name is retained as format; the 10:00 AM time is stored separately.'
    ));
    v_payload:=v_payload||jsonb_build_object('field_evidence',v_evidence);
    insert into public.lr_source_candidates(source_run_id,source_id,external_id,source_url,normalized_payload)
    values(v_crpd_run,v_crpd,r.external_id,r.source_url,v_payload) returning id into v_candidate;
    select * into v_result from public.lr_process_candidate(v_candidate);
    if v_result.validation_status<>'valid' or v_result.match_event_id is distinct from r.id or v_result.match_method<>'source_external_id' then
      raise exception 'CRPD schedule reconciliation failed closed for %: validation %, match %, method %',r.slug,v_result.validation_status,v_result.match_event_id,v_result.match_method;
    end if;
    perform public.lr_apply_authoritative_candidate(v_candidate);
    v_records:=v_records+1;
  end loop;
  update public.lr_source_runs set records_seen=v_records,records_valid=v_records,metrics=metrics||jsonb_build_object('records_reconciled',v_records) where id=v_crpd_run;
end
$$;

commit;
