// Event-specific details below were manually verified from organizer-provided
// UDisc pages. Do not generalize these details to later weekly dates.
const VERIFIED_NOVEMBER_GLOW = Object.freeze({
  "2026-11-03": "https://udisc.com/events/hb-glow-doubles-tAP8Y5/about",
  "2026-11-10": "https://udisc.com/events/hb-glow-doubles-af85rU/about",
  "2026-11-17": "https://udisc.com/events/hb-glow-doubles-C1mFl8/about",
});

const COURSE_URL = "https://udisc.com/courses/huntington-beach-central-park-A9Fe";

function evidenceFor(fields, eventUrl) {
  return Object.fromEntries(fields.map((field) => [field, {
    status: "verified",
    source_key: "hbnf_udisc_manual",
    source_url: field === "course_url" ? COURSE_URL : eventUrl,
    refresh_on_sync: false,
  }]));
}

export function verifiedGlowFacts(date) {
  const evidenceUrl = VERIFIED_NOVEMBER_GLOW[date];
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
    ], evidenceUrl),
  };
}

export function knownNovemberGlowDates() {
  return Object.keys(VERIFIED_NOVEMBER_GLOW);
}
