# Local Roots — Post-Handoff Verified State — 2026-08-25

This file is the newest GitHub continuity snapshot and supersedes older event counts/conflict lists in `docs/POST_HANDOFF_STATE_2026-08-24.md` where they differ. Live Supabase/Cloudflare state remains stronger authority if it advances later.

## Current production state
- 69 published real canonical events.
- 20 current/future events on the 2026-08-25 Pacific calendar date.
- 0 published events without provenance.
- 0 sanctioned published events without sanction-basis provenance.
- 0 stale current/future events under the 14-day freshness gate.
- 0 high/critical blocking reviews.
- Latest forced integrity snapshot: Cloudflare HTTP 200, `staging_ok=true`, 69 public events, no anomalies.
- HBNF remains the only authoritative scheduled production source. The 2026-08-25 05:00 Pacific run was healthy at 32/32, but `lr_launch_readiness()` still reports 1/5 during the current finalization window; that function remains the streak authority. Manual/test runs never count.

## Sapwi Trails conflict resolved
`Sapwi Trails Disc Golf Course Championships` is now published for Saturday, September 26, 2026 at Sapwi Trails Community Park / Sapwi in Thousand Oaks, Ventura County. It is marked sanctioned, with TD Seth Gregory; tier remains intentionally null and no third-party registration facts were promoted.

Permitted evidence hierarchy:
- The current detailed TD-supplied SoCal DGC 2026 schedule lists the event specifically as `9/26 (Sat)` at Sapwi, Thousand Oaks, sanctioned, TD Seth Gregory. The older SoCal sidebar/blog representation showing Sept. 26–27 is treated as stale rather than averaged with the current detailed event row.
- Conejo Recreation & Park District independently identifies Sapwi Trails Community Park as a disc-golf facility and separately identifies Conejo Disc Golf Club as its partner for disc golf at Sapwi Trails and Rabbit Flats.
- The official City of Thousand Oaks About page states that Thousand Oaks is in Ventura County.

New narrow manual-source identities:
- `crpd_sapwi_manual`: venue/course corroboration only.
- `city_thousand_oaks_manual`: city/county geography corroboration only.

Live migration: `20260825141033_publish_sapwi_trails_championships_from_current_permitted_sources`.
GitHub migration commit: `5d83aff8461cb9bbd33d554b021ad32e9672bf43`.
The prior Sapwi medium source-conflict review is resolved.

## Remaining conflict / population work
The remaining deliberate medium conflict is Fling XXIX tier. SoCal's permitted manual calendar says C-Tier, while restricted discovery sources currently represent it as B-Tier. The event remains published with `tier=null`; do not resolve that field from PDGA or Disc Golf Scene.

Continue aggressive no-contact population work from first-party/organizer/venue/club/public sources. PDGA, Disc Golf Scene and UDisc remain discovery-only and cannot supply production facts without independent permitted corroboration. Outreach remains deferred. Never weaken provenance, sanction-basis, freshness or review safeguards to increase count.
