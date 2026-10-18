# LR × HB Night Flyers — Source-Grounded Integration + UX Discovery Audit
**Date:** 2026-10-17 Pacific. **Status:** Read-only source audit completed; live-browser/physical-device visual audit **NOT** completed. **No implementation or release authorized.**
**Source baseline:** private `oookkkaaayyy/local-roots` `main` = `4f1573229512d62f8c7762ec2f815ede3d99429d`.
**Coordinator charter:** `docs/LR_HBNF_SITE_INTEGRATION_CHARTER.md` on draft PR #99; at most ONE sequential Codex worker for this project. Other workers and existing live scoring work must not be interrupted.

## 1. Verified current architecture

| Component | Current source / production evidence | Implication |
| --- | --- | --- |
| Local Roots app | `app/src/App.tsx`, `app/src/components/Shell.tsx`, `app/src/pages/*`; React/TS/Vite; Cloudflare Pages (source doc `docs/ARCHITECTURE.md`). | Reuse existing client shell, routes and auth; do not introduce an SSR framework without a demonstrated need. |
| Root route | `App.tsx` maps `/` to `<EventsPage landing />`. `HomePage.tsx` exists but is NOT routed. | A true three-branch hub is not current source behavior; deciding home-vs-events priority is an IA/product decision, not a missing code import to fix automatically. |
| Public navigation | `Shell.tsx` renders Events and Dyed & Unattached in the main public nav, with HBNF only in the footer outbound link; `/hbnf` 301-redirects to `/hb-night-flyers`. | HBNF discoverability is inconsistent with making it a first-class Local Roots section. Any extra mobile nav item needs 320/390/430px verification. |
| HBNF section | `HbnfPage.tsx` contains title and outbound `https://hbnightflyers.com/` CTA plus SoCal events CTA; no native HBNF club/program content on LR. | Integration of public user journeys is minimal despite existing backend data integration. |
| HBNF in Events | `EventsPage.tsx` surfaces normalized HBNF entries with links to HBNF site, UDisc, Instagram and Facebook (from `eventPresentation.ts`). | Reuse existing qualified event display; avoid a second independent schedule datastore. |
| LR backend | Separate Supabase project `wtymjxscneufjlkkywyg` uses `lr_` tables/RPC; current `lr-sync-hbnf` Edge Function v6. | Existing canonical event/provenance pipeline must remain authoritative for Local Roots event public reads. |
| HBNF backend | Separate Supabase project `phcpbvuqibyarpfrftgx`, independently managed operational state, current website independently deployed to Cloudflare Worker. | Do not migrate HBNF write authority, league state, tag custody, no-login UX, or scoring logic into LR based on aesthetics. |
| Data integration | `supabase/functions/lr-sync-hbnf/index.ts` does a scheduled first-party read of HBNF `league_state`, creates normalized LR events/results/provenance via LR-managed RPCs. | Backend integration ALREADY EXISTS. Site integration does NOT inherently require backend consolidation. |
| LR public headers | `app/public/_headers` declares `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, and `connect-src` limited to LR project origins and self. | LR pages cannot be freely framed into HBNF; direct LR-browser reads to HBNF Supabase endpoints would conflict with LR current CSP unless deliberately engineered. DO NOT suggest iframe/cross-origin REST as frictionless solution. |
| Existing PWA/SEO | LR has `/sw.js`, D&U manifest, `/_redirects`, route canonical URLs; HBNF has separate existing PWA, offline and deep links. | Shared navigation must preserve service worker scope, separate install contexts, `hbnightflyers.com` QR/deep links and existing Scorecards. |

**Exact source readbacks:** `app/src/App.tsx`, `Shell.tsx`, `HbnfPage.tsx`, `EventsPage.tsx`, `app/src/lib/eventPresentation.ts`, `app/src/main.tsx`, `app/public/_headers`, `_redirects`, `docs/ARCHITECTURE.md`, `docs/PRODUCT_SPEC.md`, `docs/site-copy-policy.md`. Connected Supabase confirms the two projects are currently `ACTIVE_HEALTHY`; this project-level state does **NOT** establish successful HBNF API fetch or LR source readiness.

## 2. Current operational risk — bounded verification

At **2026-10-17 18:03 Pacific**, direct read-only `select ... from public.lr_launch_readiness()` returned:
- `ready=false`;
- 112 published events, 34 stale future events, 9 high/critical blocking reviews;
- HBNF scheduled source historical soak remains complete but the current consecutive healthy run streak is 0;
- zero published events without provenance and zero sanctioned events without basis.

Existing AKS PENDING records describe HBNF REST 504 errors, timeouts and orphaned scheduled LR sync runs. **Do not conflate the Supabase dashboard's project `ACTIVE_HEALTHY` flag with restored service data, and do not silently clear these reviews.** This incident is in its own Local Roots reliability lane and is **not** permission for the site-integration coordinator to deploy fixes while the owner is away. A shared, more tightly coupled single UI would amplify these failures if built against live cross-origin reads.

## 3. Source-level UX and design audit (NOT a screenshot-based visual claim)

Verified current typography/colors in `app/src/styles.css`: Inter/system for most body text, Georgia for major headings, earthy cream/brown/clay/sage design tokens; source has an older root/soil/clay/sand group. Original LR SVGs exist at `app/public/brand/local-roots-full.svg` and `local-roots-lr.svg`; D&U images also exist. **No verified authoritative original HBNF logo is in this LR brand folder.** Do not substitute an invented mark.

The current app loads **seven** CSS layers in `app/src/main.tsx`: `styles.css`, `brand-assets.css`, `du-admin.css`, `responsive-overrides.css`, `events-enhancements.css`, `share-ready-polish.css`, `accessibility.css`. `share-ready-polish.css` overrides many earlier classes and has `!important` values for some D&U pieces. This is a **source-indicated cascade maintenance risk**; it is NOT proof of poor visual rendering. A redesign should rationalize only the touched public selectors/tokens rather than performing a risky global CSS rewrite during HBNF integration.

Important **locked owner copy constraint** in `docs/site-copy-policy.md`: never invent brand poetry, taglines, marketing claims, decorative explanatory paragraphs or promo copy. Existing user-supplied/accepted public wording controls. Functional button/label/error/accessibility text is permissible.

### Palette accessibility screen — mathematical, NOT final acceptance
WCAG 2.2 AA ordinary text threshold is 4.5:1, large text 3:1; evaluate intended actual combinations and interaction states, not an isolated palette. Calculated using standard relative luminance/sRGB:
| Foreground | Background | Approx contrast | Consequence |
| --- | --- | ---: | --- |
| Bone Ink `#292119` | LR cream `#FFF8EE` | 15.02:1 | Accessible for normal text. |
| Bone Ink `#292119` | LR background `#F7F0E4` | 13.98:1 | Accessible for normal text. |
| Moon Bone `#F4E9D6` | Bone Ink `#292119` | 13.18:1 | Accessible for normal text. |
| Faded Phosphor `#B4C58F` | Bone Ink `#292119` | 8.54:1 | Good for small text or accents on dark ink. |
| Faded Phosphor `#B4C58F` | LR cream `#FFF8EE` | 1.76:1 | **Not acceptable for meaningful text on cream**; decorative emphasis/non-text only where allowed, or dark supporting surface. |
| LR Sage `#8C956A` | LR cream `#FFF8EE` | 3.01:1 | Not AA ordinary text; possible for large text/non-text uses depending on context. |
| Clay `#A7623A` | LR cream `#FFF8EE` | 4.47:1 | Borderline under 4.5 normal text threshold; do not assume AA for small links here. |
| Pure white `#FFFFFF` | Clay `#A7623A` | 4.72:1 | Passes normal text contrast mathematically. |

