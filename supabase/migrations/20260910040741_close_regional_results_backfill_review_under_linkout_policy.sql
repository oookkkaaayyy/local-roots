update public.lr_review_queue
set status = 'resolved',
    resolved_at = now(),
    resolution = 'Closed under the adopted regional-results policy: retain exact official PDGA Results links as routing metadata only; do not import PDGA/Disc Golf Scene/UDisc result values or initiate licensing outreach unless the user explicitly reopens that path. Reopen only if independently permitted result evidence becomes available or the user changes the policy.'
where issue_type = 'results_backfill'
  and severity = 'low'
  and status = 'in_review';
