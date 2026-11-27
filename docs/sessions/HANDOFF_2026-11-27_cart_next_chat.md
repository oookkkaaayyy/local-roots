# Handoff for the next chat (2026-11-27)

Read first: docs/sessions/2026-11-26_g98_matrix_studio_handoff.md (this repo). Copy both into hbnf-site PROJECT_MEMORY/sessions when a branch there can be created (it was refused last session). Owner rules are in hbnf-site PROJECT_MEMORY/OWNER_RULES.md.

## Tasks, in order
1. Supabase outage (project phcpbvuqibyarpfrftgx, free Nano compute, CPU 100%, disk IO balance 0%). Cause: ~100k polling calls/day, mainly hbnf_cart_bridge_desired_v1 from the Opal bridge (work/opal_cartbridge/hbnf_cartbridge.lua; loop at the "cart-wait" curl, falls back to direct polling every 3 s), plus telemetry, job_poll, matrix_feed, oneoff_active. No deployed Cloudflare worker contains the long-poll code (searched all scripts in account e3bc6b78f1104fa0c2a01245084594cf). Cut polling to 15-30 s or add cheap change detection; keep remote control responsive. Verify with Supabase query_logs (edge_logs). No paid upgrade (owner rule). A project restart only helps briefly.
2. Round start bug: hbnf-site mc_v3/site/dash.js start(). The busy flag stays true forever if hbnf_oneoff_start never answers, so Start does nothing until a reload. Add a request timeout, reset busy, show an error toast, re-poll status. Test link: https://udisc.com/scorecards/scorecard_tyd76ody11g3fwtkdi1ey907 (round not tracked on 2026-11-27; owner skipped it).
3. Matrix: g102 flashed on Elite 192.168.77.10 (work/g102/). Rollback g96 work/g93/matrix_elite_g96.bin. Unverified with music and quiet room after g102. Music test: course music at 25% volume only; tell the owner the exact conditions first; cart all off after; underglow max in tests. Build: sandbox ~/b/W2, pio run -e hbnf_elite_slim2; IRAM is near full (small helpers only, noinline).
4. Layout Builder pad and basket merges ("8 mod" into 8 main, the two hanging near 9 merged, others to regular counterparts) in hbnf_studio_pins and hbnf_studio_state; verify before and after. Studio viewport fix shipped in PR 372 (re-add the home-screen icon if cached).

## Access notes
- Opal SSH only reachable on the home network: ssh -i $HOME/mnt/local-roots/work/opal_patch/keys/opal_id -o IdentitiesOnly=yes -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa root@192.168.77.1
- git push to local-roots works from a clone in the cloud container; hbnf-site branch creation was refused. Use GitHub MCP for merges (squash).
- Owner: Andrew. Formal short replies, no em dashes, start with "Done and ready for grading" or "Not done, not ready for grading", ration usage, no new monthly cost, no external communication.

## Access (read before asking the owner for anything)
- Do not request Mac folders first. Everything needed is in GitHub: clone oookkkaaayyy/local-roots and oookkkaaayyy/hbnf-site with the add_repo tool (access: push), then work in the clone. Mac folders are needed only for the Opal/Elite hardware steps, which are done when the owner is on the home network.
- If a tool or folder request is denied by the classifier, do not retry the same request or work around it. Do everything else that does not need it, then state the one specific request once. The owner approves by naming the exact repo or folder in chat (a blanket "approve everything" is not enough for the classifier).
