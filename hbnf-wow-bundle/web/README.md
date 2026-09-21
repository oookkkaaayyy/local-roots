# HBNF Matrix full PWA — WOW MAX v3

Canonical source for the full `/matrix.html` Home Screen console.

- Preserves the R2 Course Console layout and `/matrix.html` PWA identity.
- Runtime-aware: proven R2 before physical go-live; WOW MAX v3 after adoption.
- Semantic quick events use `quick_event`, not plain text.
- WOW scenes 61–88 surface only after WOW runtime is detected.
- Cart controls remain feature-gated by `hbnf-aux-control`; mixed-load GLOW LIVE stays locked until acceptance.
- Release health uses the read-only `hbnf-release-doctor`.
- Firmware/preset installation is intentionally not exposed from the web UI.
- No Matrix-specific service worker is registered; cache-busted assets update in place without changing manifest id/start_url.

Production deployment is still performed by the verified Wrangler static-worker path in `WEB_DEPLOY.command`; this source commit does not itself deploy or mutate the Matrix.
