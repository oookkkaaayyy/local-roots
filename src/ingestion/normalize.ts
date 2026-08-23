import { EVENT_STATUSES, EVENT_TYPES, LOCAL_ROOTS_COUNTIES, REGISTRATION_STATUSES } from "../domain/events.js";
import type { EventStatus, EventType, LocalRootsCounty, RegistrationStatus } from "../domain/events.js";
import type { NormalizedEventCandidate, RawEventRecord, SourceRole } from "./types.js";

const COUNTY_ALIASES: Record<string, LocalRootsCounty> = {
  ventura: "Ventura",
  "ventura county": "Ventura",
  "los angeles": "Los Angeles",
  "los angeles county": "Los Angeles",
  la: "Los Angeles",
  "l.a.": "Los Angeles",
  orange: "Orange",
  "orange county": "Orange",
  oc: "Orange",
  riverside: "Riverside",
  "riverside county": "Riverside",
  "san bernardino": "San Bernardino",
  "san bernardino county": "San Bernardino",
  "san diego": "San Diego",
  "san diego county": "San Diego",
  sd: "San Diego",
};

const EVENT_TYPE_ALIASES: Record<string, EventType> = {
  tournament: "tournament",
  flex: "flex_start",
  "flex start": "flex_start",
  flex_start: "flex_start",
  league: "league",
  doubles: "doubles",
  team: "team",
  putting: "putting",
  "ace race": "ace_race",
  ace_race: "ace_race",
  "circuit challenge": "circuit_challenge",
  circuit_challenge: "circuit_challenge",
  "tag match": "tag_match",
  tag_match: "tag_match",
  clinic: "clinic",
  charity: "charity",
  community: "community",
  other: "other",
};

const STATUS_ALIASES: Record<string, EventStatus> = {
  announced: "announced",
  upcoming: "upcoming",
  "registration open": "registration_open",
  registration_open: "registration_open",
  full: "full",
  waitlist: "waitlist",
  postponed: "postponed",
  "date changed": "date_changed",
  date_changed: "date_changed",
  cancelled: "canceled",
  canceled: "canceled",
  complete: "completed",
  completed: "completed",
};

const REGISTRATION_STATUS_ALIASES: Record<string, RegistrationStatus> = {
  unknown: "unknown",
  "not open": "not_open",
  not_open: "not_open",
  open: "open",
  waitlist: "waitlist",
  full: "full",
  closed: "closed",
  cancelled: "canceled",
  canceled: "canceled",
};

export function cleanText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length ? cleaned : null;
}

export function normalizeIdentityText(value: string | null | undefined): string {
  return (cleanText(value) ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCounty(value: string | null | undefined): LocalRootsCounty | string | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const alias = COUNTY_ALIASES[cleaned.toLowerCase()];
  if (alias) return alias;
  const exact = LOCAL_ROOTS_COUNTIES.find((county) => county.toLowerCase() === cleaned.toLowerCase());
  return exact ?? cleaned;
}

function normalizeEventType(value: string | null | undefined): EventType {
  const key = (cleanText(value) ?? "other").toLowerCase();
  return EVENT_TYPE_ALIASES[key] ?? (EVENT_TYPES.includes(key as EventType) ? (key as EventType) : "other");
}

function normalizeStatus(value: string | null | undefined): EventStatus {
  const key = (cleanText(value) ?? "upcoming").toLowerCase();
  return STATUS_ALIASES[key] ?? (EVENT_STATUSES.includes(key as EventStatus) ? (key as EventStatus) : "upcoming");
}

function normalizeRegistrationStatus(value: string | null | undefined): RegistrationStatus | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const key = cleaned.toLowerCase();
  return REGISTRATION_STATUS_ALIASES[key] ?? (REGISTRATION_STATUSES.includes(key as RegistrationStatus) ? (key as RegistrationStatus) : "unknown");
}

function normalizeSourceRole(value: SourceRole | null | undefined): SourceRole {
  return value ?? "discovery";
}

export function normalizeRawEvent(raw: RawEventRecord): NormalizedEventCandidate {
  const name = cleanText(raw.name) ?? "";
  const venueName = cleanText(raw.venueName);
  const startDate = cleanText(raw.startDate) ?? "";
  const endDate = cleanText(raw.endDate) ?? startDate;
  const confidence = Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, Number(raw.confidence))) : 0.5;

  return {
    externalId: cleanText(raw.externalId),
    name,
    normalizedName: normalizeIdentityText(name),
    startDate,
    endDate,
    county: normalizeCounty(raw.county),
    city: cleanText(raw.city),
    venueName,
    normalizedVenue: venueName ? normalizeIdentityText(venueName) : null,
    courseName: cleanText(raw.courseName),
    courseId: cleanText(raw.courseId),
    roundsText: cleanText(raw.roundsText),
    eventType: normalizeEventType(raw.eventType),
    format: cleanText(raw.format),
    sanctioned: typeof raw.sanctioned === "boolean" ? raw.sanctioned : null,
    sanctionBasis: cleanText(raw.sanctionBasis),
    tier: cleanText(raw.tier),
    status: normalizeStatus(raw.status),
    registrationStatus: normalizeRegistrationStatus(raw.registrationStatus),
    registrationUrl: cleanText(raw.registrationUrl),
    resultsUrl: cleanText(raw.resultsUrl),
    sourceUrl: cleanText(raw.sourceUrl) ?? "",
    clubHost: cleanText(raw.clubHost),
    organizer: cleanText(raw.organizer ?? raw.clubHost),
    tdNames: (raw.tdNames ?? []).map((name) => cleanText(name)).filter((name): name is string => Boolean(name)),
    sourceRole: normalizeSourceRole(raw.sourceRole),
    confidence,
  };
}
