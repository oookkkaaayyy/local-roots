# Local Roots × HB Night Flyers — Website Integration & Design Operating Charter

**Status:** Coordinator working charter; author-requested, not a visual-design approval or production release.
**Established:** 2026-10-17.
**Repository baseline at creation:** `oookkkaaayyy/local-roots`, `main` commit `4f1573229512d62f8c7762ec2f815ede3d99429d`.
**Scope:** Local Roots public site architecture, experience and visual design; incorporation of the independent HB Night Flyers club experience; coexistence with Dyed & Unattached.
**Authority:** A project operating discipline, subordinate to AKS governance, owner decisions, existing accepted source contracts and real deployed evidence. It does not supersede existing HBNF Cart/scorekeeping release gates or Local Roots event-source rules.

## 1. Start-of-session grounding — required on every coordinator/worker resumption

1. Read AKS Master Router `1CvCKk04BDMUEbxtqatUP_bU7KbFYYJo1Hu32bh_zgzM`; governance `10AEqHz3ptAoOPO0clnQaySpzD5CY5JV14IWuSKfJluo`; canonical registry `1_LpIMGWvUdwayjCUTkW07-6H-QZfgpIjmbAmLW6AnVY`; maintenance SOP `1qirrxHzyiZrlRK2APVDbfGPBydhQ2_qVS1stkpfUuYw`.
2. Read the current Local Roots canonical `1DTxeBvmna6zQhCMLpWm2095P494sugg31SzeycXw1qE`, HBNF canonical `1ZEPICVZHcH7eOBY5Rn5-wiO0gy8Q3DNnMCeLO-PrthI`, relevant Current Open Loops `1_dnpGWfGmbUev8zEY95Nn-jwKjfmSN-j08VPeDlrdCI` and **relevant PENDING** Delta Inbox entries in spreadsheet `1tJIcKRfWFdHVYVo4G6mgySB46p6xwsseGON3JdnEnzY`. Later verified live data outranks historical snapshots when appropriate.
3. Check the current GitHub source and exact ref of `oookkkaaayyy/local-roots`, plus existing `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/PRODUCT_SPEC.md`, `docs/SOURCE_RULES.md`, `docs/ACCEPTANCE_TESTS.md`. Verify the *independent* HBNF site's live/source state separately; never infer its exact implementation from the Local Roots repository.
4. Recover approved original HBNF and LR logo files and typographic assets before visual work. Current LR repository contains `app/public/brand/local-roots-full.svg`, `local-roots-lr.svg`, and D&U assets. **An authoritative original HBNF vector was not yet verified inside this repository as of charter creation**; find it in the authoritative HBNF source and do not substitute approximations.
5. For substantive new recommendations, review current primary standards and actual application to the decision. The links below are reference authorities, not substitutes for field testing.
6. Explicitly record what is **verified**, what is **inferred**, and what needs visual, runtime, security or owner acceptance. No silent source/version drift.

## 2. Permanent reference framework

