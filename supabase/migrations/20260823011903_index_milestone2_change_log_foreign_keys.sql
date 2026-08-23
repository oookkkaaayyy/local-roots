-- Milestone 2 advisor cleanup: cover foreign keys on event change-log provenance.
create index if not exists lr_event_change_log_source_id_idx
  on public.lr_event_change_log(source_id);

create index if not exists lr_event_change_log_source_candidate_id_idx
  on public.lr_event_change_log(source_candidate_id);
