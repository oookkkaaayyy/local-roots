# Local Roots — Technical Architecture

Updated: 2026-08-23

## Public/admin web application
- React
- TypeScript
- Vite
- Cloudflare Pages
- private repository: `oookkkaaayyy/local-roots`
- staging: `https://local-roots.pages.dev/`

The MVP `/events` page is a client application; no dedicated application server is required.

## Data/backend
The existing Supabase project currently named `Dyed & Unattached` is also the Local Roots umbrella backend. Local Roots event-domain objects are isolated with the `lr_` prefix.

The HB Night Flyers Supabase project remains a separate operational backend. Do not merge or mutate HBNF operational state from Local Roots. The permitted HBNF adapter reads the existing first-party/public HBNF application state and writes only normalized Local Roots event/provenance/results records into the Local Roots backend.

## Source acquisition / scheduled processing
- Supabase Edge Functions for approved/first-party source acquisition and normalization
- Supabase Cron/`pg_cron` for scheduled jobs
- `pg_net` for scheduler-to-Edge invocation
- Supabase Vault for scheduler/source credentials
- Postgres for canonical data, provenance, review queue, source-run health, results and manual overrides

Current automated source:
- `hbnf_internal_schedule` — first-party/user-controlled HBNF data
- worker: `lr-sync-hbnf`
- start: 05:00 `America/Los_Angeles`
- retry: 06:00/07:00 only if the day's earlier attempt is unhealthy
- stable external IDs make repeated runs idempotent

No credential values belong in Git, AKS or client code.

## Public access pattern
Browser -> restricted Supabase public RPC -> canonical published events

Never:
- browser -> raw source payloads
- browser -> service-role key
- browser -> review/admin tables

The public page reads only validated canonical records with publication provenance. Source acquisition occurs off the public request path, so an adapter failure cannot erase the current list.

## Admin access pattern
Browser -> Supabase magic-link Auth -> JWT-protected `lr-admin` Edge Function -> service-role admin operations

Admin identities are also checked against `lr_admin_users`; being an authenticated Supabase user alone does not grant Local Roots admin access.

The shared D&U/Local Roots Supabase Site URL should not be changed just for Local Roots. Staging auth uses an additional allowed redirect URL for `https://local-roots.pages.dev/admin/events`.

## Submission pattern
Public browser -> `lr-submit-event` Edge Function -> structural/scope validation -> candidate/review queue -> explicit admin approve/merge/reject -> provenance -> publication

Public submissions never auto-publish merely because the HTTP request succeeds.

## Repository layout

```text
/
  README.md
  AGENTS.md
  docs/
  app/
    src/
  supabase/
    migrations/
    functions/
      lr-submit-event/
      lr-admin/
      lr-sync-hbnf/
  tests/
```

## Deployment model
- `main` is the deployable source branch.
- Cloudflare Pages deploys the `app/` Vite build from Git.
- database DDL belongs in committed Supabase migrations;
- Edge Function source belongs under `supabase/functions/`;
- run database advisors after DDL changes.

## Reliability model
Scheduler status, fetch status, parse status, validation status and source health are independent signals.

If fetch/parse fails, validation is `skipped`; the run is unhealthy. Canonical data is not deleted because a source fails or omits records. Source disappearance becomes a review item.

The first HBNF live adapter demonstrated fail-closed behavior: a provenance timestamp constraint rejected the v1 run before publication. The v2 repair passed a 31-record live run and a second idempotency run with zero duplicate creations.

## Source boundaries
- HBNF: active first-party adapter; separate operational backend preserved.
- Organizer submissions: active.
- PDGA: disabled pending written licensing/data-use clarification.
- Disc Golf Scene/UDisc: no unapproved automated scraping.
- Other club/community sources: require a documented permission/access basis before automation.

## Cost-control model
Avoid at MVP:
- a third Supabase project
- separate CMS/search/scheduler/monitoring vendors
- server-rendered framework without a real requirement

Use existing Supabase, Cloudflare Pages, Postgres health/audit tables and bounded GitHub/Codex work.

## Future expansion
The architecture can later support Local Roots hub pages, D&U links/storefront, selective HBNF cross-site data, club/course profiles, organizer accounts, maps, newsletters and documentary/content pages without combining the HBNF operational backend into Local Roots.
