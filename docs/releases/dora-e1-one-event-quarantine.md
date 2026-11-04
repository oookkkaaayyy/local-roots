# DORA RELEASE E1 — one-event quarantine, source/recovery contract

Controlling authority: existing GitHub #162 / broad draft PR #163. This narrow branch is based on deployed v7 source in main, NOT on the broad PR. Migrations 700/800 and integrity-watch v12 are closed; do not repeat them.

## Verified scope, November 4, 2026

- public.lr_events id: 5e87e132-dfe9-41e5-8087-80d4b881caa0
- slug: hbnf-glow-2026-09-02; current status=completed, published=true
- public.lr_event_sources id: 3b6db90a-800e-4c46-927e-2df1d081f9c7
- external_id: hbnf:glow:2026-09-02
- source_id: d77cfae0-8597-475a-8e05-ae96e2dbee6f
- Exactly six existing source-linked public.lr_results rows have explicit Fixture-prefixed names, all retained.
- The production table uses public.lr_sources.key (not source_key). No new migration or schema patch is authorized.

## 1. Capture and independently verify the deterministic preimage

The offline script prints the actual read-only SQL:

    node scripts/dora-e1-release.mjs capture

Execute that SQL through the authorized Supabase SQL tool without bypassing connector safeguards. It returns ONE JSON object named e1_preimage, with the full event row, all related event-source rows, and all six result rows sorted by UUID. Save the JSON privately; never commit the preimage, event notes or credentials to GitHub. The next command validates exact target UUIDs, one source association and all six Fixture-marked results, then prints SHA-256.

    node scripts/dora-e1-release.mjs apply /private/e1-preimage.json

Any preimage must be captured fresh immediately before admission because the installed v7 scheduled sync may replace result IDs. Capture its source-run/scheduler status separately for rollback planning; do not mistake count-only readback for a durable row-level backup.

Store the preimage, exact-head source candidate, installed v7 Edge rollback source and both generated SQL files in the existing owner-private Drive recovery folder. Download them back independently. Record byte sizes, SHA-256 hashes, Drive IDs, deployed v7 source identity, target event UUID, scheduler baseline, and readback values within ONE existing fail-closed admission manifest, with no duplicate release stream. An exact prechange readback MUST match the downloaded immutable preimage. Do not apply unless the full two-phase recovery gate has PASS.

## 2. Apply and restore (SQL generation is offline, not execution)

    node scripts/dora-e1-release.mjs apply /private/e1-preimage.json
    node scripts/dora-e1-release.mjs restore /private/e1-preimage.json

Each command emits a separate BEGIN/COMMIT PostgreSQL DO transaction with the full captured JSON embedded. It SELECTs the exact canonical event FOR UPDATE, verifies the full source-link and six-result arrays against the admitted preimage, and performs at most ONE compare-and-set update to public.lr_events.published. All other event rows and every result/source-link row remain untouched. If publication is already in the requested state and other logical columns match, it is a no-op. Any drift or unexpected identity aborts the transaction before changing publication.

Existing public.lr_events_touch_updated_at updates the event timestamp on a changed publication flag. Thus restoration is of the prior visibility and all other logical event fields, NOT byte-identical recreation of updated_at history. The SQL and offline test do not constitute a live PostgreSQL rollback exercise. If a full physical rollback is demanded, an additional admitted database snapshot is required.

## 3. Source guard and release order

The narrow Edge source guard excludes only the verified September 2 Glow external ID before candidate and result creation, preserves that ID in seen-source tracking and sets published=false for the single verified event/source match only when currently published. It never deletes or rewrites historical results. Other real and incomplete rounds continue through installed v7 behavior.

IMPORTANT: Executing SQL before deploying a corresponding source guard would be undone by the next v7 scheduled sync. Conversely, deploying the Edge function or invoking an ordinary full sync may change other HBNF events, provenance, source-candidate rows, source-run records and result rows. Those wider effects require a separate full runtime-write-scope recovery admission. No guarded E1 production rollout can be called complete unless exact-source rollback and scheduler ownership/readback are also admitted. Do not use broad PR #163 as the narrow E1 release.

After admission and coordinated release, verify: event published=false, public RPC excludes this event and its fixture results, the six original result UUIDs and all row values are unchanged, legitimate played HBNF event results remain visible, and scheduled sync cannot republish the fixture. Archive signed/hashed provider and public closeout to existing #162/#163 and AKS record.

**Current release decision:** REVIEW_ONLY; NO production admission yet. No deployed fix is claimed by the source commit.
