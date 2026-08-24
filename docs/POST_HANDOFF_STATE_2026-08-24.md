# Local Roots — Post-Handoff Verified State

Verified: 2026-08-23 Pacific / 2026-08-24 UTC

This file records live changes after `docs/CONTINUITY_BRIEF.md` and the frozen `Local_Roots_Handoff_2026-08-23.zip`. Where counts below differ from the frozen handoff/brief, this newer verified live state controls.

## Current live event state
- 65 published real canonical events.
- 18 current/future events at the verified Pacific-time snapshot.
- 0 published events without provenance.
- 0 sanctioned published events without sanction-basis provenance.
- 0 stale current/future events under the 14-day freshness gate.
- HBNF now contributes 32 event/provenance rows, up from 31 after the first-party source added the 2026-08-23 Glow week.
- HBNF Glow result rows remain 9.
- The repeat manual HBNF sync is healthy/idempotent: 32/32 valid, 0 new, 0 changed, 0 rejected, 0 missing.
- Three existing medium source conflicts remain open: Fling XXIX tier, Sapwi Trails dates, and Castaic name/date lineage.

## HBNF provenance correction
HBNF is a first-party aggregate source. Stable identity remains `(source_id, external_id)` using IDs such as `hbnf:<mode>:<date>`. `source_url` is provenance/location and now uses the real public HBNF URL `https://hbnightflyers.com/` rather than fabricated Local Roots-only URL fragments.

Applied migration: `20260824041608_replace_hbnf_synthetic_provenance_fragments`.

The live `lr-sync-hbnf` Edge Function is parser version `hbnf-direct-v3`; GitHub main and the deployed function are aligned on this provenance behavior. Verification after deployment produced a healthy 32/32 manual run. Manual/test runs do not count toward the launch soak.

## Launch readiness
`lr_launch_readiness()` remains `ready=false` solely because the required real HBNF production soak has not accrued. First expected production date is 2026-08-24; at this verification point `daily_run_due=false`, `consecutive_healthy_days=0`, and no production run has yet counted.

Do not claim public-launch readiness until the real soak and remaining final launch gates pass.

## Source-control note
The migration was already live when post-handoff verification detected that GitHub main had briefly lagged the deployed state. Main was repaired to include the exact applied migration and corrected HBNF adapter source, then the adapter was redeployed from the aligned source.

## Automation reliability
The exact-hourly `Continue Local Roots` task remains the authorized continuation task, but scheduling reliability is not assumed from configuration state alone. It must be judged from observed post-handoff executions. The no-scraping/no-send/no-paid/no-destructive guardrails remain unchanged.
