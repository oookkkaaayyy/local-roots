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
- ZIP SHA256: `0dc5163592d6a5a6dfa2ad883e46da399e1a267067d449a60e4085cea8f5b91d`
- Base64 SHA256: `6b4054fa08642c926bef4bec986235cd26b6f3af2bf5e3608fdede1cbf4e86b3`
- Regression: 32/32 PASS

Production publication still uses the authenticated Mac Wrangler static-worker path. Double-click `DEPLOY_HBNF_MATRIX_FULL_PWA.command` from the complete web-deploy package.


Cart UV preview candidate (source-only): separate Main/Short levels support Manual, fresh Matrix brightness, and verified WOW audio-energy preview through the fail-dark AUX policy. The controls do not actuate outputs; hardware and real music-response acceptance remain pending.
