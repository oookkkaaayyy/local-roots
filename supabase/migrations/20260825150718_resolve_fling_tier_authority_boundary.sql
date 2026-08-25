update public.lr_review_queue q
set status='resolved',
    resolved_at=current_timestamp,
    resolution='Resolved by source-authority boundary: canonical tier remains null. The permitted SoCal manual source does not authorize tier as an authoritative field, and Disc Golf Scene is discovery-only and cannot supply production facts. No unresolved production decision remains unless a stronger permitted source later establishes tier.'
where q.issue_type='source_conflict'
  and q.status in ('open','in_review')
  and q.event_id in (
    select e.id from public.lr_events e where e.name='The Fling XXIX at Chavez Ridge'
  );
