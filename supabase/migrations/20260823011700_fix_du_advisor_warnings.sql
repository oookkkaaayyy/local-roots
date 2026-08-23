-- Narrow cleanup of pre-existing D&U Supabase advisor findings.
-- No Local Roots event-domain behavior is changed here.

create index if not exists gallery_items_job_id_idx on public.gallery_items(job_id);
create index if not exists job_photos_job_id_idx on public.job_photos(job_id);

drop policy if exists "service role full access job_files" on public.job_files;
create policy "service role full access job_files"
on public.job_files
for all
to public
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

drop policy if exists gallery_items_admin_all on public.gallery_items;
drop policy if exists gallery_items_public_select on public.gallery_items;

create policy gallery_items_anon_select
on public.gallery_items
for select
to anon
using (is_published = true);

create policy gallery_items_authenticated_select
on public.gallery_items
for select
to authenticated
using (is_published = true or public.is_du_admin());

create policy gallery_items_admin_insert
on public.gallery_items
for insert
to authenticated
with check (public.is_du_admin());

create policy gallery_items_admin_update
on public.gallery_items
for update
to authenticated
using (public.is_du_admin())
with check (public.is_du_admin());

create policy gallery_items_admin_delete
on public.gallery_items
for delete
to authenticated
using (public.is_du_admin());
