revoke execute on function public.lr_is_http_url(text) from public, anon, authenticated;
grant execute on function public.lr_is_http_url(text) to service_role;

revoke execute on function public.touch_updated_at() from public, anon, authenticated;
grant execute on function public.touch_updated_at() to service_role;