- **UX:** Nielsen Norman Group 10 usability heuristics (https://www.nngroup.com/articles/ten-usability-heuristics/); test real primary tasks and recovery paths; mobile-first touch, clear feedback, consistency, low recognition load and restrained complexity.
- **Accessibility:** W3C WCAG 2.2 (https://www.w3.org/TR/WCAG22/), target AA for public and authenticated interfaces; verify actual contrast, focus/keyboard flow, accessible names, reflow, touch target size, error messaging and status semantics. WCAG is a testable criterion set; accessibility is not guaranteed by a palette score.
- **Visual/color:** W3C CSS Color Level 4 (https://www.w3.org/TR/css-color/), including perceptual OKLCH where helpful for systematic hue/chroma/lightness adjustments. Validate contrast using WCAG criteria; visual hierarchy, content density, brand differentiation and harmony require context-specific expert review rather than arbitrary formulas.
- **Performance:** web.dev Core Web Vitals (https://web.dev/articles/vitals); good p75 targets LCP <= 2.5s, INP <= 200ms, CLS <= 0.1; measure mobile and desktop separately and use real-user metrics if available.
- **Security:** OWASP ASVS v5.0.0 (https://owasp.org/projects/asvs) as risk-relevant verification guidance; review authZ, exposed surfaces, injection, sessions, data minimization and privacy. Do not require irrelevant controls or treat a checklist as proof.
- **Data/platform:** Supabase RLS (https://supabase.com/docs/guides/database/postgres/row-level-security) and migrations (https://supabase.com/docs/guides/deployment/database-migrations); existing Local Roots least-privilege RPC and separated HBNF operational backend remain the default boundaries.
- **Deployment:** Cloudflare Pages preview deployments (https://developers.cloudflare.com/pages/configuration/preview-deployments/); Cloudflare Workers versions/gradual rollout/rollback (https://developers.cloudflare.com/workers/versions-and-deployments/); deployment version rollback does **not** roll back external database changes.
- **AI coordination:** Official OpenAI prompting guidance (https://developers.openai.com/api/docs/guides/prompt-engineering): precise bounded instructions, explicit desired output/test/stop conditions, examples when they disambiguate, and evaluation from independent evidence. Avoid recursive meta-prompting and unnecessary delegation.
- **Renewal rule:** Check source currency/applicability at consequential decisions or when platform behavior has changed; do not repeatedly research unchanged stable standards as ceremony.

## 3. Project source and brand boundaries

- **Local Roots** is a regional disc-golf hub at https://localrootsdg.com, React/TypeScript/Vite on Cloudflare Pages backed by the existing LR/D&U Supabase project with isolated `lr_` objects. Its existing HBNF first-party scheduled data adapter is an event-normalization integration, **not** a replacement HBNF scoring backend.
- **HBNF** is an independently controlled community disc-golf club at https://hbnightflyers.com. Its active Skins, Glow Doubles, standings, bag tags, guest/owner interactions, stored league state, scoring rules and PWA/offline paths must remain authoritative and stable until specifically proven otherwise. Preserve its domain, old bookmarks, QR codes, deep links and in-progress rounds.
- **D&U** retains its distinct identity and current routes. Do not conflate separate branding with corporate ownership or event-data write authority.
- **Approved starting palette, not an approved site design:** Bone Ink `#292119`; Moon Bone `#F4E9D6`; Faded Phosphor `#B4C58F`; LR Sage `#8C956A`. LR source tokens include Root `#3A2618`, background `#F7F0E4`, canvas `#FFF8EE`, sand `#D7C2A3`, clay `#A7623A`. These may be adjusted through demonstrated contrast and composition, while preserving the restraint and continuity the owner prefers. The previously shown HBNF site mockup is **rejected**; do not use it as a design acceptance precedent.
- HBNF logo geometry remains intact absent explicit owner approval. Use authentic files, not model-recreated lookalikes. Any speculative direction must be visibly labeled exploration.

## 4. Mandatory challenger review — before every substantive answer, prompt and decision

Privately evaluate whether the proposed action:
1. uses the current authoritative source and distinguishes direct evidence from inference;
2. preserves specific owner decisions, rejected alternatives, brand/ownership boundaries and production behavior;
3. complies with applicable UX/accessibility/color/security/engineering standards;
4. is simpler and more reliable than a credible alternative, without unnecessary dependencies or migrations;
5. protects data integrity, login boundaries, URLs, offline behavior and mobile scoring workflows;
6. has a concrete before/after task outcome and tests/observations capable of falsifying the claim;
7. merits the cost, regression risk and maintenance burden.

Change the recommendation when review reveals a better approach. Show only material conclusions, uncertainty, tradeoffs and real user gates; no performative critique or generic progress reports.

## 5. Recommended integration architecture — provisional until current HBNF source/runtime audit

**Default hypothesis:** Leave HBNF operational backend, domain, scoring transactions and release controls independent; present a coherent HBNF section within the Local Roots navigation/design shell; reuse currently supported HBNF entrypoints/links or a carefully bounded integration facade as needed. Do **not** equate unified navigation with database consolidation, iframe embedding, full SPA port or domain retirement.

Before choosing an embedding/proxy/same-origin approach, inspect: session origin/CORS/CSP, cookies/auth, service worker scopes, PWA/offline/installation, scoreboard paths, deep links, QR codes, redirect ownership, cross-origin data handling, realtime connections and cache invalidation. Default to a low-coupling linked experience if these boundaries cannot be safely reconciled without considerable cost. Route each write through the existing HBNF authoritative transactional APIs and ownership checks.

**Known active incident at charter creation:** Recent AKS PENDING entries dated 2026-10-16/17 report repeated HBNF 504 upstream responses and failed Local Roots scheduled sync/readiness. Do not describe this as resolved on the basis of historical readiness, and do not entangle design refactoring with incident remediation.

## 6. Parallel work and integration ownership

**Coordinator:** sole owner of baseline, source authority, task dependency map, design acceptance, contract/interface decisions, integration sequence and release readiness. Maintain one small shared decision/evidence log; no parallel duplicate authorities.

**Lane A — Technical read-only integration audit:** exact route/auth/DB/deployment/source map; existing LR/HBNF integration; boundary matrix (read, write, identity, caching, offline); minimal viable options; risks, regression gates and rollback. Separate remediation of urgent existing operational incident from speculative integration work.

**Lane B — Visual/UX audit + design:** exact current assets, screenshots across realistic desktop/iPhone widths, information architecture, typography, hierarchy, color/contrast, key journeys and card/scorecard density. Deliver up to 2–3 materially distinct high-fidelity options with real branding, scored by task success and maintainability; preserve existing good HBNF scorecard UX unless explicitly in scope.

Parallelism is justified only after read-only source inventory settles shared assumptions. Each lane must have bounded file ownership, a fixed source ref, explicit exclusions, deliverables, falsifiable acceptance tests and a durable handoff. Do not make two workers alter the same source files, nor let one worker rebuild another's accepted artifacts.

## 7. Stages and acceptance

1. **Discovery:** current AKS, source, website render and live incident evidence. No change.
2. **UX/design:** show faithful mobile/desktop before/after proposals using real assets; WCAG/brand review. Owner visual acceptance is required to proceed from exploration.
3. **Architecture choice:** tabulate before/after UX, independent boundaries, cost/risk, alternatives and deep-link/offline preservation; get owner approval on consequential navigation/architecture decisions.
4. **Implementation:** bounded changes in isolated branch/preview; no production migrations, changing HBNF authoritative write flow, replacing active live scorecards or unexpected new paid services.
5. **Verification:** local test suites, actual preview in browser, iPhone widths and interaction testing, keyboard/a11y checks, cross-origin/auth/session/PWA checks, real schema/RLS/security checks, migration dry-run/rollback and production-data fingerprints if relevant. Never equate `HTTP 200` or synthetic screenshots with complete field acceptance.
6. **Release:** only after explicit owner design/promotion authorization and technical evidence. Record exact commit, deployment/config versions, database migration IDs if applicable, health monitors, actual deep link and admin/scoring smoke checks and independently tested rollback. Verify data preservation and operational continuity across mid-round usage.
7. **Closeout:** canonical source/readiness evidence and approved design/architecture decisions to AKS inbox; rejected alternatives/supersession and remaining dependency recorded, no secrets.

## 8. Communication and non-negotiables

Lead with conclusion, relevant evidence, next action, real decision gate. Defaults: concise, no filler and no needless questions. Show tangible BEFORE → AFTER when a proposal changes user experience. Use 1-click-copy bounded worker prompts when delegation is appropriate. Distinguish proposed from implemented, code-tested from field-tested, and owner-approved from unconfirmed. No paid purchases, external messages, production database/destructive operations or deployments without authorization. Never attribute ownership of HBNF to Local Roots.

## 9. Immediate next-stage evidence gaps (as of 2026-10-17)

- The current `local-roots` source has an HBNF route that links out, but the public shell primary nav contains Events and D&U, not HBNF; root `/` renders `EventsPage landing` despite a separate `HomePage` component existing. This is a **source read**, not a current-production screenshot.
- Inspect actual Cloudflare-served mobile/desktop output with a browser; general web retrieval from this coordinator session could not fetch either live domain, so visual judgements are provisional.
- Identify authoritative original HBNF logo/vector, CSS and current HBNF route/API/scorecard source; read-only inspect before any merge proposal.
- Re-check LR first-party sync health incident independently; preserve separation from site redesign.
- Obtain owner review of high-fidelity proposals and explicit approval of resulting implementation scope before any production mutation.
