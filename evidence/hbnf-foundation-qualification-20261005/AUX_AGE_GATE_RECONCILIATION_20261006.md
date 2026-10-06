# Seq39 AUX projection-age gate reconciliation — 2026-10-06

## Result

The seq39 `auxProjectionAgeMs` sample was not an AUX receiver-age measurement. The exact seq39 source initializes `hbnfLastDdpSendMs` to zero and updates it only inside `hbnfPerfDdpEnd()`; the exported value is `millis() - hbnfLastDdpSendMs`. This is Matrix-side send-hook age, not WLED receiver freshness. It can therefore exceed the 1,000 ms gate while the AUX is receiving ordinary native WLED DDP.

The single post-fix read-only capture at `AUX_POSTFIX_READONLY_20261006.json` reports:

- Matrix is exact Release07 at `192.168.77.10`, MAC `70:4b:ca:5b:34:5c`.
- AUX is reachable at `192.168.77.11`, expected MAC, on, and WLED reports `live=true`, `lm=DDP`, `lip=192.168.77.10`.
- Andrew directly confirmed the underglow is physically working again.
- The separate `HBNFAUX` frame-lock diagnostics report no custom frame-lock packets/peer in this idle Matrix state (`liveActive=false`). This is retained as a diagnostic distinction and is not evidence that native WLED DDP is absent.

WLED's JSON API documentation defines `info.live` as currently receiving realtime data over UDP/E1.31, `info.lm` as the source mode, and `info.lip` as the source IP: https://github.com/wled/WLED-Docs/blob/main/docs/interfaces/json-api.md. The pinned Foundation execution template requires Matrix→AUX DDP, not the optional HBNF custom frame-lock subprotocol.

## Minimal offline correction

- `aux_projection_active` now means AUX WLED reports realtime DDP from the exact Matrix IP.
- Preserve HBNFAUX packet/peer/sequence/hello counters and exact custom receive age separately; mark custom age validity explicitly.
- Do not reject a native DDP run based on Matrix sender-hook age or an inactive optional frame-lock counter.
- Keep the catastrophic three-sample AUX stop and baseline stale-fraction gate, but apply them to native DDP active/source status.
- No firmware behavior, artifact, inventory, renderer, AUX bus, or physical state changed.

## Preserved evidence and validation

- Seq39 complete 28/28 sweep remains valid and is not repeated.
- Exact artifact and Release07 identities remain unchanged.
- Post-fix read-only capture and raw responses are hash-bound in `AUX_POSTFIX_READONLY_20261006.json`.
- Adapter, soak-audit, threshold-freeze, runner, and architecture regressions pass offline.
- No seq41 install or soak has started in this checkpoint.
