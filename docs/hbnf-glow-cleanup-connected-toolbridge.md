# HBNF Glow cleanup: connected-tool execution bridge (REVIEW_ONLY)

Controlling authority: [GitHub issue #115](https://github.com/oookkkaaayyy/local-roots/issues/115), source baseline `33ff65caeb609533b0a4eea634100a78fb34ec08`; independently recoverable checkpoint `checkpoint/hbnf-glow-toolbridge-base-20261102` at `67f766f118c8bda550d190c9718cb018907c9f2c`.

**This is not a live release plan or owner authorization.** Do not execute the Nov 3 cleanup unless the owner specifically confirms that the complete 3-team/9-score collection (including its non-test-named partner) is dispensable and approves the exact 4 temporary aliases, and the single #115 scoring mutation owner admits one new release. No observed live writes or claims were made for this bridge.

## Actual recovered runner contract

The existing `scripts/hbnf-glow-week-cleanup-runner.mjs` emits newline-delimited `{"type":"tool","id":N,"method":"mcp__codex_apps__...","args":{...}}` on stdout and awaits `{"id":N,"result":...}` on stdin. Its six accepted legacy methods are:

| Old runner method | Currently connected tool | Required response adaptation |
| --- | --- | --- |
| `supabase_execute_sql` | `mcp__Supabase__execute_sql` | Check outer provider failure; place the exact original bounded JSON under `content[0].text` |
| `github_create_file` | `mcp__GitHub__create_file` | `result.commit_sha` to `structuredContent.commit_sha`; exact one-use claim path only |
| `github_fetch_file` | `mcp__GitHub__fetch_file(encoding="base64")` | `result.content` to `structuredContent.content`; ref must be exact 40-char immutable commit |
| `google_drive_search` | `mcp__Google_Drive__search` | `result.results` to `structuredContent.results`; runner then wraps `structuredContent.files` |
| `google_drive_fetch` | `mcp__Google_Drive__fetch(download_raw_file=true,include_base64=true)` | `result.b64_string` to `structuredContent.b64_string` |
| `google_drive_upload_file` | `mcp__Google_Drive__upload_file` | **Not directly compatible.** Runner passes a local pathname while connector accepts only a provider-owned `file_uri`. An independently byte-attested materializer must supply the latter. No materializer is connected to this Chat. |

Full names use the prefixes shown in `scripts/hbnf-glow-cleanup-connected-toolbridge.mjs`. The dispatcher is **allowlisted**, validates exact project `phcpbvuqibyarpfrftgx`, repo `oookkkaaayyy/local-roots`, recovery folder `1mZWMyzLIKnSjBTP82-EfGOqktld17X84`, and SHA-pinned claim refs. The default is `REVIEW_ONLY`; SQL `DO` and all live receipt/claim changes fail without an explicitly admitted, per-operation authorization function.

## Supported invocation options and hard boundary

1. **Existing original Codex tool bridge, once explicitly admitted:** The original runner already targets `mcp__codex_apps__*` directly, accepts local secure temp files, and uses exact durable Drive download-back. This remains the only *previously supported* end-to-end runtime for that original source. There is no need to create another Codex worker now. Reuse the existing #115 scoring mutation owner if a future owner-approved release requires it.
2. **Connected Chat tools with this review adapter:** A tool-capable host must read the existing runner's stdout, pass each tool frame through `createHbnfCleanupConnectedBridge({connected,mode,authorizeLive,resolveFileUri}).dispatch(frame)`, and write its `{id,result}` response to runner stdin. It must preserve one-call-per-ID and fail closed on ambiguous claim or upload responses. **Chat's current tool executor cannot itself spawn and control that long-lived runner process**, and this connected Drive `upload_file` cannot transform a local pathname into a provider file reference. Therefore this mode **does not yet constitute a supported live invocation path**. Never cast the pathname to a `file_uri`, skip durable evidence, or substitute GitHub public commits for private recovery/receipts.
3. **Synthetic-only verification:** A test host injects *only* isolated in-memory Supabase, Drive, GitHub functions and a synthetic file-ref resolver. Run `node --test tests/hbnf-glow-cleanup-connected-toolbridge.test.mjs`. Its `SYNTHETIC` mode is test infrastructure, **not an authorization bypass to wire real connectors**. Focused CI [41548917217](https://github.com/oookkkaaayyy/local-roots/actions/runs/41548917217): 5/5 PASS. Does not repeat native PostgreSQL 13/13 or Cloudflare 13/13.

## Release conditions not satisfied

Exact source, target, backup and candidate must be fixed in a **new unique manifest**. Fresh native Postgres full-row and cleaned-state MD5, Matrix queue, tags, iPhone draft-preservation and owner-confirmed rehearsal-only scope are required. Then independent Drive download-back, one-time admission decision/claim, immediate pre-change fingerprint readback, guarded server-side CAS (never direct table UPDATE), independent queue/tag readback, same-manifest durable closeout, and conditional rollback (only on exact cleaned revision; never overwrite concurrent edits). Each production mutation belongs to **one** #115 scoring mutation owner.

**Status: BRIDGE_SOURCE_AND_SYNTHETIC_CONTRACT_PASS; CONNECTED_CHAT_LIVE_EXECUTION_BLOCKED_BY_LOCAL_FILE_TO_PROVIDER_FILE_URI_AND_RUNNER_PROCESS_HANDOFF.** Poller, Matrix and production scores unchanged.
