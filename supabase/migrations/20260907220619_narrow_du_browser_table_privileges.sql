revoke select, insert, update, delete on table public.admin_users from anon;
revoke insert, update, delete on table public.admin_users from authenticated;

revoke select, insert, update, delete on table public.draft_options from anon;
revoke select, insert, update, delete on table public.job_files from anon, authenticated;
revoke select, insert, update, delete on table public.job_photos from anon;
revoke select, insert, update, delete on table public.jobs from anon;
revoke select, insert, update, delete on table public.production_checklist from anon;

revoke insert, update, delete on table public.gallery_items from anon;
