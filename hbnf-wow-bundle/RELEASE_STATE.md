# HBNF Matrix WOW MAX v3 — verified install package checkpoint

Release: hbnf-wow-r3-max-2026-09-21-v3
Field status: NOT INSTALLED — current physical Matrix remains on the proven R2 fallback.

## Firmware authority
- Witness run: 35636799273
- Witness artifact: 10656563438
- Branch at witness: fb5df9816da754c9b90aaf93cfcdd012b42110c8
- WLED base: 16.0.1 / 29b389df1c1aaec6ff53aea742d17063b985906c
- WOW MAX firmware SHA256: 4d95c66341620077d311035877a20e133714075f87d65a77da0f49e2020ed3b2
- Firmware bytes: 1,357,904
- OTA headroom: 214,960 bytes
- Target compile / byte-identical rebuild / six-hour deterministic soak / randomized fuzz / ASan+UBSan / release telemetry: PASS

## Show contract
- 28 ANIMartRIX scenes: presets 61–88 under playlist 60
- 18-second holds / 1.2-second transitions / brightness 8
- AudioReactive inputLevel 255
- HBNFFlow disabled
- Profiles: bass, mid, balanced, treble, full, impact
- Styles: clean, punch, ring, spark, chroma, hybrid
- Semantic overlays: ACE, CTP, NICE SHOT, NICE PUTT, SKINS, GLOW
- Exact v3 scene release marker is committed on this branch.

## Production compatibility authority
- hbnf-matrix-control v141 · SHA256 8ff8398db14b1a0a2a1f4519705023adbe0cfd9b6d2de18ad07669688d272bb7
- hbnf-watch-control v13 · SHA256 3f8b60162db4f005eb24d85efaf777e9c1ee247d6d964d5012469d746b8326e6
- hbnf-watch-score v10 · SHA256 d59fe423f07232cd3b5e1af7716aebd854de63c470b3816dce3beed5d78e4073
- hbnf-cinematic-dispatcher v29 · SHA256 32a0237d13c7eba76689868e3a55557d176207c484a38aa31460330378a3c43b
- hbnf-matrix-ui v10 · SHA256 e5976f77d23707a9a07202fca7b43d80bb63438210fc8c75743e7dcb99019e96
- hbnf-release-doctor v4 · SHA256 e0f87230aff8ecc260608b682779b001f2e5401562de90da06a544517471659a
- hbnf-aux-control v1 · SHA256 c77472c66bb2cf246952e077b4a7b6fee7e86ab6f33960e68622c151481432c9
- hbnf-cart-orchestrator v1 · SHA256 9353bef7697e7bae9046f0f0eb7ef62a548701d23c8d3ed2bff2df37f69bb35d

Aux remains prepared but FEATURE-GATED OFF. mixedLoadAccepted=false pending physical SP803E/wiring acceptance.

## Final install artifact
- Drive ID: 1IjphyhNefuCCPO9fEHQQlX67Sh_xxuvz
- File: HBNF_WOW_MAX_V3_2026-09-21_FINAL.zip
- ZIP SHA256: bd5aaadfe4c765f4a9638c372c518a0b121ddaf555444a801db894c025457e30
- Size: 2,080,092 bytes
- Drive upload + raw re-fetch: byte-identical PASS
- unzip integrity: PASS
- embedded PACKAGE_PREFLIGHT after unzip: PASS
- 44-file internal SHA256SUMS gate: PASS
- UI regression: 29/29 PASS
- Runtime pointer/cache files excluded: PASS

The package itself contains the installer source, QA tests, current backend contract snapshot, exact witness firmware, exact R2 rollback firmware, and checksum inventory.

## One-pass transaction safety
- Single supported entry point: GO_LIVE_WOW_MAX.command
- Legacy INSTALL_WOW_MAX.command and VERIFY_AFTER_COLD_BOOT.command intentionally refuse, avoiding a second workflow path.
- Package checksums run before controller mutation.
- Independent hbnf-release-doctor go-live preflight and Matrix-control release_preflight both run before controller mutation.
- Process lock + caffeinate protect the one-pass run.
- Exact controller backup and rollback pointer are written before mutation.
- Presets 61–88 are staged file-only while unrelated presets (including 55) are preserved.
- Staging failure restores exact pre-install presets + prior boot defaults without flashing.
- One intended R3 OTA reboot occurs only after all pre-flash gates pass.
- Post-flash runtime verifies exact release/engine/inputLevel255/HBNFFlow disabled/playlist60/brightness8/effect/profile/style/amount and re-proves unrelated presets unchanged before backend adoption.
- Post-flash failure automatically restores exact presets/boot defaults and reflashes exact proven R2 when reachable.
- GO_LIVE then guides exactly one >=5-second cold-power cycle and automatically verifies cold boot.

## Remaining unavoidable physical/human gates
1. Run GO_LIVE_WOW_MAX.command while the Matrix is powered and on the same network.
2. Complete the one guided >=5-second cold power cycle.
3. Complete one consolidated music/visual/event/overlay/network acceptance review.
4. Complete real-device Apple Watch acceptance.
5. Separately complete SP803E/aux physical wiring/current validation before enabling aux or accepting mixed loads.

