BEGIN;

CREATE TABLE public.hbnf_udisc_glow_event_bindings (
  event_date date PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hbnf_udisc_glow_event_bindings_hbnf_glow_identity
    CHECK (event_id ~ '^(hb-glow-doubles-[A-Za-z0-9]{6}|hb-night-flyers-hb-glow-doubles(-[a-z0-9]+)*-[A-Za-z0-9]{6})$'),
  CONSTRAINT hbnf_udisc_glow_event_bindings_tuesday
    CHECK (EXTRACT(ISODOW FROM event_date) = 2),
  CONSTRAINT hbnf_udisc_glow_event_bindings_window_order
    CHECK (window_end > window_start),
  CONSTRAINT hbnf_udisc_glow_event_bindings_window_max
    CHECK (window_end - window_start <= interval '12 hours'),
  CONSTRAINT hbnf_udisc_glow_event_bindings_window_local_start
    CHECK ((window_start AT TIME ZONE 'America/Los_Angeles')::date = event_date),
  CONSTRAINT hbnf_udisc_glow_event_bindings_window_local_end
    CHECK ((window_end AT TIME ZONE 'America/Los_Angeles')::date = event_date)
);

ALTER TABLE public.hbnf_udisc_glow_event_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hbnf_udisc_glow_event_bindings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hbnf_udisc_glow_event_bindings TO service_role;
CREATE POLICY hbnf_udisc_glow_event_bindings_service_role_only
  ON public.hbnf_udisc_glow_event_bindings
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- The HBNF-hosted public UDisc event IDs are explicit, date-bound records.
-- These rows do not create Glow weeks or import scores. The existing worker
-- additionally requires the matching unlocked Glow active week and identity
-- resolution before making any UDisc request or score write.
INSERT INTO public.hbnf_udisc_glow_event_bindings (event_date, event_id, window_start, window_end) VALUES
  ('2026-11-03', 'hb-glow-doubles-tAP8Y5', '2026-11-03 17:30:00 America/Los_Angeles', '2026-11-03 23:30:00 America/Los_Angeles'),
  ('2026-11-10', 'hb-glow-doubles-af85rU', '2026-11-10 17:30:00 America/Los_Angeles', '2026-11-10 23:30:00 America/Los_Angeles'),
  ('2026-11-17', 'hb-glow-doubles-C1mFl8', '2026-11-17 17:30:00 America/Los_Angeles', '2026-11-17 23:30:00 America/Los_Angeles');

COMMIT;
