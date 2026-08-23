-- Repair caught by rollback-only Milestone 2 fixtures: normalize both candidate and configured county values.
create or replace function public.lr_candidate_scope_status(p_payload jsonb)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  profile public.lr_scope_profiles%rowtype;
  county_norm text;
  c text;
begin
  select * into profile from public.lr_scope_profiles where active order by updated_at desc limit 1;
  if profile.id is null then return 'out_of_scope'; end if;

  county_norm := public.lr_normalize_county(p_payload->>'county');
  if county_norm is not null then
    foreach c in array profile.allowed_counties loop
      if public.lr_normalize_county(c) = county_norm then return 'in_scope'; end if;
    end loop;
  end if;

  if nullif(btrim(p_payload->>'course_name'),'') is not null then
    foreach c in array profile.allowed_course_names loop
      if public.lr_normalize_match_text(c) = public.lr_normalize_match_text(p_payload->>'course_name') then return 'exception'; end if;
    end loop;
  end if;

  if nullif(btrim(p_payload->>'city'),'') is not null then
    foreach c in array profile.allowed_cities loop
      if public.lr_normalize_match_text(c) = public.lr_normalize_match_text(p_payload->>'city') then return 'exception'; end if;
    end loop;
  end if;

  return 'out_of_scope';
end;
$$;
