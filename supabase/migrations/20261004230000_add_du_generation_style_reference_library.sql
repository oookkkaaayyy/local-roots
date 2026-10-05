-- Private, append-only house-style stencil references for Generation v2.
-- These references describe visual treatment only and are copied into each
-- immutable job package so every attempt gets the same style controls.
create table if not exists public.du_generation_style_references (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  filename text not null check (length(filename) between 1 and 160),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  sha256 text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer not null check (size_bytes between 1 and 8388608),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

alter table public.du_generation_style_references enable row level security;
revoke all on public.du_generation_style_references from anon, authenticated;
grant all on public.du_generation_style_references to service_role;

create or replace function public.du_generation_style_references_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'du_generation_style_references rows are append-only';
end $$;

create trigger du_generation_style_references_immutable
before update or delete on public.du_generation_style_references
for each row execute function public.du_generation_style_references_immutable();

-- Persist the human visual-quality gate with every newly selected master.
alter table public.du_generation_selections
  add column if not exists visual_review jsonb,
  add column if not exists reviewed_at timestamptz;

alter table public.du_generation_selections
  add constraint du_generation_selections_visual_review_required
  check (
    visual_review is null or (
      jsonb_typeof(visual_review) = 'object'
      and visual_review->>'composition_fidelity' = 'true'
      and visual_review->>'pet_identity' = 'true'
      and visual_review->>'style_match' = 'true'
      and visual_review->>'detail_and_crop' = 'true'
    )
  ) not valid;
