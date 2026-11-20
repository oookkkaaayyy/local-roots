# HANDOFF: Local Roots / Dyed & Unattached / HB Night Flyers (2026-11-20)
Read this first. Everything needed to continue is in GitHub (source of truth) plus the Drive folder "LR_DU_HBNF_BACKUP_2026-11-20" (this doc, source archives, spec docs).

## Owner rules (Andrew)
- Formal efficient prose, no em dashes. No explanatory/marketing copy on any public page (data and short labels only). Never overstate tool capability in previews.
- Do all possible work before replying; no "what I could not do" lists. Back up everything a session creates to Drive/GitHub and log paths.
- No added monthly cost, no external communication without ask. Standing permission for HBNF/LR work on his computer.
- Brand: Cabin font, desert/earth palette, no serif, no blue.

## Repos (GitHub, owner oookkkaaayyy)
1. local-roots (LR + D&U + weather). App in /app. Prod localrootsdg.com on Cloudflare Pages project "local-roots". Branch previews https://<branch>.local-roots.pages.dev.
   - Build: `cd app && npm run build`. Tests: root `npm test`.
   - PR flow (gh pr create fails): `gh api repos/oookkkaaayyy/local-roots/pulls -f title= -f head= -f base=main -f body=`; wait for checks (Cloudflare Pages, Domain tests and web build, Release evidence validator) then `gh api -X PUT .../pulls/N/merge -f merge_method=squash`. Branch from fresh origin/main (stale branches show "behind" and cannot merge).
   - Public stylesheet: app/src/skin.css (scoped `.lr`). Shell: app/src/components/Shell.tsx. Pages in app/src/pages. Legacy CSS layers still exist (weather.css, events-enhancements.css, lr-hbnf-integration.css, share-ready-polish.css, accessibility.css, styles.css, mobile-section-tabs.css, dye-studio.css) with !important overrides: consolidation pending.
   - iOS 12 rules: no :is(), clamp(), aspect-ratio (even in comments), flex gap, inset, WebP/AVIF. A test enforces this. skin.css must not contain "serif:", Georgia, Palatino.
   - D&U gallery: Supabase gallery_items; legacy images /du-gallery/g/legacy-ROW-SIDE.jpg (square). Dye Studio source: dye-studio/src (ui.src.js, ui.css), regenerate with `node dye-studio/scripts/build.mjs`.
   - Routes: / and /events, /events/<slug>, /weather, /submit-event, /hb-night-flyers (iframe of hbnightflyers.com), /dyed-and-unattached, /dyed-and-unattached/stencil, /dyed-and-unattached/dye-studio.
2. hbnf-site. Cloudflare Worker "hbnf" (account e3bc6b78f1104fa0c2a01245084594cf), live code in worker/live/index.js (serves its own inlined page HTML, patches, KV; NOT dist HTML). Deploy: GitHub Action .github/workflows/deploy.yml runs on merge to main using repo secret CLOUDFLARE_API_TOKEN (token "GitHub Actions hbnf-site deploy", created 2026-11-20 in Cloudflare profile, no expiry; rotate at dash.cloudflare.com/profile/api-tokens then update the secret at github.com/oookkkaaayyy/hbnf-site/settings/secrets/actions). CI install needs pnpm build approval (pnpm-workspace.yaml allowBuilds). Rollback: README in worker/live, previous version v414 (6e9acd76).
   - Embedded mode: worker injects an `is-embedded` script+style before </head> so the page is compact inside the LR iframe (verified live).

## Shipped 2026-11-20 (all merged to main, live)
- Single unified header with HBNF in nav; HBNF page is the real HBNF site framed (PRs 271, 272).
- Fixed-viewport tool shells, Stencil two-pane, Weather single-row toolbar, event detail heading fix (273).
- PR 274: square JPEG gallery + thumbnail filmstrip (AVIF sprite removed), simplified event cards, event detail facts list, "More filters" disclosure, /submit-event page.
- PR 276: Weather single quiet status line, sentence-case Cabin chart captions, global :focus-visible ring, token contrast test (tests/brand-contrast.test.ts).
- hbnf-site PRs 6-8: auto-deploy workflow, CI install fix, worker-injected embed style.

## Still open (priority order)
1. DONE 2026-11-20: Dye design layout fix (flex, internal scroll), Clear with confirm, layers-first panel with disc settings collapsible. Stencil empty state still open.
2. CSS consolidation: remove !important overrides and dead rules across the legacy CSS layers into skin.css tokens (run tests + build after each step; visual check at 1366x1024, 834x1112, 390 wide).
3. DONE: scripts/visual-smoke.py (overflow check, 3 widths, all routes): run `python3 scripts/visual-smoke.py <base_url>`.
4. Accessibility: heading hierarchy, dialog focus handling, filmstrip aria.
5. HBNF: overlap of floating Cart Control button with the LR shell, deep links into the iframe (pass path/hash), same-origin hosting option, shared night treatment.
6. Real-device iOS checks (date field, masked D&U wordmark, fixed shells).
7. Consistent loading/error/motion states.

## Verification method
Built-in browser (resize_window presets: iPad Pro landscape 1366x1024, iPad portrait 834x1112, phone 390x844; use JS measurements at 390). Reset preset "desktop" after.

## Drive docs
- LR Public UI System v3 (current): id 1v3xku-RxzQdXesvzcnbCjgCdGkGd8LgHbjO2jckG7c4 (design system, authoritative). Older: LR Public Skin v2 spec, LR Unified Design System (outdated).
- AKS canonical docs: see /areas notes in Andrew's memory and "AKS — CANONICAL — Local Roots".

## 2026-11-20 update
- Events: inline expandable cards, every event links to best source (official_url, source_url, course_url, registration).
- Dye Studio: per-layer x beside eye; Champion renders semi-translucent, disc color full range (dark bases stay dark).
- Stencil: empty state centered picker; work state preview + controls (CSS bug: tool grid overrode empty-state hide).
- HBNF: live worker rolled back to v438; auto-deploy from hbnf-site disabled; never deploy that repo until reconciled. Embed single-header injection is not live.