Until those gates pass, WOW MAX is install-ready but not an accepted production Matrix release. R2 remains the exact rollback.


## Post-freeze cloud hardening — 2026-09-21
The verified install ZIP remains byte-frozen and unchanged. Backward-compatible cloud services advanced after freeze:
- hbnf-watch-control v14 · b5461ddc8d8e4f69991f1f701c140bdf8a8f04a89b43f7c10049bc13de56b3c7
  - one centralized action list
  - Cart Showcase action added
  - GET CORS method declaration corrected
- hbnf-aux-control v2 · 3ef69a7ddd193d31c534572c102a613b7ca6f38e757de4b5100c3eee81da753e
  - UV OFF semantics explicitly documented as return-to-music preset 200
  - global ALL OFF remains distinct
  - read-only commissioning/self-test contract added
  - aux remains feature-gated OFF
- hbnf-cart-orchestrator v2 · ce868bf4bd1524a24b2887dd2e090d59264a16e27c96606ea488d72fb6926f49
  - global ALL OFF remains available even when aux is disabled
  - normal combined scenes now start Matrix first, then aux
  - if aux start fails after Matrix succeeds, partial state is explicit and Matrix is not unnecessarily rolled back
- hbnf-matrix-ui v11 · 6bf41a7cb58234787b727cf81c3b118eec937eeab8951b6b70472f7830faaa15
  - repaired fallback-console selector bugs that could stop initialization
  - added Cart Showcase control
  - build marker hbnf-fallback-wow-max-v3.1
- hbnf-release-doctor v6 · 6519993a19359aea139b5c238de381cb6b3d189605910c12215c08b5eee76558
  - now gates Watch Showcase, aux commissioning self-test, cart global-off safety, and fallback-console selector health

These changes do not alter firmware, presets, Matrix ownership, or the final ZIP. The installer’s live release-doctor gate will validate the newer compatible cloud contract at go-live.


## Full installed PWA source hardening — 2026-09-21
The full Home Screen/Cloudflare Matrix console is now separately identified from the Supabase fallback console.

Full PWA production identity:
- URL: https://hbnightflyers.com/matrix.html
- Last verified live build before this hardening: `hbnf-build-9.20.26-r2-course-v1`
- Last verified Cloudflare deployment before this hardening: `5496f99a-fa5f-442b-80c3-1482c26648b6`
- The full console remains production-R2 until the authenticated Cloudflare deploy described below succeeds.

New full-PWA source authority:
- Build marker: `hbnf-build-9.21.26-wow-max-v3-full`
- Canonical branch path: `hbnf-wow-bundle/web/`
- Exact tested source bundle ZIP SHA256: `90b29bc0c6a51515c552431c580b6753c0811b2503387b86faedeb18d513c017`
- Source bundle is preserved as five verified Base64 parts under `hbnf-wow-bundle/web/source-bundle/`, with reconstruction instructions and content-addressed readback evidence.
- Local JavaScript syntax PASS and full-PWA regression 25/25 PASS.
- PWA manifest id/start_url remain `/matrix.html`, so the existing iPhone Home Screen installation is expected to update in place; reinstall/re-add is not the normal upgrade path.

WOW v3 full-PWA hardening includes:
- runtime-aware R2 fallback / WOW MAX engine identification
- semantic ACE / NICE SHOT / NICE PUTT / CTP / SKINS / GLOW controls
- WOW scenes 61–88 surfaced only after WOW runtime detection
- WOW energy/pulse/profile/style diagnostics
- expert FX range through 255
- AudioReactive sensitivity default 255
- feature-gated Cart Lighting including Showcase
- mixed-load GLOW LIVE remains locked until physical aux acceptance
- stale browser-side library installation removed
- read-only release-doctor health check
- current cache-busting and no Matrix-specific service-worker registration

Publication state:
- NOT YET DEPLOYED to production Cloudflare from this chat.
- No Cloudflare connector, Wrangler session, Cloudflare credentials, or authenticated `hbnf-static-worker` project is available in this runtime.
- Existing authenticated deployment authority remains the user's Mac-side `hbnf-static-worker` project.
- `hbnf-wow-bundle/web/DEPLOY_FULL_PWA.command` is the prepared one-command publication path. It reconstructs and verifies the exact source bundle, reruns syntax + 25/25 tests, then invokes the guarded Wrangler deploy path with pre-deploy backup, dry-run, production parity verification, and automatic prior-web rollback on failure.
- This web deployment path does not flash firmware, change presets, or issue a Matrix-visible command.

CI:
- `.github/workflows/hbnf-matrix-full-pwa.yml` was added to reconstruct/hash-check/test the source bundle.
- At the first bounded post-commit check, no workflow run was yet returned. Do not claim a CI witness PASS unless a later run is actually observed.

Physical/install state remains unchanged:
- Physical Matrix remains on proven R2.
- Frozen WOW MAX v3 installer remains unchanged and valid.