**Design implication:** Bone Ink can bridge LR cream and HBNF identity; muted phosphor should not become cream-background body/link text. Do not 'solve' palette integration through excessive neon or whole-page dark inversion. Use genuine logos.

### Existing HBNF mobile contract — no accidental scoring redesign
Owner-lock document: `HBNF W1 — MOBILE UX ACCEPTANCE CONTRACT — 2026-10-16` (Drive ID `1-Lbl3HS32s3ySBzqJ-6uQjgnxZYLDOy8yfwC82TcZyI`). It requires scorecard first, in-line name/tag, no Tag Challenge, compact payouts, source-of-truth integrity, visually contained iPhone score grid, anchored bottom-right Cart Control, no-login friction. These **apply to HBNF operational UI**, not automatically to LR event-card content. The recent 2026-10-17 verified HBNF conflict-resolution production release reported Worker version `183e5cbc-e156-4eb6-93bb-4424a719d93c` and migration `20261017073306`, but was verified through user-supplied release receipts, not a fresh source hash or direct Worker API inspection by this coordinator. No regression or brand integration may replace that functioning state without explicit gate.

## 4. Technical integration options — challenger comparison

| Option | What users get | Benefit | Risk/cost | Decision |
| --- | --- | --- | --- | --- |
| **A. Hub-first native LR HBNF section + preserved operational deep links** | HBNF becomes an actual navigable LR section; schedule and relevant public links in the LR visual system; scoring opens the existing HBNF app unchanged. | Reuses existing LR/HBNF data, independent scoring/PWA and links; low cross-origin/security/cost risk; staged and reversible. | Browser moves to independent HBNF app for live score entry; visually distinct operational surface. | **Initial preferred foundation.** Evaluate the exact desired cross-brand feel before coding. |
| B. Additional public read-only HBNF snapshots within LR | More native standings/history/club content on LR; scoring still independent. | Better visitor continuity, no second write authority if via qualified first-party RPC. | Additional source freshness/provenance/caching and privacy decisions; current LR sync unhealthy. | Optional AFTER source-health restoration and demonstrated visitor use case. |
| C. Same-origin reverse proxy, embedded application or rewrite of live scoring in LR SPA | One apparent LR-origin scoring surface. | Potentially fewer visible origin changes. | CSP, cookie/auth, service worker/installation, offline cache, routing/realtime, role/session, QR/deep-link and migration complexity; risk to weekly league operations. | **Not justified as default.** Only if A demonstrably fails a locked owner outcome and isolated technical proof passes. |

