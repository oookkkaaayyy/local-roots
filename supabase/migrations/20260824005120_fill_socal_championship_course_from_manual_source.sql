-- Fill the currently known multi-course venue for the 2026 SoCal Amateur
-- Championships from the permitted SoCal DGC manual source and preserve an
-- explicit change-log record.

do $$
declare
  v_event_id uuid;
  v_source_id uuid;
  v_old text;
  v_new text := 'Brengle Terrace, Kit Carson, and TBD 3rd Course';
begin
  select id, course_name into v_event_id, v_old
  from public.lr_events
  where slug='2026-socal-championships-amateurs';

  select id into v_source_id
  from public.lr_sources
  where key='socal_dgc_manual_calendar';

  if v_event_id is null or v_source_id is null then
    raise exception 'Required Local Roots event/source not found';
  end if;

  if v_old is distinct from v_new then
    update public.lr_events
    set course_name=v_new,
        last_verified_at=current_timestamp,
        last_changed_at=current_timestamp,
        updated_at=current_timestamp
    where id=v_event_id;

    insert into public.lr_event_change_log(
      event_id,source_id,field_name,old_value,new_value,change_type
    ) values (
      v_event_id,v_source_id,'course_name',to_jsonb(v_old),to_jsonb(v_new),'source_update'
    );
  end if;

  update public.lr_event_sources
  set last_seen_at=current_timestamp,
      last_fetched_at=current_timestamp,
      updated_at=current_timestamp
  where event_id=v_event_id and source_id=v_source_id;
end $$;
