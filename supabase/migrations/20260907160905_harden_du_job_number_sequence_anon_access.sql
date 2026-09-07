revoke all privileges on sequence public.du_job_number_seq from public;
revoke usage, select, update on sequence public.du_job_number_seq from anon;
grant usage, select, update on sequence public.du_job_number_seq to authenticated;
grant usage, select, update on sequence public.du_job_number_seq to service_role;
