create index if not exists lr_source_candidates_source_id_idx
  on public.lr_source_candidates(source_id);

create index if not exists lr_results_source_id_idx
  on public.lr_results(source_id);

create index if not exists lr_review_queue_event_id_idx
  on public.lr_review_queue(event_id);

create index if not exists lr_review_queue_candidate_id_idx
  on public.lr_review_queue(source_candidate_id);

create index if not exists lr_manual_overrides_created_by_idx
  on public.lr_manual_overrides(created_by);
