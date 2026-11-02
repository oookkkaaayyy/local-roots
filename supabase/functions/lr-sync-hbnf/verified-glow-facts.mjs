// Event-specific details below were manually verified from organizer-provided
// UDisc pages. Do not generalize these details to later weekly dates.
const VERIFIED_NOVEMBER_GLOW = Object.freeze({
  "2026-11-03": "https://udisc.com/events/hb-glow-doubles-tAP8Y5/about",
  "2026-11-10": "https://udisc.com/events/hb-glow-doubles-af85rU/about",
  "2026-11-17": "https://udisc.com/events/hb-glow-doubles-C1mFl8/about",
});

// The organizer-managed UDisc league schedule exposes these occurrence pages.
// Their public listing states the occurrence time, course, doubles format,
// individual sign-up, and the $10 breakdown. Keep each occurrence URL explicit
// so the sync never manufactures event links from a pattern.
const VERIFIED_FUTURE_GLOW = Object.freeze({
  "2026-11-24": "https://udisc.com/events/hb-glow-doubles-wHLqmp/about",
  "2026-12-01": "https://udisc.com/events/hb-glow-doubles-1ff5RM/about",
  "2026-12-08": "https://udisc.com/events/hb-glow-doubles-Jxxe98/about",
  "2026-12-15": "https://udisc.com/events/hb-glow-doubles-ZhDgeK/about",
  "2026-12-22": "https://udisc.com/events/hb-glow-doubles-fFa7Lz/about",
});

// The earlier issue's permission record limited the first implementation to
// three listings. These five new organizer-managed pages were independently
// opened and checked on 2026-11-02; keep their evidence date separate.
const FUTURE_VERIFIED_AT = "2026-11-02T06:55:00Z";

const COURSE_URL = "https://udisc.com/courses/huntington-beach-central-park-A9Fe";
// Issue #161 records the independent verification of these organizer listings.
// Use that dated evidence boundary so a later sync cannot renew manual facts.
const VERIFIED_AT = "2026-11-01T03:25:36Z";

function evidenceFor(fields, eventUrl, verifiedAt, notes) {
  return Object.fromEntries(fields.map((field) => [field, {
    status: "verified",
    source_key: "hbnf_udisc_manual",
    source_url: field === "course_url" ? COURSE_URL : eventUrl,
    verified_at: verifiedAt,
    refresh_on_sync: false,
    notes,
  }]));
}

export function verifiedGlowFacts(date) {
  const evidenceUrl = VERIFIED_NOVEMBER_GLOW[date] ?? VERIFIED_FUTURE_GLOW[date];
  if (!evidenceUrl) {
    return {
      name: "HB Night Flyers Glow",
      event_type: "league",
      county: "Orange",
      club_host: "HB Night Flyers",
    };
  }

  return {
    name: "HB Night Flyers Glow Doubles",
    event_type: "doubles",
    format: "Doubles",
    format_details: { registration_mode: "Individual" },
    county: "Orange",
    city: "Huntington Beach",
    course_name: "Huntington Beach Central Park Disc Golf Course",
    course_id: "A9Fe",
    course_url: COURSE_URL,
    start_time_local: "17:30",
    end_time_local: "21:00",
    timezone: "America/Los_Angeles",
    entry_fee_amount: 10,
    entry_fee_currency: "USD",
    entry_fee_unit: "person",
    fee_breakdown: [
      { label: "Play", amount: 7, currency: "USD" },
      { label: "Ace contribution", amount: 3, currency: "USD" },
    ],
    additional_fees_note: "Standard course fee payable separately; amount not specified.",
    official_url: evidenceUrl,
    field_evidence: evidenceFor([
      "name", "event_type", "format", "format_details", "county", "city", "course_name", "course_id", "course_url",
      "start_time_local", "end_time_local", "timezone", "entry_fee_amount", "entry_fee_currency",
    "entry_fee_unit", "fee_breakdown", "additional_fees_note", "official_url",
    ], evidenceUrl, VERIFIED_NOVEMBER_GLOW[date] ? VERIFIED_AT : FUTURE_VERIFIED_AT,
      VERIFIED_NOVEMBER_GLOW[date]
        ? "Individually verified organizer listing documented in issue #161; sync does not refresh this manual evidence."
        : "Individually verified organizer-managed UDisc event page on 2026-11-02; sync does not refresh this manual evidence."),
  };
}

export function knownNovemberGlowDates() {
  return Object.keys(VERIFIED_NOVEMBER_GLOW);
}

export function knownVerifiedGlowDates() {
  return [...Object.keys(VERIFIED_NOVEMBER_GLOW), ...Object.keys(VERIFIED_FUTURE_GLOW)];
}
