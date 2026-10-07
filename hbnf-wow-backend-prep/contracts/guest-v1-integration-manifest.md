# Guest V1 integration manifest

Status: integrated offline in `hbnf-cart2-phase2-integration-20261006`; no live deployment or hardware mutation.

- Host/route: `https://hbnightflyers.com/guest/hbnf-cart/`, static Cloudflare worker root.
- Backend: existing Supabase `hbnf-cart-control` endpoint and its `hbnf_cart_get_context`, `hbnf_cart_commit_command_bridge`, and `hbnf-cart-reconcile` path.
- Guest Mode: canonical `guestMode` boolean, effective default false; owner toggle is a metadata-only canonical command protected by existing operator/paired-device authorization.
- Guest action allowlist: VIBE (four canonical values), VIBE_AUTO, NEXT, AUTO. Shared reducer semantics; no arbitrary type forwarding.
- Ordering: expected-revision check before commit; compare-and-commit is authoritative for races; stale conflict is returned without retry; no alternate dispatcher.
- Browser: static direct-function calls, publishable key only, `credentials: omit`, no login, guest identity, token persistence, ticket, cookie, or session infrastructure.
- UI: Vibe and Cart/fun controls only; no admin/release/deployment controls.
- Verification: `guest-command.test.mjs` exercises default-closed behavior, allowlist/reducer, stale revision, owner close, commit race, bridge/reconcile, and metadata-only authorization/targeting.

This supersedes the earlier session-cookie prep notes. The isolated `guest_v1.py` policy and old cookie-based guest mock page were removed from this branch; their Git history remains available on the source branch. Owner presentation choices, audio capture, and UV physical commissioning remain unfrozen/deferred. No live Supabase, Cloudflare, Matrix, AUX, or OTA mutation occurred.
