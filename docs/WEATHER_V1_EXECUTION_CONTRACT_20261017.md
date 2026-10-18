# Local Roots Disc Golf Weather — V1 controlled execution contract (2026-10-17)

**Status: RESEARCH/ARCHITECTURE GATE — NOT IMPLEMENTATION APPROVAL.** This is one compact operating specification for the existing feature branch, not a new governance layer. Product release and production merge are prohibited until the gates below pass and the owner accepts an actual iPhone preview.

**Source identity:** `oookkkaaayyy/local-roots`, branch `feature/disc-golf-weather-v1`; last pre-audit feature code `9b2009abfbe118cf32b4abc85329e89da63bb398`. PR #99 is a separate LR×HBNF design/docs workstream: do not alter it. This document and `docs/weather_course_census_seed_20261017.csv` add **documentation only**; no runtime deploy.

## 1. Cause of failure — prevent recurrence by acceptance tests, not more coordinating layers

The initial Weather preview returned just **5 verified 18+ hole courses across 150 miles** (4 within 80 mi). Its source tests passed but coverage was never checked against available historical evidence: the user's earlier, selectively scoped **25-public-course lead list within 80 mi**, now recovered verbatim into `docs/weather_course_census_seed_20261017.csv`. The original PDF is research, **not** 25 proven current open courses. A second source-level defect is fan-out: current `getWeatherResponse()` retrieves one /points, forecast/hourly, raw grid and active-alert query per distinct course/grid group, then uses up to two cache.put and cache.match operations per source call, in a single Cloudflare Function invocation. This cannot be assumed to scale on the free plan.

The fix is TWO bounded prebuild qualifications — (A) a reproducible geographic census, (B) a measured resource-safe data pathway — then narrowly adapt the existing app. No blank redesign, DB, new worker, parallel agent, speculative refactor, or paid service.

## 2. Immutable product contract / accepted user intent

- Home: `localrootsdg.com/weather`, same Local Roots site, independent when the Supabase-controlled routes fail, Safari share and Add to Home Screen; no account.
- Scope: public, currently playable **disc-golf** courses with 18+ distinct permanent holes/valid 18-hole disc layout, including 19/24/27 holes. Exclude courses on ball-golf facilities, college campuses, private-only access, temporary layouts, and genuinely closed courses. Distinguish a separately located disc-golf facility from ball golf inside the *same park*: do not discard La Mirada Lakeside/Backside, Whittier Narrows disc course or El Dorado disc course because separate ball golf also exists nearby.
- Geography: default ZIP 92648, 80-mile straight-line radius; adjustable to 150 mi; calculate using course coordinates and the resolved ZIP centroid, not driving distance. Record 92648 reference centroid and geocoder offset in fixtures.
- Forecast: default today, 8 AM–4 PM Pacific, user-adjustable date (NWS approximately next 7 days), playing-hours window and All Day. Summary shows min/max **temperature**, min/max **sustained wind**, **peak gust**, conditions/hazard indicator; hourly disclosure includes timestamp, temp, wind range/direction, gust, probability of precipitation, text conditions.
- Weather flags (NWS forecasts vs separately identified OFFICIAL active alerts) remain distinct. Unknown/unavailable != zero; temporal labels clear. Only forecast-window-overlapping samples contribute.
- Compact, readable iPhone 390px, no page overflow, preserved Local Roots visual language and existing production routes.

## 3. Gate A — versioned and independently reconciled course census FIRST

**Input A1:** all 25 lead records in `docs/weather_course_census_seed_20261017.csv`, recovered from the prior user-facing PDF. Do not silently discard a lead. Record for each: stable course/layout ID, name, coordinate and geolocation source, hole/layout verification, access/private/college/ball-golf classification, open/seasonal/closure information with last checked date, operator or authoritative source URL, status (INCLUDE / EXCLUDE / UNRESOLVED), one-line decision reason. Seasonal access is time-sensitive, not permanent open status. A separately operated 18-hole layout should be a separate row only where genuinely distinct.

**Input A2 — ONE-TIME 150-mi discovery sweep:** Use a bounded legally permissible geographic discovery method based on OSM disc-golf mapping and municipality/operator references; no full 640MB PBF required, no live directory connection, no recurring scraping or audits. Deduplicate OSM node/way/relation representations, normalize course aliases, and inspect likely 18+ layouts where tags/hole counts are missing. Cross-check all geographic sectors, including LA/Orange, Inland Empire/High Desert, Ventura/Ojai, San Diego/North County, mountains, and the outer 80–150-mi band. A PDGA/UDisc page may help a human discover a lead, but do not bulk extract or republish proprietary database records without applicable permissions.

**Input A3 — source verification:** Confirm each likely inclusion using owner/park/city/county official pages, permissioned community/operator information, and independently attributable public mapping. Two separately operated La Mirada 18-hole courses are explicitly documented on https://discoverlamirada.com/legendary-disc-golf/ . Pasadena officially documents Oak Grove/Hahamongna as 24 holes: https://www.cityofpasadena.net/parks-and-rec/parks/hahamongna-watershed-park/ . Casitas water district documents Coyote Point 18-hole/year-round: https://www.casitaswater.gov/disc-golf . Public PDGA directory https://www.pdga.com/course-directory/locations exists for manual cross-checks; no assumption of API/redistribution rights.

