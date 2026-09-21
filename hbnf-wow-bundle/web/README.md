# HBNF Matrix full PWA — WOW MAX v3

Canonical source authority for the full `/matrix.html` Home Screen console.

- Preserves the existing `/matrix.html` PWA identity and R2/WOW runtime compatibility.
- Phone UI is host-first and one-hand optimized with fixed HOST / TEXT / SHOWS / LOOKS / TUNE / MORE navigation.
- HOST keeps COURSE / FIELD MIX / SHOWCASE immediately reachable; legacy families remain under SHOWS.
- Bottom-nav taps automatically open collapsed detail sections and active-section highlighting follows scroll.
- Engine/audio diagnostics are collapsed by default on phone widths.
- Semantic quick events, custom text, individual looks, Fine Tune, System/Recovery, brightness controls, and feature-gated cart controls remain available.
- Release health uses the read-only `hbnf-release-doctor`.
- Firmware/preset installation is intentionally not exposed from the web UI.
- No Matrix-specific service worker is registered.

Verified source bundle:
- ZIP SHA256: `ad32a0e6e24c130c9b4ed831b2b4d1af9c009472fcdf57e74f8ff884eaf9bdcc`
- Base64 SHA256: `2399ce9c06377c10afdabe256365fe6ebc7013a2519ea565fe7af61b2586bd70`
- Regression: 30/30 PASS

Production publication still uses the authenticated Mac Wrangler static-worker path. Double-click `DEPLOY_HBNF_MATRIX_FULL_PWA.command` from the complete web-deploy package.
