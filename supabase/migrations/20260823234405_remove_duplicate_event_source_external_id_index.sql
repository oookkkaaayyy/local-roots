-- The original lr_event_sources_external_id_unique_idx already enforces
-- uniqueness of (source_id, external_id) for non-null external IDs.
-- A later hardening migration added an identical second index; remove only
-- the redundant copy while preserving the original production constraint.
drop index if exists public.lr_event_sources_source_external_id_unique;
