-- Cover the lr_source_discovery_items.review_id foreign-key/review lookup.
create index if not exists lr_source_discovery_items_review_id_idx
  on public.lr_source_discovery_items(review_id);
