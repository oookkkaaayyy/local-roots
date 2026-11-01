# HBNF P0 parent release driver — REVIEW ONLY

This code is deliberately incapable of live mutation. `createAuthenticatedReadAdapters()` contains read-only Cloudflare and Supabase provider calls; there are no Worker upload, Worker deployment, SQL migration, Edge deployment, permission-change, or restore methods. The saga engine accepts mutation adapters only when they self-identify as `testOnly`, for isolated mocked tests. It returns `*_NOT_ADMITTED` even after a complete mock sequence.

`preflight.mjs` accepts a complete immutable transaction JSON, obtains authenticated provider snapshots, compares all five exact target identities, re-downloads each bound source/candidate/rollback artifact and checks its size and SHA-256, then stores a PENDING preflight receipt through Google Drive with independent media download and byte/hash equality. It never changes the provider. Credentials are read only from `CLOUDFLARE_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`, and `GOOGLE_DRIVE_ACCESS_TOKEN`; values are never logged. The transaction binds the private evidence folder ID.

The transaction must include the exact PR source commit, downloaded-back source attestation, all five baselines and rollback artifacts, all seven stages and inverses, exact per-stage before/after/restore readback identities, the existing parent-gate contract, old-client disposition, Watch v14 compatibility evidence, and acceptance criteria with method and expected result. Admission remains PENDING by design. The existing contract requires old write permissions to be restored before Worker rollback; validation requires that final cutover stage to be last, and the saga reverses it first.

The file journal uses exclusive local one-time lock creation and fsync for every event. The Drive journal writes each event as a separate verified artifact but refuses to claim a run unless an atomic shared `claimOnce` provider is supplied; ordinary Drive file creation alone is not a replay-safe lock. An interrupted/replayed or mismatched run fails closed and requires review; it is not resumed automatically. No provider mutation or deployment admission is implemented or qualified by mock tests.

## Final revocation SQL staging (source only)

`supabase/migrations/20261029204700_hbnf_league_state_guarded_rpc_cutover.sql` is now **additive-only**: it defines and grants the guarded CAS RPC while leaving existing table UPDATE permissions intact, and preserves the installed `SET statement_timeout='8s'` on that function. Do not interpret its historical filename as authorization to revoke legacy clients early.

`scripts/hbnf-parent-release/sql/db-revoke-old-writes.sql` carries the final table-grant and policy revocation. It is deliberately **outside Supabase's automatic migrations directory**. Apply it only at the last stage of a separately admitted, readback-verified, coordinated five-target release; ensure the inverse restore of exact grants/policies is the first rollback stage, ahead of reverting the Worker. The current driver is read-only/mocked and cannot apply this SQL. Keeping these files separate is a source-safety improvement, **not** proof that a live multi-provider executor exists.

The source regression `tests/hbnf-write-authority-cutover.test.mjs` checks the real additive SQL and final contract artifact with `validateCutoverSql`. The review-only CI workflow runs this and the mocked release-driver tests. Full v48 integration, native replay against the combined package, old-client disposition, and admission remain pending.

Focused checks: `node --test tests/hbnf-parent-release-driver.test.mjs`.
