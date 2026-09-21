HBNF MATRIX — WOW MAX V3 INSTALL-READY BUNDLE

Release: hbnf-wow-r3-max-2026-09-21-v3
Physical status: NOT INSTALLED. The Matrix remains on the proven R2 fallback until go-live.

NORMAL USER PATH
1. Use only GO_LIVE_WOW_MAX.command.
2. Keep the Mac on the same network as the Matrix and leave WLED/phone/Watch controls alone until the terminal reports PASS.
3. When prompted, unplug Matrix power and keep it off until the terminal says RESTORE POWER NOW.
4. The command automatically verifies the cold boot and prints one HBNF_GO_LIVE_PASS line.

GO_LIVE_WOW_MAX.command performs, in order:
- complete package checksum/preflight QA
- independent cloud release-doctor check
- Matrix-control release preflight
- exact Matrix discovery + safety checks
- exact backup + rollback pointer before mutation
- invisible preset staging with unrelated-preset preservation proof
- one R3 OTA reboot
- exact v3 runtime verification
- backend adoption only after live proofs
- guided >=5-second cold-power gate
- automatic cold-boot verification

Failure behavior:
- before firmware flash: exact pre-install presets + boot defaults are restored with no flash
- after R3 flash: reachable controller automatically recovers to exact proven R2 + pre-install presets/boot defaults
- manual ROLLBACK_TO_R2.command remains available

Firmware authority:
- witness run 35636799273 / artifact 10656563438
- SHA256 4d95c66341620077d311035877a20e133714075f87d65a77da0f49e2020ed3b2
- 1,357,904 bytes / 214,960-byte OTA headroom
- compile, byte-identical rebuild, six-hour soak, fuzz, ASan+UBSan, and runtime telemetry gates PASS

Final install artifact:
- Drive ID 1IjphyhNefuCCPO9fEHQQlX67Sh_xxuvz
- HBNF_WOW_MAX_V3_2026-09-21_FINAL.zip
- SHA256 bd5aaadfe4c765f4a9638c372c518a0b121ddaf555444a801db894c025457e30
- Drive raw re-fetch byte-identical PASS
- unzip + embedded package preflight PASS
- UI regression 29/29 PASS

Watch:
- backend controls are prepared on hbnf-watch-control v13 / hbnf-watch-score v10
- no plaintext credential is packaged
- final Apple Watch acceptance must be done on the real Watch after Matrix go-live

Aux/SP803E:
- hbnf-aux-control v1 and hbnf-cart-orchestrator v1 are prepared
- aux remains FEATURE-GATED OFF
- mixed loads remain rejected until physical wiring/current validation

Do not install any older R3/v1/v2 package. The file above is the sole current v3 install artifact.

WOW MAX is install-ready, not yet production-accepted. R2 remains the rollback until physical/visual/Watch acceptance passes.
