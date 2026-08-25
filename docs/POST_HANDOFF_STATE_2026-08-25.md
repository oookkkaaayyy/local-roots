# Local Roots — Post-Handoff Verified State — 2026-08-25

This file is the newest GitHub continuity snapshot and supersedes older event counts/conflict lists in `docs/POST_HANDOFF_STATE_2026-08-24.md` where they differ. Live Supabase/Cloudflare state remains stronger authority if it advances later.

## Current production state
- 69 published real canonical events.
- 20 current/future events on the 2026-08-25 Pacific calendar date.
- 0 published events without provenance.
- 0 sanctioned published events without sanction-basis provenance.
- 0 stale current/future events under the 14-day freshness gate.
- 0 open reviews of any severity.
- Latest forced integrity snapshot: Cloudflare HTTP 200, `staging_ok=true`, 69 public events, no anomalies.
- HBNF remains the only authoritative scheduled production source. The 2026-08-25 05:00 Pacific run finalized healthy at 32/32 and `lr_launch_readiness()` now reports **2/5** consecutive healthy real scheduled production days. Manual/test runs never count.

## Sapwi Trails conflict resolved
`Sapwi Trails Disc Golf Course Championships` is published for Saturday, September 26, 2026 at Sapwi Trails Community Park / Sapwi in Thousand Oaks, Ventura County. It is marked sanctioned, with TD Seth Gregory; tier remains intentionally null and no third-party registration facts were promoted.

Permitted evidence hierarchy:
- The current detailed TD-supplied SoCal DGC 2026 schedule lists the event specifically as `9/26 (Sat)` at Sapwi, Thousand Oaks, sanctioned, TD Seth Gregory. The older SoCal sidebar/blog representation showing Sept. 26–27 is treated as stale rather than averaged with the current detailed event row.
- Conejo Recreation & Park District independently identifies Sapwi Trails Community Park as a disc-golf facility and separately identifies Conejo Disc Golf Club as its partner for disc golf at Sapwi Trails and Rabbit Flats.
- The official City of Thousand Oaks About page states that Thousand Oaks is in Ventura County.

New narrow manual-source identities:
- `crpd_sapwi_manual`: venue/course corroboration only.
- `city_thousand_oaks_manual`: city/county geography corroboration only.

Live migration: `20260825141033_publish_sapwi_trails_championships_from_current_permitted_sources`.
GitHub migration commit: `5d83aff8461cb9bbd33d554b021ad32e9672bf43`.

## Fling tier review resolved by authority boundary
`The Fling XXIX at Chavez Ridge` remains public with `tier=null`. The permitted SoCal manual calendar does not authorize `tier` as an authoritative field, while the conflicting Disc Golf Scene value is discovery-only and cannot provide a production fact. Therefore there is no remaining canonical decision to make under the current source contract; a later stronger permitted source may still establish tier.

Live migration: `20260825150718_resolve_fling_tier_authority_boundary`.
GitHub migration commit: `ef74f65ef1a7f11e8d5c52fd2776e7c7da6bcd04`.
All open review items are now cleared.

## Population work
Continue aggressive no-contact population work from first-party/organizer/venue/club/public sources. Current discovery leads remain useful but cannot be promoted merely from PDGA, Disc Golf Scene or UDisc. Ventura Race for the Ace / Coyote Classic, San Diego-area leads and Mountain Pride remain priority corroboration targets; current searches have not yet produced enough independent permitted event-level evidence to publish them safely.

PDGA, Disc Golf Scene and UDisc remain discovery-only and cannot supply production facts without independent permitted corroboration. Outreach remains deferred. Never weaken provenance, sanction-basis, freshness or review safeguards to increase count.
