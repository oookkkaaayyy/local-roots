# Cart-local Owner gateway authentication origin v1.0.19

The v1.0.18 gateway CORS update admits the fixed Cart-local page origin, but the Lua Owner authentication layer still accepted only the public HTTPS Origin. This package adds `http://192.168.77.1` to that exact origin check. It preserves the paired 64-character Owner token requirement, revocation and expiry checks, all Matrix/AUX/WLED paths, and the public web origin. Unknown origins remain denied by the already-installed gateway CORS rule.

Only `/etc/hbnf-local-control/lua/auth.lua` changes. The installer verifies the exact 20-file live baseline, source-bound package, durable rollback, and one-time admission. It performs a read-only tokenless status request to confirm the local origin passes far enough to return `paired_owner_required` (401), confirms the public origin behaves the same, and confirms an unrelated origin is denied (403). It does not issue an AUX/UV command or change firmware, PWA, Matrix, or underglow.
