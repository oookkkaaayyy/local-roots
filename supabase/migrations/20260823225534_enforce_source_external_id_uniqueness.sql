-- A non-null external ID is a strong identity key within one source.
-- Enforce the matcher invariant so one source record cannot silently map to
-- multiple canonical events.

create unique index if not exists lr_event_sources_source_external_id_unique
  on public.lr_event_sources(source_id, external_id)
  where external_id is not null;
