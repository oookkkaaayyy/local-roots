revoke execute on function public.next_du_job_number() from authenticated;
revoke usage, select, update on sequence public.du_job_number_seq from authenticated;

grant execute on function public.next_du_job_number() to service_role;
grant usage, select, update on sequence public.du_job_number_seq to service_role;
