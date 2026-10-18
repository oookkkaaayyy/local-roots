# Disc Golf Weather — recovered 80-mile course leads and release coverage gate

**Prepared:** 2026-10-17 PDT, for feature branch `feature/disc-golf-weather-v1`.  
**Authority:** source *leads*, NOT automatically admitted production course records.  
**Earlier artifact recovered:** user Library `disc_golf_forecast_80_miles_oct17_2026.pdf`, generated 2026-10-17 from data/forecasts checked 2026-10-16 (Library file `libfile_af1911f1152c81918006af5dd507d975`); corroborating single-page `disc_golf_phone_high_low_oct17_2026.pdf` (`libfile_220dd062256c8191875a91237eb7d054`). The documents describe public park/dedicated layouts within ~80 **straight-line** miles of 92648 and separately identify two private-only sites. Course statuses, installed holes, fees, and current availability in the October 16 report are HISTORICAL/PROVISIONAL, **not confirmed current directory facts**.

## Provenance and exact candidate checklist
The original 80-mile research had the following **25 public-course leads**, not five. Each requires current independent verification before committing new `weather-courses.json` entries. Keep separate records for genuinely different 18-hole layouts such as La Mirada Front vs Back.

| # | Earlier source listing | Earlier area | Current feature-directory status |
| --- | --- | --- | --- |
| 1 | Sky High at Mountain High North | Wrightwood area | Not yet in starter set; check seasonal operation/installed baskets |
| 2 | Mojave Narrows Regional Park | Victorville | Not yet; confirm paid public 18-hole course |
| 3 | Yucaipa Regional Park | Yucaipa | Not yet; confirm currently playable distinct 18+ hole layout |
| 4 | THE LEVEE | Lake Elsinore | Not yet; validate official name, course access/holes |
| 5 | Mountain Pride | Murrieta | Not yet; validate current course access/holes |
| 6 | Huntington Beach Central Park | Huntington Beach | Existing in starter set |
| 7 | Glen Helen Regional Park | San Bernardino | Not yet; confirm paid public 18-hole course |
| 8 | Kit Carson Park | Escondido | Not yet; verify 18+ playable layout |
| 9 | Oak Grove / Hahamongna Park | Pasadena / La Cañada area | Existing in starter set (`oak-grove-hahamongna`) |
| 10 | Martha McLean Anza-Narrows | Riverside | Not yet; verify installed 18+ holes |
| 11 | El Dorado Park | Long Beach | Not yet; high-priority close-to-center |
| 12 | Prado Regional Park | Chino | Existing in starter set |
| 13 | Brengle Terrace Park | Vista | Not yet; independently corroborated 20-hole public park |
| 14 | Central Park DGC | Santa Clarita | Existing in starter set (`santa-clarita-central-park`) |
| 15 | Castaic Lake South | Castaic | Not yet; seasonal layout, verify active baskets/access |
| 16 | Castaic Lake North | Castaic | Not yet; confirm whether permanent public layout, separate from tournament access |
| 17 | Ladera Power Lines | Ladera Ranch | Not yet; verify distinct 18+ playable public layout/access |
| 18 | Sylmar DGC / Veterans Park | Sylmar | Not yet; independently corroborated 18-hole public park |
| 19 | Ken Malloy Harbor Regional Park | Harbor City | Not yet; high-priority close-to-center |
| 20 | La Mirada - Front | La Mirada | Not yet; independently corroborated 18-hole main layout |
| 21 | La Mirada - Back | La Mirada | Not yet; independently corroborated distinct 18-hole main layout |
| 22 | Whittier Narrows | South El Monte | Not yet; verify year-round 18+ holes |
| 23 | Chavez Ridge at Elysian | Los Angeles | Not yet; verify 18+ current public playable layout |
| 24 | Sapwi Disc Golf Course | Westlake Village | Not yet; current installed holes and park hours |
| 25 | Rabbit Flats | Thousand Oaks | Not yet; current 18+ holes and access |

