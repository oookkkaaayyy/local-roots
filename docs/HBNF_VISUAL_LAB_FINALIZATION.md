# HBNF Visual Lab — final cutover

The Visual Lab staging work is intentionally built so the renderer chat can finish independently.

When that renderer is physically accepted, the remaining software path is:

1. Freeze the exact accepted renderer SHA.
2. Call `hbnf-matrix-adapter-v4-staging` in dry-run mode. It must report `v4=true`, `generator=anti-repeat-v4`, and `projectionLink=frame-lock-v1`.
3. Change the Matrix target in the canonical reconciler from `hbnf-matrix-adapter` to `hbnf-matrix-adapter-v4-staging`. AUX remains on the existing AUX adapter because the V4 AUX firmware receives the Matrix-rendered HBNP frame directly.
4. Run automated canonical commands OFF → ON → NEXT → one TUNE and require Matrix+AUX observed revisions to converge after each.
5. Use the Phase 2 game-bridge build from this branch. Its owner-only route is `http://192.168.8.30/visual`.
6. Require bridge serial `VISUAL_STATUS` to report `HBNF_VISUAL_LAB_SELFTEST=PASS`.

No raw effect/preset/sx/ix tuning session is part of final cutover. No separate Matrix/AUX visual matching session is required: the self-test verifies exact Matrix Peek, HBNP source frames, AUX receiver activity, frame age, and sequence convergence.
