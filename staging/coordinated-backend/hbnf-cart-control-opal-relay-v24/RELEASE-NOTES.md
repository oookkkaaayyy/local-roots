# hbnf-cart-control v23 → v24 scoped selector release

This is an exact-source preparation bundle for the currently active function, not an authorization to deploy.

## Base and rollback

- Project: `phcpbvuqibyarpfrftgx`
- Function: `hbnf-cart-control`
- Base: active version 23, function id `95df7773-e888-48c9-84b3-ceb517c901c7`
- Base bundle SHA-256: `716fff594b9de64aee2c3e3448bd1b683f42223ad32a17d7f24b82a458edfe45`
- Base `verify_jwt`: `false`; import map enabled.
- Exact rollback: restore the provider-retained v23 above and verify its identity/hash.

## Source changes

Only the existing `live_status` selector is corrected: populated Back 9 remains hidden until Front 9 is locked. The deployed `live.ts` receives the lock helper and corrected selector; `index.ts` adds `selectorVersion: "skins-front-lock-v1"` to the existing `live_status` response. The marker lets the Opal relay refuse old v23 responses safely.

All other function files are the read-only source returned by Supabase for active v23. This bundle intentionally preserves its Matrix projection GET route, guest-command authorization, CORS, dependencies, and existing POST behavior. It does not include the unrelated development-branch source changes.

## Validation and authority

The original v23 source metadata is in `SOURCE_BASE.json`. `MANIFEST.json` hashes each complete source file and marks only `index.ts` and `live.ts` as changed. Host tests execute this bundle's F9/B9 selector and assert the existing Matrix GET and POST routes remain present. Production deployment is not authorized by this preparation.