**Extra outside earlier 80-mile lead list:** Existing starter course `Coyote Point · Lake Casitas` (Oak View) is independently represented in `weather-courses.json`; do not delete it on the basis of the 80-mile historical report.

**Explicit private-only exclusions from original research:** `The Gates of Hell` and `Foxtail Ranch` near Valley Center require owner permission; exclude. Other exclusions: ball-golf properties (David L. Baker, Van Buren, Colton, Goat Hill); university courses (Concordia, CSU San Marcos); 9-basket / 9-hole loops (Montiel, Kenneth Hahn, Rancho Jurupa); historically unavailable courses (Val Verde, Hidden Meadows) unless status is independently restored and verified. Do not inflate the directory with 9 baskets replayed twice.

## Independent public crosschecks (2026-10-17)
These links independently substantiate some leads as of verification; still inspect layout/access and course-area coordinate before publishing.
- **La Mirada Front:** https://udisc.com/courses/la-mirada-regional-park-front-RLxg — public park; main 18-hole layout, current directory 19 holes.
- **La Mirada Back:** https://udisc.com/courses/la-mirada-regional-park-back-e9sS — distinct public park main 18-hole course.
- **Brengle Terrace:** https://udisc.com/courses/brengle-terrace-park-BuoN — public park, 20 holes and current available status; dedicated holes, not simply replayed 9 baskets.
- **Sylmar / Veterans:** https://udisc.com/courses/sylmar-dgc-veterans-park-6oMO — public park, 18 holes, current limited public hours.
These are webpage/source checks; they do NOT verify the precise basket-area GPS coordinates. Prefer an operator/city/county official site and course map for access and holes where available; use permitted direct-source evidence. **No bulk UDisc/PDGA scraping or prohibited feed harvesting.**

## Release / QA gate (targeted, not restart)
1. **Before approval of production release:** reconcile all 25 historically researched leads individually against current public evidence (course name, genuine distinct 18+ holes, public access, open/seasonal state, source URL, representative course-area lat/long). Add verified eligible courses to `app/src/data/weather-courses.json` with granular provenance and truthful access/seasonality. Record rejected/pending leads with reason; **do not claim 25 automatically qualify** or invent location coordinates.
2. Cover at minimum the obviously missing close-range regions and both La Mirada 18-hole courses, plus representative northern/eastern/southern areas where eligible, rather than shipping a misleading five-course '150 miles' product. The count is evidence-derived rather than arbitrary; report verified included / excluded / pending totals.
3. Test that the enlarged directory still respects 25/50/80/100/125/150-mile geofiltering, stable ID distinctions, accurate eligibility rules, current opening/seasonal claims, user-facing partial-data notices, duplicate suppression, distance sorting, wind/gust, flags, missing NWS grid handling and upstream request volume/cache limits (NWS quota resilience, bounded concurrency). Weather source must not silently appear authoritative when stale or partially absent.
4. `/weather` and `/weather/` should consistently work; verify actual iPhone Home Screen launch and the manifest `start_url`/`scope` boundary instead of relying only on string/structural tests.
5. Preserve currently passing 69 app / 15 weather / 127 root tests and TypeScript/production build gates; add focused regression checks for expanded catalog plus course proof. No changes to HBNF scoring, LR×HBNF draft PR #99, separate site redesign, Supabase schemas, production deployment or spending.
6. Preview/owner review first, **then explicit production approval**. User can evaluate a narrow visual preview while directory completion proceeds. Only one project Codex worker at a time.

**Why this document exists:** A completed v1 worker said the previous lead list was unavailable in AKS and entered only five courses. It *was* recoverable from the user's prior authored Library PDF. This file puts its candidate names and limitations directly on the feature branch so the existing worker can act without repeating discovery or mistaking yesterday's weather estimates for current facts.
