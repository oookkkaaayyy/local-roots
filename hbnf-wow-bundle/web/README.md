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
- ZIP SHA256: `a68efa5f253750c2c0466437eb94228897135657b3d12db1f239c6676ac496bf`
- Base64 SHA256: `b445a825942f11cecb14069c639d5462ea4c7b56b1fdd84fe66e65deecca0406`
- Regression: 33/33 PASS

Production publication still uses the authenticated Mac Wrangler static-worker path. Double-click `DEPLOY_HBNF_MATRIX_FULL_PWA.command` from the complete web-deploy package.


Cart UV control candidate (source-only): Main/Short sliders use the existing AUX request path with Manual, fresh Matrix brightness, and verified WOW audio-energy modes. The checked-in server profile and UV enable gate remain fail-closed, so the current response stays preview-only with zero output. If later verified hardware facts and commissioning gates enable the route, success reports MQTT broker acknowledgment only; device readback is separate. No package was deployed; hardware and physical acceptance remain pending.