This recommendation is **provisional**: to meet the owner's desired integration, a single shared visible design might require more than a basic outbound link. The visual audit must show whether the hub-first section feels integrated enough before treating Option A as final.

## 5. Constrained user-experience direction

Not a generated design or acceptance claim:
- Retain Local Roots as the clear umbrella identity. HBNF appears as a full top-level destination rather than being discoverable mainly in the footer.
- Keep a consistent nav vocabulary; don't assume `HomePage` should replace `EventsPage landing` without user review.
- Develop 2 or 3 visually distinct **real-asset** directions after actual screenshots, with shared cream/ink typography system, genuine LR and HBNF logos, muted phosphor accents with valid contrast, HBNF independent-club wording and seamless page transitions.
- Keep Events a useful, not promotional, information utility. D&U retains its independent identity. Do not invent slogans or atmospheric copy.
- Source screenshot review must include 320, 390 and 430 CSS px, desktop, long headings, expanded filters, actual event data, fixed nav and common primary tasks.

## 6. Next *single-worker* validation stage (sequential, not launched)

**No Codex work was needed for this repository/AKS/Supabase source audit.** To finish the remaining visual/interaction portion, the eventual one worker should:
1. Reuse this source audit and charter; confirm exact current `main` and HBNF actual deployment/source identity, avoiding unrelated local worktrees or duplicate projects.
2. Capture **actual production** (read-only) mobile/desktop views for LR root, Events, HBNF page and D&U; and the working HBNF site main nav/Skins/Glow views, using browser/in-app browser if available. No production data entry or saves. Capture narrowly scoped evidence, not a huge ZIP of redundant images.
3. Identify original HBNF logo files by actual asset path/hash from authoritative site/source; do not claim old Drive historical files represent current production.
4. Map actual UX gaps and verify whether options A/B/C are feasible under current routing/CSP/PWA/deep-link/offline contracts. Preserve HBNF live UI baseline exactly.
5. Produce 2–3 **high-fidelity** mobile/desktop design alternatives with genuine assets, *only* if accurate browser capture/render tools are available; otherwise report the blocker, source-supported findings, and exact one-step resolution. Do not fabricate screenshots, substitute stock logos or create production changes.
6. Deliver one concrete recommendation with expected BEFORE → AFTER navigation and owner decision gates. No cloud billing, GitHub production merge, migrations, deployments, localhost server left running, subworkers, or background tasks.

**Completion standard for this stage:** actual screenshots + measured issues + authentic original assets + reasoned comparison and owner-reviewable visual directions, with one succinct final handoff. Stop when genuinely blocked, not after repetitive retries.

## 7. Evidence, authority and open questions

- **Verified source:** Connected GitHub `oookkkaaayyy/local-roots` `main` current commit + fetched files listed above; Supabase project/Edge metadata and exact read-only readiness query at 18:03 Pacific; AKS Master Router, HBNF/LR canonicals and Oct 16 W1 UX contract.
- **Prior operator-verified field/release claim:** HBNF Worker Oct 17 conflict resolution from owner-provided release report; not a fresh browser/prod API confirmation here.
- **Unverified:** Actual rendered mobile/desktop output of either live domain, accessibility real interactions, Chrome/Safari/PWA behavior, original HBNF production asset hash, live HBNF Worker source/code snapshot, full Cloudflare configuration. Standard web tool cannot fetch `https://localrootsdg.com/` nor `https://hbnightflyers.com/` in this environment; **do not equate inability to fetch with a website outage**.
- **Owner decisions later needed:** Actual shared visual direction; whether hub-first HBNF section meets the desired continuity; whether LR root should serve the broad hub or immediately show Events; scope/authorization of any operational entry-point/URL changes and release.
- **Other project boundary:** LR HBNF source-integrity repair has its own active worker/dependencies; do not duplicate, merge or deploy fixes from this site-design lane.

**References:** [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [NN/g heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/), [web.dev Vitals](https://web.dev/articles/vitals), current project `AGENTS.md` and charter. Tests/physical acceptance cannot be replaced by standards citations.
