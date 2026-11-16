CREATE TEMP TABLE lr_review_occurrences (
  slug text PRIMARY KEY,
  name text NOT NULL,
  start_date date NOT NULL,
  county text NOT NULL,
  city text NOT NULL,
  course_name text NOT NULL,
  event_type text NOT NULL,
  source_key text NOT NULL CHECK (source_key = 'udisc_organizer_listings'),
  external_id text NOT NULL,
  source_url text NOT NULL CHECK (source_url ~ '^https://udisc\.com/leagues/[^/]+/schedule$'),
  UNIQUE (source_key, external_id)
) ON COMMIT DROP;
