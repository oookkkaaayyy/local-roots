# HBNF scoring save recovery candidate

This candidate starts from the observed 44-asset capsule and includes the raw-state/realtime fix from baseline commit `4289e37e8d0b2864cb17451c5267dfab87a63a1d`. It deep-copies fetched `league_state.state_json`, records the raw revision baseline before normalization, and normalizes a separate working copy. This prevents the demonstrated false conflict caused by in-place normalization.

The additional reconnect correction retries the existing conditional save when browser `online` fires or Supabase Realtime resubscribes. It uses the existing revision check, stops on a detected conflict, retains local dirty state on failure, and clears it only after the update returns the row. It does not add a new persistence backend or alter scoring rules.

Focused mocked-provider tests cover row acknowledgment, stale revision conflict, lost acknowledgment/idempotent retry, offline edit recovery after reconnect, and supported week deletion with date/event-scoped Round Tags cleanup. They preserve the other root fields, historical scorecards, tag custody, stats, and backups. No real Supabase provider is contacted by these tests.

This remains a candidate. Read-only route parity is not deployment lineage, mocked provider tests are not server readback, the full source-input archive is not a Cloudflare-uploaded version, and no production deploy or iPhone/Matrix acceptance has occurred.
