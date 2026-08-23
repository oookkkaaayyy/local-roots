export type PublicResult = {
  division_code: string;
  place: number;
  player_name: string;
  pdga_number: number | null;
  total_score: number | null;
  to_par: number | null;
  points: number | null;
  rating: number | null;
  source_url: string;
  last_verified_at: string;
};

export type PublicEvent = {
  id: string;
  slug: string;
  name: string;
  start_date: string;
  end_date: string;
  timezone: string;
  county: string | null;
  city: string | null;
  venue_name: string | null;
  course_name: string | null;
  rounds_text: string | null;
  event_type: string;
  format: string | null;
  sanctioned: boolean | null;
  tier: string | null;
  status: string;
  registration_status: string | null;
  registration_url: string | null;
  results_url: string | null;
  club_host: string | null;
  td_names: string[];
  last_verified_at: string | null;
  last_changed_at: string;
  top_results: PublicResult[];
};

export type Submission = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  county: string | null;
  city: string | null;
  course_name: string | null;
  event_type: string;
  sanctioned: boolean | null;
  tier: string | null;
  registration_url: string | null;
  source_url: string | null;
  club_host: string | null;
  td_names: string[];
  submitter_name: string | null;
  submitter_email: string | null;
  notes: string | null;
  validation_status: string;
  validation_errors: string[];
  scope_status: string;
  status: string;
  candidate_id: string | null;
  matched_event_id: string | null;
  created_at: string;
};

export type ReviewItem = {
  id: string;
  issue_type: string;
  severity: string;
  event_id: string | null;
  source_candidate_id: string | null;
  summary: string;
  details: Record<string, unknown>;
  status: string;
  created_at: string;
};

export type SourceInfo = {
  id: string;
  key: string;
  name: string;
  source_type: string;
  enabled: boolean;
  refresh_schedule: string | null;
  expected_min_records: number | null;
  expected_max_records: number | null;
  updated_at: string;
};

export type SourceRun = {
  id: string;
  source_id: string;
  started_at: string;
  finished_at: string | null;
  fetch_status: string;
  parse_status: string;
  validation_status: string;
  health_status: string;
  records_seen: number;
  records_valid: number;
  records_new: number;
  records_changed: number;
  records_rejected: number;
  records_missing: number;
  error_code: string | null;
  error_message: string | null;
  metrics: Record<string, unknown>;
  parser_version: string | null;
};

export type AdminEvent = {
  id: string;
  slug: string;
  name: string;
  start_date: string;
  end_date: string;
  county: string | null;
  city: string | null;
  course_name: string | null;
  event_type: string;
  sanctioned: boolean | null;
  tier: string | null;
  status: string;
  published: boolean;
  last_verified_at: string | null;
  last_changed_at: string;
};

export type AdminDashboard = {
  admin: { user_id: string; display_name: string | null; role: string; active: boolean };
  submissions: Submission[];
  reviews: ReviewItem[];
  sources: SourceInfo[];
  runs: SourceRun[];
  events: AdminEvent[];
};
