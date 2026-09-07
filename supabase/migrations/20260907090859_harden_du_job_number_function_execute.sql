revoke execute on function public.next_du_job_number() from public;
revoke execute on function public.next_du_job_number() from anon;
grant execute on function public.next_du_job_number() to authenticated;
grant execute on function public.next_du_job_number() to service_role;