**Output A:** one STATIC machine-readable `app/src/data/weather-courses.json` containing course name/location/hole-count/access, brief dated source references and eligibility. A lightweight one-time `docs/weather_course_census_reconciliation.csv` records 25 seed candidates, substantial additional discoveries and material exclusions, not an ongoing maintenance database. Every A1 lead must be resolved, or the release stays blocked. Every discovered A2 likely qualifying candidate must be resolved (inclusion, sourced exclusion, or explicit owner-visible incomplete coverage); absent proof of access/hole count must never become a positive verification. Publish precise counts for 0–50, 0–80, and 0–150 mi from the same centroid. Do not set an arbitrary course-count quota or falsely claim geographical completeness; pass when the defined multi-source sweep and all discrepancy reviews are complete, with unresolved gaps disclosed. Test seed rows to ensure no silent omissions.

OSM license obligations: https://www.openstreetmap.org/copyright and https://osmfoundation.org/wiki/Licence_and_Legal_FAQ . If OSM contributes to a published derived dataset, add appropriate attribution and satisfy ODbL sharing duties; keep provenance. The app runtime should use a versioned LOCAL dataset, not Overpass requests.

## 4. Gate B — fixed free-tier weather architecture, measured before code changes

**Primary sources:** NOAA/NWS https://www.weather.gov/documentation/services-web-API ; `/points/{lat},{lon}` -> hourly forecast, raw grid (gusts) and relevant forecast zone; `/alerts/active` for currently active official hazards. NWS explicitly provides no published numeric rate limit and notes that proxies more often hit limits. Forecasts cover ~7 days and grids are ~2.5km; grid mapping may change, so cache/recheck it periodically.

**Cloudflare restrictions:** https://developers.cloudflare.com/workers/platform/limits/ documents Workers Free 50 external subrequests per invocation, 50 Cache API calls/invocation, 6 simultaneous outgoing connections, 10ms CPU and 100,000 Worker requests/day. Cache API `caches.default` is local to a data center rather than globally shared (https://developers.cloudflare.com/workers/reference/how-the-cache-works/). Static assets are free when `_routes.json` limits Pages Functions to `/api/*`: https://developers.cloudflare.com/pages/functions/routing/ .

**Prescribed bounded pathway:**
1. Keep all course/radius filtering client-side against the static directory. API accepts allowlisted course IDs, **not arbitrary URLs**, maximum **two course IDs per call**. Do not trigger forecast requests for the full 150-mile inventory in one invocation.
2. Resolve /points and deduplicate known forecast grid URLs within each invocation; cache /points mapping roughly daily, hourly+grid roughly 15 min and active alerts roughly 5 min, respecting source HTTP caching where possible.
3. Replace dual fresh/stale cache objects with one bounded cache entry per upstream URL containing `fetchedAt` and fresh age; allow last-good/stale recovery within a documented grace window. A normal cold-case 2-course request has at most 8 distinct NWS HTTP fetches, ~8 cache matches and ~8 puts; budget retries/redirects and instrument actual counts before release. Do not allow unbounded retries.
4. Client loads forecasts progressively in bounded batches (max 2 course IDs/request, max 2 concurrent API calls), cancel obsolete requests on ZIP/radius change, avoid duplicate requests for the same course/date, and display loaded/pending/error counts. **Do not silently suppress weather for courses beyond the first page**. If a user requests sorting by weather, either finish loading all in-range courses before applying a global ranking or explicitly show sort is provisional during loading.
5. Only fetch current active alerts for overlaps with the selected window. The absence of an official alert for a far-future date is **not** evidence there will be no future hazard; keep predictive rain/wind/heat flags separate. Present alert scope and expiration clearly.
6. Handle 429/503/timeout with at most one bounded retry following Retry-After/backoff; then report stale or unavailable, never invented values. Persist ZIP center along with last-good weather metadata so geocoder failure cannot blank an otherwise recoverable saved forecast. Do not persist huge 7-day JSON payloads into Safari localStorage; measure payload/cache size and use bounded IndexedDB/Cache Storage if needed.
7. `_routes.json` retains API-only invocation. No Supabase or Cloudflare D1/KV dependency for V1. Weather remains usable if LR's Supabase environment is down.

**Output B:** a fixture-based **cold cache, warm cache, simulated 429/timeout, 5/25/60/120-candidate** matrix, reporting max outgoing HTTP calls, Cache API calls, CPU time, UI time to first useful course, full-load duration, and any rate-limit responses. The target 120 is a synthetic load test, NOT a factual count of nearby qualifying courses. The design cannot pass by merely mocking a healthy NWS response; complete a few real NWS production-like preview calls and compare source field units with app values. No actual application request may exceed provider/free caps. No cost migration.

