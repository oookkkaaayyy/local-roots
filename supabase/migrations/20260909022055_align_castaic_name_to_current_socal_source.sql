update public.lr_events
set name = 'Castaic Open',
    last_verified_at = now()
where id = '08c00f37-e161-4141-9a61-c04ebbf00f92'
  and start_date = '2026-10-17';

update public.lr_event_sources
set last_seen_at = now(),
    last_fetched_at = now(),
    updated_at = now()
where id = 'e6ae85ac-1653-463e-b4ad-8a96cb6bbc13';

update public.lr_review_queue
set status = 'resolved',
    resolved_at = now(),
    resolution = 'Resolved from current permitted SoCal DGC detailed 2026 schedule: event is listed as Castaic Open on 2026-10-17 at Castaic Lake Seasonal Course. Prior Bridge to the Lake label is treated as stale historical/sidebar identity.'
where id = 'ac962f86-d36b-470f-a8aa-99d9f79e2c32'
  and status = 'open';
