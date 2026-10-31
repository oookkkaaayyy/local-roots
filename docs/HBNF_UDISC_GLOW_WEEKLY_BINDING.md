# HBNF UDisc Glow weekly event binding

The scheduled Worker no longer depends on UDisc's league schedule page to discover an upcoming event. An additive migration creates `public.hbnf_udisc_glow_event_bindings`, enables RLS, and grants access only to `service_role`. It seeds the three verified HBNF Glow Doubles events for November 3, 10, and 17, 2026. It does not create a Glow week, add player aliases, or import scores.

The Worker checks the binding table only for a row whose window includes the current instant. It rejects overlapping active rows, non-Tuesday dates, event IDs outside the HBNF Glow Doubles slug families, invalid local-date windows, and windows longer than 12 hours. It then reads `league_state` and proceeds only when `glow.activeWeek` exactly matches the bound date, the week exists, and it is unlocked and unfinalized. Existing identity resolution, manual correction protection, partial-score handling, atomic write, and independent readback remain in the same path. Missing or ambiguous identities remain fail-closed.

## Upcoming event windows

The verified public start time is 5:30 PM Pacific. Each seeded window is 5:30 PM–11:30 PM `America/Los_Angeles` on that Tuesday. The Worker does not fetch UDisc before the window. This 6-hour limit stays below the installed 12-hour guard.

| Glow week (Pacific) | UDisc event ID | Starts | Ends |
|---|---|---|---|
| 2026-11-03 | `hb-glow-doubles-tAP8Y5` | 5:30 PM | 11:30 PM |
| 2026-11-10 | `hb-glow-doubles-af85rU` | 5:30 PM | 11:30 PM |
| 2026-11-17 | `hb-glow-doubles-C1mFl8` | 5:30 PM | 11:30 PM |

## Later weekly events

For a future Tuesday, obtain the canonical event ID from its UDisc event page and its date/start time from the HBNF schedule. Prepare one new row in `hbnf_udisc_glow_event_bindings` with the event-specific HBNF Glow Doubles ID, exact week date, and UTC window timestamps derived from Pacific time. The unique date and event-ID constraints make the row insert-only for the event; a conflicting row is rejected. Use the existing per-target two-phase admission and closeout for that scoped database configuration write. No Worker source/package deployment is needed to add the row.

Before scoring, use the existing Glow workflow to initialize the dated week and make it active. The UDisc sync will not create a week or silently invent aliases. If a player name is unresolved or ambiguous, the normal one-time identity review remains necessary before scores can be applied. The current HBNF admin/Glow week setup and those legitimate identity reviews are operational steps; they are separate from event binding.

`SUPABASE_SERVICE_ROLE_KEY` remains a Cloudflare Worker secret and is never placed in client assets or this repository. The event-binding table is not granted to `anon` or `authenticated` roles.
