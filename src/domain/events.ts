export const LOCAL_ROOTS_COUNTIES = [
  "Ventura",
  "Los Angeles",
  "Orange",
  "Riverside",
  "San Bernardino",
  "San Diego",
] as const;

export type LocalRootsCounty = (typeof LOCAL_ROOTS_COUNTIES)[number];

export const EVENT_TYPES = [
  "tournament",
  "flex_start",
  "league",
  "doubles",
  "team",
  "putting",
  "ace_race",
  "circuit_challenge",
  "tag_match",
  "clinic",
  "charity",
  "community",
  "other",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_STATUSES = [
  "announced",
  "upcoming",
  "registration_open",
  "full",
  "waitlist",
  "postponed",
  "date_changed",
  "canceled",
  "completed",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export const REGISTRATION_STATUSES = [
  "unknown",
  "not_open",
  "open",
  "waitlist",
  "full",
  "closed",
  "canceled",
] as const;

export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export interface PublicEventResult {
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
}

export interface PublicLocalRootsEvent {
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
  event_type: EventType;
  format: string | null;
  sanctioned: boolean | null;
  tier: string | null;
  status: EventStatus;
  registration_status: RegistrationStatus | null;
  registration_url: string | null;
  results_url: string | null;
  club_host: string | null;
  td_names: string[];
  last_verified_at: string;
  last_changed_at: string;
  top_results: PublicEventResult[];
}

export type EventOverrideField =
  | "name"
  | "start_date"
  | "end_date"
  | "county"
  | "city"
  | "venue_name"
  | "course_name"
  | "rounds_text"
  | "event_type"
  | "format"
  | "sanctioned"
  | "tier"
  | "status"
  | "registration_status"
  | "registration_url"
  | "results_url"
  | "club_host"
  | "td_names";

export interface LocalRootsEventPatch {
  name?: string;
  start_date?: string;
  end_date?: string;
  county?: string | null;
  city?: string | null;
  venue_name?: string | null;
  course_name?: string | null;
  rounds_text?: string | null;
  event_type?: EventType;
  format?: string | null;
  sanctioned?: boolean | null;
  tier?: string | null;
  status?: EventStatus;
  registration_status?: RegistrationStatus | null;
  registration_url?: string | null;
  results_url?: string | null;
  club_host?: string | null;
  td_names?: string[];
  confidence?: number | null;
  last_verified_at?: string | null;
}