## 5. Gate C — targeted implementation ONLY after A and B qualified

Reuse existing `WeatherPage.tsx`, `weatherCore.js`, `weatherUpstream.js`, Cloudflare routes, and styling. Change only what A/B evidence requires. Preserve functioning date/time/DST, NWS peak gust, alerts, sorting and expansion. Mark **partial forecast-window coverage on collapsed rows**, not just in the expanded section. Verify NWS day-boundary and DST cases. Never claim all-day observed high/low when data are forecasts or partially covered.

Existing Local Roots Supabase gate must remain lazy-loaded behind the independent Weather route; preserve CSP, service worker and Home Screen manifest behavior. Keep the existing approved production site and PR #99 untouched.

## 6. Gate D — release acceptance, not just unit tests

Provide proof table with: exact branch SHA, census reconciliation with counts by radius; cold/warm/failure resource counters; NWS fixtures and real API smoke; iPhone 390px visual and expandable detail; installed Home Screen launch to /weather; several supported ZIPs including 92648 plus another 150-mi sector; 7-day and past-date restrictions; timezone/DST; 18 vs 9-hole exclusions and La Mirada two-layout inclusion; official-vs-forecast warning timing; browser fallback during simulated Supabase failure; old LR site route/regression suite green; production-free cost guard. A source/test PASS is not user acceptance. Obtain owner preview approval before merge/deploy.

## 7. Execution protocol: one worker, finite passes

**Current state:** NO GO. Do not send another open-ended "fix coverage" prompt.

- First prepare and externally substantiate Gate A (census) and Gate B (resource plan). **No implementation edits until both evidence gates are satisfied.** If a candidate is unverifiable or provider terms conflict, mark it as an explicit bounded blocker instead of making up a positive answer.
- Next one worker follows Gate C mechanistically, using preserved feature branch, with Gate D automated/browser acceptance. No parallel worker and no new coordination documents.
- One review of the qualified preview by owner; then separately approve production. If A or B fails, halt **that gate** and report the exact item and viable bounded fallback, rather than triggering broad redevelopment.

No engineering plan can guarantee third-party services never fail; these checks are designed to make foreseeable operational limits explicit and fallback behavior deterministic.

## Reference list (original primary docs)

1. NWS API: https://www.weather.gov/documentation/services-web-API
2. NWS alerts: https://www.weather.gov/documentation/services-web-alerts
3. Cloudflare Worker limits: https://developers.cloudflare.com/workers/platform/limits/
4. Cloudflare Cache API locality: https://developers.cloudflare.com/workers/reference/how-the-cache-works/
5. Cloudflare Pages Function routing: https://developers.cloudflare.com/pages/functions/routing/
6. OSM disc-golf schema: https://wiki.openstreetmap.org/wiki/Tag:leisure%3Ddisc_golf_course
7. Geofabrik Southern California extract: https://download.geofabrik.de/north-america/us/california/socal.html
8. OSM license FAQ: https://osmfoundation.org/wiki/Licence_and_Legal_FAQ
9. Public Overpass use: https://wiki.openstreetmap.org/wiki/Overpass_API
10. Operator verification examples: https://discoverlamirada.com/legendary-disc-golf/ and https://www.casitaswater.gov/disc-golf


## 8. Names-first discovery; static once (owner correction 2026-10-18)

**Do not turn finding course names into a mapping, licensing, or research-engineering project.** Course names and the existence of public parks are ordinary factual information. For the ONE-TIME snapshot, start with the 25 original leads and public UDisc course pages / city listings to identify additional course names and 18+ hole status. UDisc is a convenient, current **reference**, not a runtime dependency; no ongoing calls or automated scraping. Do not reuse UDisc reviews, maps, descriptions, photos, routing data or its full compiled directory verbatim. Separately locate the named parks/courses on ordinary public maps to obtain geographic points needed to request NWS weather. Use focused checks only for ball-golf-hosted, college, private, seasonal, unavailable, and borderline layouts.

**Current names-first progress:** `docs/weather_course_names_firstpass_20261018.csv` has 32 candidate names, combining the prior 25 names and 7 more publicly discoverable examples. This is **NOT** an exhaustive 150-mile course roster, a proof of access or within-radius count, or approval to deploy. Complete the human-readable names list first; THEN add coordinates and wire into the existing app. Do not download 640 MB, build a continuous OSM feed, demand research-grade provenance per ordinary public park, create an elaborate source registry, or defer progress because one network interface cannot reach UDisc.

**Acceptance:** useful exhaustive-for-purpose static names list across the 150-mile circle, reconcile known obvious omissions, flag genuine exclusions, and require only rare narrow source-file edits later. No recurring audit schedule; NOAA weather data refreshes independently. Since Codex workspace lacks reliable external browsing, public web research or user-provided screenshots of the already-filtered UDisc results can supply plain course-name leads; Codex then mechanically geocodes/checks eligibility and connects existing forecast code.
