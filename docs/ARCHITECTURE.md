# Local Roots — Recommended Technical Architecture

Updated: 2026-08-23

## Decision

Use the simplest durable stack that matches infrastructure already in use:

### Public/admin web application
- React
- TypeScript
- Vite
- Cloudflare Pages
- one repository: `local-roots`

Rationale:
- Cloudflare documents React + Pages as a first-class deployment path;
- Git-backed automatic deploys and pull-request previews are built in;
- the MVP `/events` page does not require a dedicated application server;
- keeping the frontend as a small client application reduces Codex surface area;
- future server-side needs can be added with Pages Functions or migrated to Workers without replacing the database.

### Data/backend
Use the existing Supabase project currently named `Dyed & Unattached` as the Local Roots umbrella backend.

Do not touch the separate HB Night Flyers Supabase project.

The existing D&U application tables are currently empty, so adding Local Roots event-domain tables does not require a third active Supabase project.

### Source acquisition / scheduled processing
- Supabase Edge Functions for approved API/feed acquisition and normalization
- Supabase Cron for daily scheduled source jobs
- Postgres for canonical data, provenance, review queue, source-run health, and manual overrides

### Public access pattern
Browser -> restricted Supabase public read view -> canonical published events

Never:
Browser -> raw source payloads
Browser -> service-role key
Browser -> review/admin tables

### Admin access pattern
Authenticated administrator -> Supabase Auth -> RLS-protected admin operations

## Repository layout

```text
/
  README.md
  AGENTS.md
  package.json
  .env.example
  .gitignore
  docs/
  src/
    app/
    components/
    features/
      events/
      admin/
    lib/
      supabase/
  public/
  supabase/
    migrations/
    functions/
      ingest-source/
      process-candidates/
  tests/
    fixtures/
    unit/
    integration/
```

Exact generated structure may differ slightly from the current Cloudflare C3 React starter. Prefer the current official scaffold over hand-building obsolete config.

## Environment variables

Public/client-safe:
- Supabase project URL
- Supabase publishable key

Server-only:
- service role / secret key when truly required
- third-party source/API credentials
- scheduled-function secrets

No credentials in Git.

## Deployment model

### Branches
- `main`: production
- short-lived feature branches / Codex branches
- no long-running giant development branch

### Cloudflare
- production deploy from `main`
- PR preview deployments for visual QA before merge

### Database
- migrations committed in Git are source of truth
- do not make production DDL changes that are absent from migrations
- after schema changes, run security/performance advisors

## Reliability model

The public page reads only last-known-good canonical records.

Source acquisition occurs off the public request path.

A failed PDGA/club/API job cannot make `/events` unavailable and cannot erase the current event list.

## Cost-control model

Avoid:
- a third Supabase project
- a separate CMS
- a separate search service
- a separate scheduler
- a separate monitoring vendor at MVP
- a server-rendered framework unless a real requirement appears

Use:
- existing Supabase
- Cloudflare Pages
- Postgres queries/indexes
- built-in source-run health table
- GitHub/Codex only for bounded implementation passes

## Future expansion

This architecture can later support:
- Local Roots home/hub
- D&U storefront links/content
- HBNF links and selective cross-site data
- club profiles
- course profiles
- organizer accounts/submissions
- maps
- newsletters
- documentary/content pages

Do not prematurely combine the HBNF operational backend into Local Roots.
