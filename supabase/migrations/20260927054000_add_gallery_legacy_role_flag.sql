alter table public.gallery_items
  add column if not exists legacy_roles_confirmed boolean not null default true;
